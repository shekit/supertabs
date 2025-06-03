import * as path from 'path';

// Application metadata
export const APP = {
    ID: 'supertabs',
    NAME: 'Supertabs',
    PANEL_ID: 'supertabs.redditFeed',
    VERSION: 'v1.0.0'
} as const;

// VSCode extension commands
export const COMMANDS = {
    EXTENSION: {
        AUTHENTICATE: 'supertabs.authenticate',
        OPEN_FEED: 'supertabs.openFeed',
        TEST_FETCH: 'supertabs.testFetch',
        LOGOUT: 'supertabs.logout'
    },
    WEBVIEW: {
        READY: 'ready',
        ADD_SUBREDDIT: 'addSubreddit',
        REMOVE_SUBREDDIT: 'removeSubreddit',
        UPDATE_PROMPT: 'updatePrompt',
        SUBMIT_COMMENT: 'submitComment',
        SKIP_POST: 'skipPost',
        OPEN_POST: 'openPost',
        UPDATE_REFRESH_INTERVAL: 'updateRefreshInterval',
        REFRESH: 'refresh'
    }
} as const;

// Message types for webview communication
export const MESSAGES = {
    TYPE: {
        SETTINGS: 'settings',
        POSTS: 'posts',
        ERROR: 'error',
        REFRESH_STATUS: 'refreshStatus'
    }
} as const;

// File system paths
export const PATHS = {
    MEDIA: 'media',
    WEBVIEW: 'webview',
    DIST: 'dist',
    PROMPTS: 'prompts',
    TOOLS: 'tools',
    ENV: '.env',
} as const;

// Resource files
export const RESOURCES = {
    ICONS: {
        REDDIT: 'reddit-icon.svg'
    },
    PROMPTS: {
        FILTER: 'filter-prompt.txt'
    },
    TOOLS: {
        ANALYZE_POSTS: 'analyze-posts-tool.json'
    },
    WEBVIEW: {
        HTML: 'index.html',
        STYLES: 'styles.css',
        SCRIPT: 'script.js'
    }
} as const;

// Storage keys
export const STORAGE_KEYS = {
    SETTINGS: 'supertabs.settings',
    REDDIT_ACCESS_TOKEN: 'reddit_access_token',
    REDDIT_REFRESH_TOKEN: 'reddit_refresh_token'
} as const;

// Reddit API constants
export const REDDIT = {
    USER_AGENT: 'VSCode:Supertabs:v1.0.0',
    REDIRECT_URI: 'http://localhost:54321/callback',
    REDIRECT_PORT: 54321,
    OAUTH_TIMEOUT_MS: 120000, // 2 minutes
    SCOPES: 'read,submit,identity'
} as const;

// API models
export const MODELS = {
    CLAUDE: 'claude-3-5-sonnet-20241022'
} as const;

// UI text constants
export const UI_TEXT = {
    NOTIFICATIONS: {
        AUTH_SUCCESS: 'Successfully authenticated with Reddit!',
        AUTH_FAILED: 'Authentication failed. Please try again.',
        COMMENT_SUCCESS: 'Comment posted successfully!',
        COMMENT_FAILED: 'Failed to post comment. Please try again.',
        PROMPT_SAVED: 'Business prompt saved!',
        SETTINGS_UPDATED: 'Settings updated successfully!'
    }
} as const;

// Type helpers
export type WebviewCommand = typeof COMMANDS.WEBVIEW[keyof typeof COMMANDS.WEBVIEW];
export type ExtensionCommand = typeof COMMANDS.EXTENSION[keyof typeof COMMANDS.EXTENSION];
export type MessageType = typeof MESSAGES.TYPE[keyof typeof MESSAGES.TYPE];
export type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS];