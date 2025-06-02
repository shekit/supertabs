import * as vscode from 'vscode';
import axios from 'axios';
import express from 'express';
import * as crypto from 'crypto';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') }); // Load environment variables from .env file

export class RedditAuthProvider {
    private static readonly CLIENT_ID = process.env.REDDIT_CLIENT_ID || '';
    private static readonly CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET || '';
    
    private static readonly REDIRECT_URI = 'http://localhost:54321/callback';
    private static readonly USER_AGENT = 'VSCode:Supertabs:v1.0.0';

    constructor(private context: vscode.ExtensionContext) {}

    async authenticate(): Promise<boolean> {
        console.log('Reddit Client ID:', RedditAuthProvider.CLIENT_ID);
        console.log('Reddit Client Secret:', RedditAuthProvider.CLIENT_SECRET);
        const state = crypto.randomBytes(32).toString('hex');
        
        // Create authorization URL
        const authUrl = `https://www.reddit.com/api/v1/authorize?` +
            `client_id=${RedditAuthProvider.CLIENT_ID}` +
            `&response_type=code` +
            `&state=${state}` +
            `&redirect_uri=${RedditAuthProvider.REDIRECT_URI}` +
            `&duration=permanent` +
            `&scope=read,submit,identity`;

        // Start local server to receive callback
        const authCode = await this.startCallbackServer(state);
        
        if (!authCode) {
            return false;
        }

        // Exchange code for token
        const token = await this.exchangeCodeForToken(authCode);
        
        if (token) {
            // Store token securely
            await this.context.secrets.store('reddit_access_token', token.access_token);
            await this.context.secrets.store('reddit_refresh_token', token.refresh_token);
            return true;
        }
        
        return false;
    }

    async logout(): Promise<void> {
        await this.context.secrets.delete('reddit_access_token');
        await this.context.secrets.delete('reddit_refresh_token');
    }

    private startCallbackServer(expectedState: string): Promise<string | null> {
        return new Promise((resolve) => {
            const app = express();
            
            app.get('/callback', (req, res) => {
                const { code, state, error } = req.query;
                
                if (error) {
                    res.send('Authentication failed. You can close this window.');
                    resolve(null);
                    server.close();
                    return;
                }
                
                if (state !== expectedState) {
                    res.send('State mismatch. Authentication failed.');
                    resolve(null);
                    server.close();
                    return;
                }
                
                res.send('Authentication successful! You can close this window and return to VSCode.');
                resolve(code as string);
                server.close();
            });
            
            const server = app.listen(54321, () => {
                // Open browser for user to authenticate
                vscode.env.openExternal(vscode.Uri.parse(
                    `https://www.reddit.com/api/v1/authorize?` +
                    `client_id=${RedditAuthProvider.CLIENT_ID}` +
                    `&response_type=code` +
                    `&state=${expectedState}` +
                    `&redirect_uri=${RedditAuthProvider.REDIRECT_URI}` +
                    `&duration=permanent` +
                    `&scope=read,submit,identity`
                ));
            });
            
            // Timeout after 2 minutes
            setTimeout(() => {
                resolve(null);
                server.close();
            }, 120000);
        });
    }

    private async exchangeCodeForToken(code: string): Promise<any> {
        try {
            const auth = Buffer.from(`${RedditAuthProvider.CLIENT_ID}:${RedditAuthProvider.CLIENT_SECRET}`).toString('base64');
            
            const response = await axios.post(
                'https://www.reddit.com/api/v1/access_token',
                `grant_type=authorization_code&code=${code}&redirect_uri=${RedditAuthProvider.REDIRECT_URI}`,
                {
                    headers: {
                        'Authorization': `Basic ${auth}`,
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent': RedditAuthProvider.USER_AGENT
                    }
                }
            );
            
            return response.data;
        } catch (error) {
            console.error('Token exchange failed:', error);
            return null;
        }
    }

    async getAccessToken(): Promise<string | undefined> {
        return await this.context.secrets.get('reddit_access_token');
    }
}