import axios, { AxiosInstance } from 'axios';
import * as vscode from 'vscode';
import { RedditAuthProvider } from './auth';

export interface RedditPost {
    id: string;
    title: string;
    author: string;
    subreddit: string;
    created_utc: number;
    selftext: string;
    url: string;
    permalink: string;
    score: number;
    num_comments: number;
    link_flair_text?: string;
}

export class RedditService {
    private axiosInstance: AxiosInstance;
    private readonly USER_AGENT = 'VSCode:Supertabs:v1.0.0';

    constructor(
        private context: vscode.ExtensionContext,
        private authProvider: RedditAuthProvider
    ) {
        this.axiosInstance = axios.create({
            baseURL: 'https://oauth.reddit.com',
            headers: {
                'User-Agent': this.USER_AGENT
            }
        });

        // Add auth interceptor
        this.axiosInstance.interceptors.request.use(async (config) => {
            const token = await this.authProvider.getAccessToken();
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }
            return config;
        });
    }

    async testConnection(): Promise<boolean> {
        try {
            const response = await this.axiosInstance.get('/api/v1/me');
            console.log('Reddit user:', response.data.name);
            vscode.window.showInformationMessage(`Connected as: ${response.data.name}`);
            return true;
        } catch (error) {
            console.error('Reddit connection test failed:', error);
            return false;
        }
    }

    async getSubredditPosts(subreddit: string, sort: 'hot' | 'new' | 'rising' = 'new', limit: number = 25): Promise<RedditPost[]> {
        try {
            const response = await this.axiosInstance.get(`/r/${subreddit}/${sort}`, {
                params: { limit, raw_json: 1 }
            });

            const posts = response.data.data.children.map((child: any) => ({
                id: child.data.id,
                title: child.data.title,
                author: child.data.author,
                subreddit: child.data.subreddit,
                created_utc: child.data.created_utc,
                selftext: child.data.selftext,
                url: child.data.url,
                permalink: `https://reddit.com${child.data.permalink}`,
                score: child.data.score,
                num_comments: child.data.num_comments,
                link_flair_text: child.data.link_flair_text
            }));

            return posts;
        } catch (error) {
            console.error(`Failed to fetch posts from r/${subreddit}:`, error);
            throw error;
        }
    }

    async getMultipleSubreddits(subreddits: string[]): Promise<RedditPost[]> {
        const allPosts: RedditPost[] = [];
        
        for (const subreddit of subreddits) {
            try {
                const posts = await this.getSubredditPosts(subreddit);
                allPosts.push(...posts);
            } catch (error) {
                console.error(`Failed to fetch r/${subreddit}, skipping...`);
            }
        }

        // Sort by creation time (newest first)
        return allPosts.sort((a, b) => b.created_utc - a.created_utc);
    }
}