import * as vscode from 'vscode';
import { RedditService } from './reddit-service';
import { StorageService } from './storage-service';
import { LLMService } from './llm-service';
import * as fs from 'fs';
import * as path from 'path';

export class RedditWebviewProvider {
    private panel: vscode.WebviewPanel | undefined;
    private storageService: StorageService;
    private llmService: LLMService | undefined;
    private refreshTimer: NodeJS.Timeout | undefined;

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
            'supertabs.redditFeed',
            'Supertabs',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.context.extensionUri, 'media'),
                    vscode.Uri.joinPath(this.context.extensionUri, 'webview'),
                    vscode.Uri.joinPath(this.context.extensionUri, 'dist')
                ]
            }
        );

        this.panel.iconPath = {
            light: vscode.Uri.joinPath(this.context.extensionUri, 'media', 'reddit-icon.svg'),
            dark: vscode.Uri.joinPath(this.context.extensionUri, 'media', 'reddit-icon.svg')
        };

        this.panel.webview.html = this.getWebviewContent();

        // Handle messages from webview
        this.panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'ready':
                        console.log('Webview is ready');
                        await this.sendCurrentSettings();
                        await this.loadPosts();
                        break;
                        
                    case 'addSubreddit':
                        await this.storageService.addSubreddit(message.subreddit);
                        await this.sendCurrentSettings();
                        await this.loadPosts();
                        vscode.window.showInformationMessage(`Added r/${message.subreddit}`);
                        break;
                        
                    case 'removeSubreddit':
                        await this.storageService.removeSubreddit(message.subreddit);
                        await this.sendCurrentSettings();
                        await this.loadPosts();
                        break;
                        
                    case 'updatePrompt':
                        await this.storageService.updateSettings({ businessPrompt: message.prompt });
                        vscode.window.showInformationMessage('Business prompt saved!');
                        // Reload posts with new filtering
                        await this.loadPosts();
                        break;
                        
                    case 'submitComment':
                        // TODO: Implement comment submission
                        await this.handleCommentSubmission(message.postId, message.comment);
                        break;
                        
                    case 'skipPost':
                        // TODO: Mark post as seen and show next
                        await this.handleSkipPost(message.postId);
                        break;
                        
                    case 'openPost':
                        vscode.env.openExternal(vscode.Uri.parse(message.url));
                        break;

                    case 'updateRefreshInterval':
                        await this.storageService.updateSettings({ 
                            refreshInterval: message.interval 
                        });
                        vscode.window.showInformationMessage(
                            `Refresh interval updated to ${message.interval} seconds`
                        );
                        // Restart timer with new interval
                        await this.startAutoRefresh();
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

    private async startAutoRefresh() {
        // Clear any existing timer
        this.stopAutoRefresh();
        
        const settings = await this.storageService.getSettings();
        const intervalMs = settings.refreshInterval * 1000; // Convert seconds to ms
        
        console.log(`Starting auto-refresh every ${settings.refreshInterval} seconds`);
        
        // Set up the interval
        this.refreshTimer = setInterval(async () => {
            if (this.panel) {
                console.log('Auto-refreshing posts...');
                await this.loadPosts();
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

    private async sendCurrentSettings() {
        const settings = await this.storageService.getSettings();
        this.panel?.webview.postMessage({
            type: 'settings',
            data: settings
        });
    }

    private async handleCommentSubmission(postId: string, comment: string) {
        try {
            // Show progress
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Posting comment to Reddit...",
                cancellable: false
            }, async () => {
                // Post the comment
                const success = await this.redditService.postComment(postId, comment);
                
                if (success) {
                    // Mark post as processed
                    await this.storageService.markPostProcessed(postId);
                    
                    // Show success message
                    vscode.window.showInformationMessage('Comment posted successfully!');
                    
                    // Load next post
                    this.showNextPost();
                } else {
                    vscode.window.showErrorMessage('Failed to post comment. Please try again.');
                }
            });
        } catch (error) {
            console.error('Comment submission error:', error);
            vscode.window.showErrorMessage('Error posting comment');
        }
    }

    private async handleSkipPost(postId: string) {
        // Mark as processed without commenting
        await this.storageService.markPostProcessed(postId);
        this.showNextPost();
    }

    private showNextPost() {
        // Reload posts (this will naturally exclude processed posts)
        this.loadPosts();
    }

    private async loadPosts() {
        try {
            const settings = await this.storageService.getSettings();
            const processedPosts = await this.storageService.getProcessedPosts();
            
            if (settings.subreddits.length === 0) {
                this.panel?.webview.postMessage({
                    type: 'posts',
                    data: []
                });
                return;
            }

            // Show loading state
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Loading and filtering posts...",
                cancellable: false
            }, async (progress) => {
                // Update progress
                progress.report({ increment: 0, message: "Fetching posts from Reddit..." });
                
                // Fetch posts from all subreddits
                const allPosts = await this.redditService.getMultipleSubreddits(settings.subreddits);
                const unseenPosts = allPosts.filter(post => !processedPosts.includes(post.id));
                
                // Update progress
                progress.report({ increment: 50, message: "Analyzing posts with AI..." });
                
                // Filter posts through LLM if available and prompt is set
                let filteredPosts = allPosts;
                if (this.llmService && settings.businessPrompt) {
                    filteredPosts = await this.llmService.filterPosts(allPosts, settings.businessPrompt);
                    
                    // Show filtering results
                    vscode.window.showInformationMessage(
                        `Found ${filteredPosts.length} relevant posts out of ${allPosts.length} total`
                    );
                }
                
                // Send filtered posts to webview
                this.panel?.webview.postMessage({
                    type: 'posts',
                    data: filteredPosts.slice(0, 10) // Limit to 10 for now
                });
            });

        } catch (error) {
            console.error('Failed to load posts:', error);
            this.panel?.webview.postMessage({
                type: 'error',
                message: 'Failed to load posts. Please check your authentication.'
            });
        }
    }

    private getWebviewContent(): string {
        const webview = this.panel!.webview;
        
        // Get paths to resources
        const htmlPath = path.join(this.context.extensionPath, 'webview', 'index.html');
        const stylePath = vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'styles.css');
        const scriptPath = vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'script.js');
        
        // Convert to webview URIs
        const styleUri = webview.asWebviewUri(stylePath);
        const scriptUri = webview.asWebviewUri(scriptPath);
        
        // Read HTML file
        let html = fs.readFileSync(htmlPath, 'utf8');
        
        // Replace placeholders with actual URIs
        html = html.replace('${styleUri}', styleUri.toString());
        html = html.replace('${scriptUri}', scriptUri.toString());
        
        return html;
    }

}