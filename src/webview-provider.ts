import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { RedditService } from './reddit-service';
import { StorageService } from './storage-service';
import { LLMService } from './llm-service';
import { APP, COMMANDS, MESSAGES, PATHS, RESOURCES, UI_TEXT } from './constants/constants';

export class RedditWebviewProvider {
    private panel: vscode.WebviewPanel | undefined;
    private storageService: StorageService;
    private llmService: LLMService | undefined;
    private refreshTimer: NodeJS.Timeout | undefined;
    private nextRefreshTime: number = 0;

    constructor(
        private context: vscode.ExtensionContext,
        private redditService: RedditService
    ) {
        this.storageService = new StorageService(context);
        
        try {
            this.llmService = new LLMService();
        } catch (error) {
            console.error('Failed to initialize LLM service:', error);
            vscode.window.showErrorMessage('Claude API key not found. Posts will not be filtered.');
        }
    }

    public async show() {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            APP.PANEL_ID,
            APP.NAME,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.context.extensionUri, PATHS.MEDIA),
                    vscode.Uri.joinPath(this.context.extensionUri, PATHS.WEBVIEW),
                    vscode.Uri.joinPath(this.context.extensionUri, PATHS.DIST)
                ]
            }
        );

        this.panel.iconPath = {
            light: vscode.Uri.joinPath(this.context.extensionUri, PATHS.MEDIA, RESOURCES.ICONS.REDDIT),
            dark: vscode.Uri.joinPath(this.context.extensionUri, PATHS.MEDIA, RESOURCES.ICONS.REDDIT)
        };

        this.panel.webview.html = this.getWebviewContent();

        // Handle messages from webview
        this.panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case COMMANDS.WEBVIEW.READY:
                        console.log('Webview is ready');
                        await this.sendCurrentSettings();
                        await this.loadPosts();
                        break;
                        
                    case COMMANDS.WEBVIEW.ADD_SUBREDDIT:
                        await this.storageService.addSubreddit(message.subreddit);
                        await this.sendCurrentSettings();
                        await this.loadPosts();
                        vscode.window.showInformationMessage(`Added r/${message.subreddit}`);
                        break;
                        
                    case COMMANDS.WEBVIEW.REMOVE_SUBREDDIT:
                        await this.storageService.removeSubreddit(message.subreddit);
                        await this.sendCurrentSettings();
                        await this.loadPosts();
                        break;
                        
                    case COMMANDS.WEBVIEW.UPDATE_PROMPT:
                        await this.storageService.updateSettings({ businessPrompt: message.prompt });
                        vscode.window.showInformationMessage(UI_TEXT.NOTIFICATIONS.PROMPT_SAVED);
                        await this.loadPosts();
                        break;
                        
                    case COMMANDS.WEBVIEW.SUBMIT_COMMENT:
                        await this.handleCommentSubmission(message.postId, message.comment);
                        break;
                        
                    case COMMANDS.WEBVIEW.SKIP_POST:
                        await this.handleSkipPost(message.postId);
                        break;
                        
                    case COMMANDS.WEBVIEW.OPEN_POST:
                        vscode.env.openExternal(vscode.Uri.parse(message.url));
                        break;

                    case COMMANDS.WEBVIEW.UPDATE_REFRESH_INTERVAL:
                        await this.storageService.updateSettings({ 
                            refreshInterval: message.interval 
                        });
                        vscode.window.showInformationMessage(
                            `Refresh interval updated to ${message.interval} seconds`
                        );
                        await this.startAutoRefresh();
                        break;

                    case COMMANDS.WEBVIEW.REFRESH:
                        await this.loadPosts();
                        break;

                    default:
                        console.warn(`Unknown command from webview: ${message.command}`);
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );

        this.startAutoRefresh();

        this.panel.onDidDispose(() => {
            this.stopAutoRefresh();
            this.panel = undefined;
        }, null, this.context.subscriptions);
    }

    private async handleCommentSubmission(postId: string, comment: string) {
        try {
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Posting comment to Reddit...",
                cancellable: false
            }, async () => {
                const success = await this.redditService.postComment(postId, comment);
                
                if (success) {
                    await this.storageService.markPostProcessed(postId);
                    vscode.window.showInformationMessage(UI_TEXT.NOTIFICATIONS.COMMENT_SUCCESS);
                    this.showNextPost();
                } else {
                    vscode.window.showErrorMessage(UI_TEXT.NOTIFICATIONS.COMMENT_FAILED);
                }
            });
        } catch (error) {
            console.error('Comment submission error:', error);
            vscode.window.showErrorMessage('Error posting comment');
        }
    }

    private async handleSkipPost(postId: string) {
        await this.storageService.markPostProcessed(postId);
        this.showNextPost();
    }

    private showNextPost() {
        this.loadPosts();
    }

    private async sendCurrentSettings() {
        const settings = await this.storageService.getSettings();
        this.panel?.webview.postMessage({
            type: MESSAGES.TYPE.SETTINGS,
            data: settings
        });
    }

    private sendRefreshStatus() {
        this.panel?.webview.postMessage({
            type: MESSAGES.TYPE.REFRESH_STATUS,
            nextRefresh: this.nextRefreshTime
        });
    }

    private getWebviewContent(): string {
        const webview = this.panel!.webview;
        
        const htmlPath = path.join(this.context.extensionPath, PATHS.WEBVIEW, RESOURCES.WEBVIEW.HTML);
        const stylePath = vscode.Uri.joinPath(this.context.extensionUri, PATHS.WEBVIEW, RESOURCES.WEBVIEW.STYLES);
        const scriptPath = vscode.Uri.joinPath(this.context.extensionUri, PATHS.WEBVIEW, RESOURCES.WEBVIEW.SCRIPT);
        
        const styleUri = webview.asWebviewUri(stylePath);
        const scriptUri = webview.asWebviewUri(scriptPath);
        
        let html = fs.readFileSync(htmlPath, 'utf8');
        
        html = html.replace('${styleUri}', styleUri.toString());
        html = html.replace('${scriptUri}', scriptUri.toString());
        
        return html;
    }

    private async loadPosts() {
        try {
            const settings = await this.storageService.getSettings();
            const processedPosts = await this.storageService.getProcessedPosts();
            
            if (settings.subreddits.length === 0) {
                this.panel?.webview.postMessage({
                    type: MESSAGES.TYPE.POSTS,
                    data: []
                });
                return;
            }

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Loading and filtering posts...",
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: "Fetching posts from Reddit..." });
                
                const allPosts = await this.redditService.getMultipleSubreddits(settings.subreddits);
                const unseenPosts = allPosts.filter(post => !processedPosts.includes(post.id));
                
                console.log(`Fetched ${allPosts.length} posts, ${unseenPosts.length} are new`);
                
                progress.report({ increment: 50, message: "Analyzing posts with AI..." });
                
                let filteredPosts = unseenPosts;
                if (this.llmService && settings.businessPrompt) {
                    filteredPosts = await this.llmService.filterPosts(unseenPosts, settings.businessPrompt);
                    
                    vscode.window.showInformationMessage(
                        `Found ${filteredPosts.length} relevant posts out of ${unseenPosts.length} unseen posts`
                    );
                }
                
                this.panel?.webview.postMessage({
                    type: MESSAGES.TYPE.POSTS,
                    data: filteredPosts.slice(0, 10)
                });
            });

        } catch (error) {
            console.error('Failed to load posts:', error);
            this.panel?.webview.postMessage({
                type: MESSAGES.TYPE.ERROR,
                message: 'Failed to load posts. Please check your authentication.'
            });
        }
    }

    private async startAutoRefresh() {
        this.stopAutoRefresh();
        
        const settings = await this.storageService.getSettings();
        const intervalMs = settings.refreshInterval * 1000;
        
        this.nextRefreshTime = Date.now() + intervalMs;
        this.sendRefreshStatus();
        
        console.log(`Starting auto-refresh every ${settings.refreshInterval} seconds`);
        
        this.refreshTimer = setInterval(async () => {
            if (this.panel) {
                console.log('Auto-refreshing posts...');
                await this.loadPosts();
                
                this.nextRefreshTime = Date.now() + intervalMs;
                this.sendRefreshStatus();
            }
        }, intervalMs);
    }

    private stopAutoRefresh() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = undefined;
            console.log('Stopped auto-refresh');
        }
    }
}