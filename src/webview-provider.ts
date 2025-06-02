import * as vscode from 'vscode';
import { RedditService } from './reddit-service';
import { StorageService } from './storage-service';
import { LLMService } from './llm-service';

export class RedditWebviewProvider {
    private panel: vscode.WebviewPanel | undefined;
    private storageService: StorageService;
    private llmService: LLMService | undefined;

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
                        vscode.window.showInformationMessage('Comment submission coming soon!');
                        break;
                        
                    case 'skipPost':
                        // TODO: Mark post as seen and show next
                        vscode.window.showInformationMessage('Skip functionality coming soon!');
                        break;
                        
                    case 'openPost':
                        vscode.env.openExternal(vscode.Uri.parse(message.url));
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );

        this.panel.onDidDispose(() => {
            this.panel = undefined;
        }, null, this.context.subscriptions);
    }

    private async sendCurrentSettings() {
        const settings = await this.storageService.getSettings();
        this.panel?.webview.postMessage({
            type: 'settings',
            data: settings
        });
    }

    private async loadPosts() {
        try {
            const settings = await this.storageService.getSettings();
            
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
        // ... (keep the same HTML content from the previous step)
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Supertabs</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    padding: 0;
                    margin: 0;
                    line-height: 1.5;
                }
                
                .container {
                    max-width: 900px;
                    margin: 0 auto;
                    padding: 20px;
                }
                
                .settings-section {
                    background-color: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 8px;
                    padding: 20px;
                    margin-bottom: 20px;
                }
                
                .section-title {
                    font-size: 16px;
                    font-weight: 600;
                    margin-bottom: 12px;
                    color: var(--vscode-foreground);
                }
                
                .input-group {
                    display: flex;
                    gap: 8px;
                    margin-bottom: 12px;
                }
                
                input[type="text"], textarea {
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 4px;
                    padding: 8px 12px;
                    font-size: 14px;
                    font-family: var(--vscode-font-family);
                    width: 100%;
                }
                
                input[type="text"]:focus, textarea:focus {
                    outline: none;
                    border-color: var(--vscode-focusBorder);
                }
                
                textarea {
                    min-height: 80px;
                    resize: vertical;
                }
                
                button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 8px 16px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                    white-space: nowrap;
                }
                
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                
                .subreddit-list {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                    margin-top: 8px;
                }
                
                .subreddit-tag {
                    background-color: var(--vscode-badge-background);
                    color: var(--vscode-badge-foreground);
                    padding: 4px 12px;
                    border-radius: 12px;
                    font-size: 13px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                
                .remove-btn {
                    cursor: pointer;
                    opacity: 0.7;
                    font-size: 16px;
                    line-height: 1;
                }
                
                .remove-btn:hover {
                    opacity: 1;
                }
                
                .posts-section {
                    margin-top: 20px;
                }
                
                .loading {
                    text-align: center;
                    padding: 40px;
                    color: var(--vscode-descriptionForeground);
                }
                
                .post-card {
                    background-color: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 8px;
                    padding: 20px;
                    margin-bottom: 16px;
                }
                
                .post-title {
                    font-size: 16px;
                    font-weight: 500;
                    margin-bottom: 8px;
                    color: var(--vscode-textLink-foreground);
                }
                
                .post-meta {
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                    margin-bottom: 12px;
                }
                
                .post-content {
                    font-size: 14px;
                    margin-bottom: 16px;
                    color: var(--vscode-foreground);
                    max-height: 200px;
                    overflow-y: auto;
                }
                
                .comment-section {
                    border-top: 1px solid var(--vscode-panel-border);
                    padding-top: 16px;
                }
                
                .comment-actions {
                    display: flex;
                    gap: 8px;
                    margin-top: 8px;
                }
                
                .submit-btn {
                    background-color: var(--vscode-button-background);
                }
                
                .skip-btn {
                    background-color: transparent;
                    color: var(--vscode-foreground);
                    border: 1px solid var(--vscode-panel-border);
                }
                
                .skip-btn:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
                
                .help-text {
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                    margin-top: 4px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <!-- Subreddit Management -->
                <div class="settings-section">
                    <div class="section-title">Tracked Subreddits</div>
                    <div class="input-group">
                        <input type="text" id="subredditInput" placeholder="Enter subreddit name (e.g., webdev)">
                        <button onclick="addSubreddit()">Add</button>
                    </div>
                    <div class="subreddit-list" id="subredditList">
                        <!-- Subreddits will be displayed here -->
                    </div>
                </div>
                
                <!-- Business Prompt -->
                <div class="settings-section">
                    <div class="section-title">Your Business/Interests</div>
                    <textarea id="businessPrompt" placeholder="Describe your business, products, or expertise. This helps filter relevant posts where you can add value..."></textarea>
                    <div class="help-text">This prompt helps the AI identify posts relevant to your expertise</div>
                    <button onclick="savePrompt()" style="margin-top: 8px;">Save Prompt</button>
                </div>
                
                <!-- Posts -->
                <div class="posts-section">
                    <div class="section-title">Relevant Posts</div>
                    <div id="postsContainer">
                        <div class="loading">No posts loaded yet. Settings will auto-save and posts will refresh soon...</div>
                    </div>
                </div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                let currentSettings = { subreddits: [], businessPrompt: '' };
                
                // Initialize
                vscode.postMessage({ command: 'ready' });
                
                // Listen for messages
                window.addEventListener('message', event => {
                    const message = event.data;
                    
                    switch (message.type) {
                        case 'settings':
                            currentSettings = message.data;
                            updateUI();
                            break;
                        case 'posts':
                            displayPosts(message.data);
                            break;
                        case 'error':
                            showError(message.message);
                            break;
                    }
                });
                
                function updateUI() {
                    // Update subreddit list
                    const listEl = document.getElementById('subredditList');
                    listEl.innerHTML = currentSettings.subreddits.map(sub => 
                        \`<div class="subreddit-tag">
                            r/\${sub}
                            <span class="remove-btn" onclick="removeSubreddit('\${sub}')">×</span>
                        </div>\`
                    ).join('');
                    
                    // Update prompt
                    document.getElementById('businessPrompt').value = currentSettings.businessPrompt || '';
                }
                
                function addSubreddit() {
                    const input = document.getElementById('subredditInput');
                    const subreddit = input.value.trim().toLowerCase().replace(/^r\\//, '');
                    
                    if (subreddit && !currentSettings.subreddits.includes(subreddit)) {
                        vscode.postMessage({ 
                            command: 'addSubreddit', 
                            subreddit: subreddit 
                        });
                        input.value = '';
                    }
                }
                
                function removeSubreddit(subreddit) {
                    vscode.postMessage({ 
                        command: 'removeSubreddit', 
                        subreddit: subreddit 
                    });
                }
                
                function savePrompt() {
                    const prompt = document.getElementById('businessPrompt').value;
                    vscode.postMessage({ 
                        command: 'updatePrompt', 
                        prompt: prompt 
                    });
                }
                
                function displayPosts(posts) {
                    const container = document.getElementById('postsContainer');
                    
                    if (posts.length === 0) {
                        container.innerHTML = '<div class="loading">No relevant posts found. Try adjusting your prompt or adding more subreddits.</div>';
                        return;
                    }
                    
                    // For now, just show the first post (we'll make this a stack later)
                    const post = posts[0];
                    container.innerHTML = \`
                        <div class="post-card">
                            <div class="post-title">\${escapeHtml(post.title)}</div>
                            <div class="post-meta">r/\${post.subreddit} • by u/\${post.author} • \${getTimeAgo(post.created_utc)}</div>
                            <div class="post-content">\${escapeHtml(post.selftext || 'No text content')}</div>
                            <div class="comment-section">
                                <textarea id="commentText" placeholder="Write your comment..."></textarea>
                                <div class="comment-actions">
                                    <button class="submit-btn" onclick="submitComment('\${post.id}')">Submit Comment</button>
                                    <button class="skip-btn" onclick="skipPost('\${post.id}')">Skip</button>
                                </div>
                            </div>
                        </div>
                    \`;
                }
                
                function submitComment(postId) {
                    const comment = document.getElementById('commentText').value;
                    if (comment.trim()) {
                        vscode.postMessage({ 
                            command: 'submitComment', 
                            postId: postId,
                            comment: comment 
                        });
                    }
                }
                
                function skipPost(postId) {
                    vscode.postMessage({ 
                        command: 'skipPost', 
                        postId: postId 
                    });
                }
                
                function showError(message) {
                    document.getElementById('postsContainer').innerHTML = 
                        \`<div class="loading" style="color: var(--vscode-errorForeground);">\${message}</div>\`;
                }
                
                function escapeHtml(text) {
                    const div = document.createElement('div');
                    div.textContent = text || '';
                    return div.innerHTML;
                }
                
                function getTimeAgo(timestamp) {
                    const seconds = Math.floor(Date.now() / 1000 - timestamp);
                    
                    if (seconds < 60) return 'just now';
                    if (seconds < 3600) return Math.floor(seconds / 60) + ' min ago';
                    if (seconds < 86400) return Math.floor(seconds / 3600) + ' hours ago';
                    return Math.floor(seconds / 86400) + ' days ago';
                }
                
                // Add enter key support for subreddit input
                document.getElementById('subredditInput').addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        addSubreddit();
                    }
                });
            </script>
        </body>
        </html>`;
    }
}