import * as vscode from 'vscode';
import { RedditAuthProvider } from './auth';
import { RedditService } from './reddit-service';
import { RedditWebviewProvider } from './webview-provider';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { COMMANDS, PATHS, ENV_VARS, UI_TEXT } from './constants/constants';

dotenv.config({ path: PATHS.ENV });


export function activate(context: vscode.ExtensionContext) {
    console.log('Supertabs is now active!');
    
    const authProvider = new RedditAuthProvider(context);
	const redditService = new RedditService(context, authProvider);
	const webviewProvider = new RedditWebviewProvider(context, redditService);
    
    // Register authenticate command
    let authenticateCommand = vscode.commands.registerCommand(COMMANDS.EXTENSION.AUTHENTICATE, async () => {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Authenticating with Reddit...",
            cancellable: false
        }, async (progress) => {
            const success = await authProvider.authenticate();
            
            if (success) {
                vscode.window.showInformationMessage(UI_TEXT.NOTIFICATIONS.AUTH_SUCCESS);
                await redditService.testConnection();
            } else {
                vscode.window.showErrorMessage(UI_TEXT.NOTIFICATIONS.AUTH_FAILED);
            }
        });
    });

	let testFetchCommand = vscode.commands.registerCommand(COMMANDS.EXTENSION.TEST_FETCH, async () => {
        const token = await authProvider.getAccessToken();
        if (!token) {
            vscode.window.showErrorMessage('Please authenticate first!');
            return;
        }

        const subreddit = await vscode.window.showInputBox({
            prompt: 'Enter subreddit name (without r/)',
            value: 'programming'
        });

        if (!subreddit) return;

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Fetching posts from r/${subreddit}...`,
            cancellable: false
        }, async () => {
            try {
                const posts = await redditService.getSubredditPosts(subreddit);
                
                const selected = await vscode.window.showQuickPick(
                    posts.map(post => ({
                        label: post.title,
                        description: `${post.score} points • ${post.num_comments} comments • by ${post.author}`,
                        post: post
                    })),
                    {
                        placeHolder: 'Select a post to open'
                    }
                );

                if (selected) {
                    vscode.env.openExternal(vscode.Uri.parse(selected.post.permalink));
                }
            } catch (error) {
                vscode.window.showErrorMessage('Failed to fetch posts');
            }
        });
    });

	let openFeedCommand = vscode.commands.registerCommand(COMMANDS.EXTENSION.OPEN_FEED, async () => {
        const token = await authProvider.getAccessToken();
        if (!token) {
            const choice = await vscode.window.showWarningMessage(
                'You need to authenticate with Reddit first',
                'Authenticate'
            );
            if (choice === 'Authenticate') {
                await vscode.commands.executeCommand(COMMANDS.EXTENSION.AUTHENTICATE);
            }
            return;
        }
        
        await webviewProvider.show();
    });

	let logoutCommand = vscode.commands.registerCommand(COMMANDS.EXTENSION.LOGOUT, async () => {
        await authProvider.logout();
        vscode.window.showInformationMessage('Logged out of Reddit');
    });

	context.subscriptions.push(
        authenticateCommand, 
        testFetchCommand, 
        openFeedCommand,
        logoutCommand
    );
}

export function deactivate() {}