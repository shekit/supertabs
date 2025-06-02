import * as vscode from 'vscode';
import { RedditAuthProvider } from './auth';
import { RedditService } from './reddit-service';
import { RedditWebviewProvider } from './webview-provider';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });


export function activate(context: vscode.ExtensionContext) {
    console.log('Supertabs is now active!');
    
    const authProvider = new RedditAuthProvider(context);
	const redditService = new RedditService(context, authProvider);
	const webviewProvider = new RedditWebviewProvider(context, redditService);
    
    // Register authenticate command
    let authenticateCommand = vscode.commands.registerCommand('supertabs.authenticate', async () => {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Authenticating with Reddit...",
            cancellable: false
        }, async (progress) => {
            const success = await authProvider.authenticate();
            
            if (success) {
                vscode.window.showInformationMessage('Successfully authenticated with Reddit!');
            } else {
                vscode.window.showErrorMessage('Authentication failed. Please try again.');
            }
        });
    });

	let testFetchCommand = vscode.commands.registerCommand('supertabs.testFetch', async () => {
        const token = await authProvider.getAccessToken();
        if (!token) {
            vscode.window.showErrorMessage('Please authenticate first!');
            return;
        }

        const subreddit = await vscode.window.showInputBox({
            prompt: 'Enter subreddit name (without r/)',
            value: 'programming'
        });

        if (!subreddit) {
			return;
		}

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Fetching posts from r/${subreddit}...`,
            cancellable: false
        }, async () => {
            try {
                const posts = await redditService.getSubredditPosts(subreddit);
                
                // Show quick pick with post titles
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

	let openFeedCommand = vscode.commands.registerCommand('supertabs.openFeed', async () => {
		const token = await authProvider.getAccessToken();
		if (!token) {
			const choice = await vscode.window.showWarningMessage(
				'You need to authenticate with Reddit first',
				'Authenticate'
			);
			if (choice === 'Authenticate') {
				await vscode.commands.executeCommand('supertabs.authenticate');
			}
			return;
		}
		
		await webviewProvider.show();
	});

	let logoutCommand = vscode.commands.registerCommand('supertabs.logout', async () => {
		await authProvider.logout();
		vscode.window.showInformationMessage('Logged out of Reddit');
	});

	let test = vscode.commands.registerCommand('supertabs.test', async () => {
		console.log('Test command executed');
	});

    context.subscriptions.push(authenticateCommand);
	context.subscriptions.push(testFetchCommand);
	context.subscriptions.push(openFeedCommand);
	context.subscriptions.push(logoutCommand);
	context.subscriptions.push(test);
}

export function deactivate() {}