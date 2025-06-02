import * as vscode from 'vscode';
import axios from 'axios';
import express from 'express';
import * as crypto from 'crypto';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { REDDIT, ENV_VARS, STORAGE_KEYS, PATHS } from './constants/constants';

dotenv.config({ path: PATHS.ENV }); // Load environment variables from .env file

export class RedditAuthProvider {
    private static readonly CLIENT_ID = process.env.REDDIT_CLIENT_ID || '';
    private static readonly CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET || '';
    
    private static readonly REDIRECT_URI = REDDIT.REDIRECT_URI;
    private static readonly USER_AGENT = REDDIT.USER_AGENT;

    constructor(private context: vscode.ExtensionContext) {
        if (!RedditAuthProvider.CLIENT_ID || !RedditAuthProvider.CLIENT_SECRET) {
            vscode.window.showErrorMessage('Reddit credentials not found! Check your .env file.');
        }
    }

    async authenticate(): Promise<boolean> {
        const state = crypto.randomBytes(32).toString('hex');
        
        const authCode = await this.startCallbackServer(state);
        
        if (!authCode) {
            return false;
        }

        const token = await this.exchangeCodeForToken(authCode);
        
        if (token) {
            await this.context.secrets.store(STORAGE_KEYS.REDDIT_ACCESS_TOKEN, token.access_token);
            await this.context.secrets.store(STORAGE_KEYS.REDDIT_REFRESH_TOKEN, token.refresh_token);
            return true;
        }
        
        return false;
    }

    async logout(): Promise<void> {
        await this.context.secrets.delete(STORAGE_KEYS.REDDIT_ACCESS_TOKEN);
        await this.context.secrets.delete(STORAGE_KEYS.REDDIT_REFRESH_TOKEN);
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
            
            const server = app.listen(REDDIT.REDIRECT_PORT, () => {
                const authUrl = `https://www.reddit.com/api/v1/authorize?` +
                    `client_id=${RedditAuthProvider.CLIENT_ID}` +
                    `&response_type=code` +
                    `&state=${expectedState}` +
                    `&redirect_uri=${RedditAuthProvider.REDIRECT_URI}` +
                    `&duration=permanent` +
                    `&scope=${REDDIT.SCOPES}`;
                    
                vscode.env.openExternal(vscode.Uri.parse(authUrl));
            });
            
            setTimeout(() => {
                resolve(null);
                server.close();
            }, REDDIT.OAUTH_TIMEOUT_MS);
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
        return await this.context.secrets.get(STORAGE_KEYS.REDDIT_ACCESS_TOKEN);
    }
}