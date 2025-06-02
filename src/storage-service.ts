import * as vscode from 'vscode';

export interface UserSettings {
    subreddits: string[];
    refreshInterval: number; // in seconds
    postsPerSubreddit: number;
    businessPrompt: string;
}

export class StorageService {
    private readonly SETTINGS_KEY = 'supertabs.settings';
    
    constructor(private context: vscode.ExtensionContext) {}

    async getSettings(): Promise<UserSettings> {
        const settings = this.context.globalState.get<UserSettings>(this.SETTINGS_KEY);
        
        // Return defaults if no settings exist
        return settings || {
            subreddits: ['programming', 'webdev', 'node'],
            refreshInterval: 300, // 5 minutes
            postsPerSubreddit: 10,
            businessPrompt: ''
        };
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
}