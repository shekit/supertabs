import * as vscode from 'vscode';
import { RedditService } from './reddit-service';

export class RedditWebviewProvider {
    private panel: vscode.WebviewPanel | undefined;

    constructor(
        private context: vscode.ExtensionContext,
        private redditService: RedditService
    ) {}

    public async show() {
        // If panel already exists, show it
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        // Create new panel
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

        // Set icon
        this.panel.iconPath = {
            light: vscode.Uri.joinPath(this.context.extensionUri, 'media', 'reddit-icon.svg'),
            dark: vscode.Uri.joinPath(this.context.extensionUri, 'media', 'reddit-icon.svg')
        };

        // Set HTML content
        this.panel.webview.html = this.getWebviewContent();

        // Handle messages from webview
        this.panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'ready':
                        console.log('Webview is ready');
                        await this.loadInitialData();
                        break;
                    case 'refresh':
                        await this.loadInitialData();
                        break;
                    case 'openPost':
                        vscode.env.openExternal(vscode.Uri.parse(message.url));
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );

        // Clean up when panel is closed
        this.panel.onDidDispose(() => {
            this.panel = undefined;
        }, null, this.context.subscriptions);
    }

    private async loadInitialData() {
        try {
            // Test with a default subreddit
            const posts = await this.redditService.getSubredditPosts('programming', 'hot', 10);
            
            // Send posts to webview
            this.panel?.webview.postMessage({
                type: 'posts',
                data: posts
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
                }
                
                .header {
                    position: sticky;
                    top: 0;
                    background-color: var(--vscode-editor-background);
                    border-bottom: 1px solid var(--vscode-panel-border);
                    padding: 16px;
                    z-index: 100;
                }
                
                .posts-container {
                    padding: 16px;
                    max-width: 800px;
                    margin: 0 auto;
                }
                
                .post {
                    background-color: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                    padding: 16px;
                    margin-bottom: 12px;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                
                .post:hover {
                    border-color: var(--vscode-focusBorder);
                    transform: translateY(-1px);
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
                    margin-bottom: 8px;
                }
                
                .post-stats {
                    font-size: 14px;
                    display: flex;
                    gap: 16px;
                }
                
                .refresh-button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 8px 16px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                }
                
                .refresh-button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                
                .loading {
                    text-align: center;
                    padding: 40px;
                    color: var(--vscode-descriptionForeground);
                }
                
                .error {
                    text-align: center;
                    padding: 40px;
                    color: var(--vscode-errorForeground);
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Supertabs Reddit Feed</h1>
                <button class="refresh-button" onclick="refresh()">Refresh</button>
            </div>
            <div class="posts-container" id="posts">
                <div class="loading">Loading posts...</div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                
                // Tell extension we're ready
                vscode.postMessage({ command: 'ready' });
                
                // Listen for messages from extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    
                    switch (message.type) {
                        case 'posts':
                            displayPosts(message.data);
                            break;
                        case 'error':
                            showError(message.message);
                            break;
                    }
                });
                
                function displayPosts(posts) {
                    const container = document.getElementById('posts');
                    
                    if (posts.length === 0) {
                        container.innerHTML = '<div class="loading">No posts found</div>';
                        return;
                    }
                    
                    container.innerHTML = posts.map(post => \`
                        <div class="post" onclick="openPost('\${post.permalink}')">
                            <div class="post-title">\${escapeHtml(post.title)}</div>
                            <div class="post-meta">
                                r/\${post.subreddit} • posted by u/\${post.author} • \${getTimeAgo(post.created_utc)}
                            </div>
                            <div class="post-stats">
                                <span>🔥 \${post.score} points</span>
                                <span>💬 \${post.num_comments} comments</span>
                                \${post.link_flair_text ? \`<span>🏷️ \${escapeHtml(post.link_flair_text)}</span>\` : ''}
                            </div>
                        </div>
                    \`).join('');
                }
                
                function showError(message) {
                    document.getElementById('posts').innerHTML = \`<div class="error">\${message}</div>\`;
                }
                
                function refresh() {
                    document.getElementById('posts').innerHTML = '<div class="loading">Loading posts...</div>';
                    vscode.postMessage({ command: 'refresh' });
                }
                
                function openPost(url) {
                    vscode.postMessage({ command: 'openPost', url: url });
                }
                
                function escapeHtml(text) {
                    const div = document.createElement('div');
                    div.textContent = text;
                    return div.innerHTML;
                }
                
                function getTimeAgo(timestamp) {
                    const seconds = Math.floor(Date.now() / 1000 - timestamp);
                    
                    if (seconds < 60) return 'just now';
                    if (seconds < 3600) return Math.floor(seconds / 60) + ' min ago';
                    if (seconds < 86400) return Math.floor(seconds / 3600) + ' hours ago';
                    return Math.floor(seconds / 86400) + ' days ago';
                }
            </script>
        </body>
        </html>`;
    }
}