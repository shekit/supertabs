import * as vscode from 'vscode';
import { STORAGE_KEYS } from './constants/constants';

export interface UserSettings {
    subreddits: string[];
    refreshInterval: number;
    postsPerSubreddit: number;
    businessPrompt: string;
    processedPosts: string[];
}

export class StorageService {
    private readonly SETTINGS_KEY = STORAGE_KEYS.SETTINGS;
    
    constructor(private context: vscode.ExtensionContext) {}

    async getSettings(): Promise<UserSettings> {
        const settings = this.context.globalState.get<UserSettings>(this.SETTINGS_KEY);
        
        // Default settings
        const defaults: UserSettings = {
            subreddits: ['programming', 'webdev', 'node'],
            refreshInterval: 300,
            postsPerSubreddit: 10,
            businessPrompt: '',
            processedPosts: []
        };
        
        // Merge settings with defaults to ensure all fields exist
        if (settings) {
            return {
                ...defaults,
                ...settings,
                // Ensure processedPosts is always an array
                processedPosts: settings.processedPosts || []
            };
        }
        
        return defaults;
    }

    async updateSettings(settings: Partial<UserSettings>): Promise<void> {
        const current = await this.getSettings();
        const updated = { ...current, ...settings };
        await this.context.globalState.update(this.SETTINGS_KEY, updated);
    }

    async addSubreddit(subreddit: string): Promise<void> {
        const settings = await this.getSettings();
        if (!settings.subreddits.includes(subreddit.toLowerCase())) {
            settings.subreddits.push(subreddit.toLowerCase());
            await this.updateSettings({ subreddits: settings.subreddits });
        }
    }

    async removeSubreddit(subreddit: string): Promise<void> {
        const settings = await this.getSettings();
        settings.subreddits = settings.subreddits.filter(
            s => s.toLowerCase() !== subreddit.toLowerCase()
        );
        await this.updateSettings({ subreddits: settings.subreddits });
    }

    async markPostProcessed(postId: string): Promise<void> {
        const settings = await this.getSettings();
        
        // Ensure processedPosts exists and is an array
        if (!settings.processedPosts) {
            settings.processedPosts = [];
        }
        
        if (!settings.processedPosts.includes(postId)) {
            settings.processedPosts.push(postId);
            await this.updateSettings({ processedPosts: settings.processedPosts });
        }
    }

    async getProcessedPosts(): Promise<string[]> {
        const settings = await this.getSettings();
        return settings.processedPosts || [];
    }

    async clearProcessedPosts(): Promise<void> {
        await this.updateSettings({ processedPosts: [] });
    }
}