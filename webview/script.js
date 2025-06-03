// Constants matching TypeScript
const COMMANDS = {
    READY: 'ready',
    ADD_SUBREDDIT: 'addSubreddit',
    REMOVE_SUBREDDIT: 'removeSubreddit',
    UPDATE_PROMPT: 'updatePrompt',
    SUBMIT_COMMENT: 'submitComment',
    SKIP_POST: 'skipPost',
    OPEN_POST: 'openPost',
    UPDATE_REFRESH_INTERVAL: 'updateRefreshInterval',
    REFRESH: 'refresh'
};

const MESSAGE_TYPES = {
    SETTINGS: 'settings',
    POSTS: 'posts',
    ERROR: 'error',
    REFRESH_STATUS: 'refreshStatus'
};

// VSCode API
const vscode = acquireVsCodeApi();

// Global state
let currentSettings = { 
    subreddits: [], 
    businessPrompt: '',
    refreshInterval: 300
};
let nextRefreshTime = null;
let countdownInterval = null;

// Section collapse state
let sectionStates = {
    subredditSection: false,
    promptSection: false,
    refreshSection: true  // Start collapsed
};

// Initialize
vscode.postMessage({ command: COMMANDS.READY });

// Listen for messages from extension
window.addEventListener('message', event => {
    const message = event.data;
    
    switch (message.type) {
        case MESSAGE_TYPES.SETTINGS:
            currentSettings = message.data;
            updateUI();
            break;
        case MESSAGE_TYPES.POSTS:
            displayPosts(message.data);
            break;
        case MESSAGE_TYPES.ERROR:
            showError(message.message);
            break;
        case MESSAGE_TYPES.REFRESH_STATUS:
            updateRefreshStatus(message.nextRefresh);
            break;
    }
});

// UI Update Functions
function updateUI() {
    // Update subreddit list
    const listEl = document.getElementById('subredditList');
    listEl.innerHTML = currentSettings.subreddits.map(sub => 
        `<div class="subreddit-tag">
            r/${sub}
            <span class="remove-btn" onclick="removeSubreddit('${sub}')">×</span>
        </div>`
    ).join('');
    
    // Update prompt
    document.getElementById('businessPrompt').value = currentSettings.businessPrompt || '';
    
    // Update refresh interval
    document.getElementById('refreshInterval').value = currentSettings.refreshInterval || 300;
    
    // Update summaries
    updateSectionSummaries();
    
    // Auto-collapse sections after initial setup if they have values
    const state = vscode.getState();
    if (!state || !state.hasAutoCollapsed) {
        if (currentSettings.subreddits.length > 0 && !sectionStates.subredditSection) {
            toggleSection('subredditSection');
        }
        if (currentSettings.businessPrompt && !sectionStates.promptSection) {
            toggleSection('promptSection');
        }
        vscode.setState({ ...vscode.getState(), hasAutoCollapsed: true });
    }
}

// Section Management
function toggleSection(sectionId) {
    const section = document.getElementById(sectionId);
    const isCollapsed = section.classList.toggle('collapsed');
    sectionStates[sectionId] = isCollapsed;
    
    // Save state
    vscode.setState({ ...vscode.getState(), sectionStates });
    
    updateSectionSummaries();
}

function toggleAllSettings() {
    const allCollapsed = Object.values(sectionStates).every(state => state);
    
    ['subredditSection', 'promptSection', 'refreshSection'].forEach(sectionId => {
        const section = document.getElementById(sectionId);
        if (allCollapsed) {
            section.classList.remove('collapsed');
            sectionStates[sectionId] = false;
        } else {
            section.classList.add('collapsed');
            sectionStates[sectionId] = true;
        }
    });
    
    vscode.setState({ ...vscode.getState(), sectionStates });
    updateSectionSummaries();
}

function updateSectionSummaries() {
    // Subreddit summary
    const subredditSummary = document.getElementById('subredditSummary');
    if (currentSettings.subreddits.length > 0) {
        subredditSummary.textContent = `(${currentSettings.subreddits.length} subreddits)`;
    } else {
        subredditSummary.textContent = '(none)';
    }
    
    // Prompt summary
    const promptSummary = document.getElementById('promptSummary');
    if (currentSettings.businessPrompt) {
        const truncated = currentSettings.businessPrompt.substring(0, 50);
        promptSummary.textContent = `(${truncated}${currentSettings.businessPrompt.length > 50 ? '...' : ''})`;
    } else {
        promptSummary.textContent = '(not set)';
    }
    
    // Refresh summary
    const refreshSummary = document.getElementById('refreshSummary');
    refreshSummary.textContent = `(every ${currentSettings.refreshInterval}s)`;
}

// Restore section states on load
function restoreSectionStates() {
    const state = vscode.getState();
    if (state && state.sectionStates) {
        sectionStates = state.sectionStates;
        
        // Apply saved states
        Object.keys(sectionStates).forEach(sectionId => {
            const section = document.getElementById(sectionId);
            if (section) {
                if (sectionStates[sectionId]) {
                    section.classList.add('collapsed');
                } else {
                    section.classList.remove('collapsed');
                }
            }
        });
    }
}

// Subreddit Management
function addSubreddit() {
    const input = document.getElementById('subredditInput');
    const subreddit = input.value.trim().toLowerCase().replace(/^r\//, '');
    
    if (subreddit && !currentSettings.subreddits.includes(subreddit)) {
        vscode.postMessage({ 
            command: COMMANDS.ADD_SUBREDDIT, 
            subreddit: subreddit 
        });
        input.value = '';
    }
}

function removeSubreddit(subreddit) {
    vscode.postMessage({ 
        command: COMMANDS.REMOVE_SUBREDDIT, 
        subreddit: subreddit 
    });
}

// Business Prompt
function savePrompt() {
    const prompt = document.getElementById('businessPrompt').value;
    vscode.postMessage({ 
        command: COMMANDS.UPDATE_PROMPT, 
        prompt: prompt 
    });
}

// Refresh Settings
function updateRefreshInterval() {
    const interval = parseInt(document.getElementById('refreshInterval').value);
    if (interval >= 60 && interval <= 3600) {
        vscode.postMessage({ 
            command: COMMANDS.UPDATE_REFRESH_INTERVAL, 
            interval: interval 
        });
    } else {
        alert('Refresh interval must be between 60 and 3600 seconds');
    }
}

function manualRefresh() {
    vscode.postMessage({ command: COMMANDS.REFRESH });
}

function updateRefreshStatus(nextRefresh) {
    nextRefreshTime = nextRefresh;
    
    // Clear existing interval
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }
    
    // Update immediately
    updateCountdown();
    
    // Update every second
    countdownInterval = setInterval(updateCountdown, 1000);
}

function updateCountdown() {
    if (!nextRefreshTime) {
        document.getElementById('refreshCountdown').textContent = '--';
        return;
    }
    
    const now = Date.now();
    const timeLeft = Math.max(0, Math.floor((nextRefreshTime - now) / 1000));
    
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    
    document.getElementById('refreshCountdown').textContent = 
        `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function renderMarkdown(text) {
    if (!text) return 'No text content';
    
    // Basic markdown rendering (you might want a proper library later)
    let html = text
        // Headers
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        // Bold
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        // Italic
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        // Links
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
        // Line breaks
        .replace(/\n/g, '<br>')
        // Code blocks
        .replace(/```([^`]+)```/g, '<pre><code>$1</code></pre>')
        // Inline code
        .replace(/`([^`]+)`/g, '<code>$1</code>');
    
    return html;
}

// Post Display
function displayPosts(posts) {
    const container = document.getElementById('postsContainer');
    
    if (posts.length === 0) {
        container.innerHTML = '<div class="loading">No relevant posts found. Try adjusting your prompt or adding more subreddits.</div>';
        return;
    }
    
    const post = posts[0];
    
    // Check if post has media
    let mediaHtml = '';
    if (post.post_hint === 'image' || (post.url && /\.(jpg|jpeg|png|gif)$/i.test(post.url))) {
        mediaHtml = `<img src="${post.url}" alt="${escapeHtml(post.title)}" style="max-width: 100%; margin: 16px 0;">`;
    } else if (post.is_video || post.post_hint === 'hosted:video') {
        // Reddit hosted video
        const videoUrl = post.media?.reddit_video?.fallback_url || post.url;
        mediaHtml = `<video controls style="max-width: 100%; margin: 16px 0;">
            <source src="${videoUrl}" type="video/mp4">
            Your browser does not support the video tag.
        </video>`;
    } else if (post.url && post.url !== post.permalink) {
        // External link
        mediaHtml = `<div style="margin: 16px 0;">
            <a href="${post.url}" target="_blank" style="color: var(--vscode-textLink-foreground);">
                🔗 ${post.url}
            </a>
        </div>`;
    }
    
    container.innerHTML = `
        <div class="post-card">
            <div class="post-title">${escapeHtml(post.title)}</div>
            <div class="post-meta">r/${post.subreddit} • by u/${post.author} • ${getTimeAgo(post.created_utc)}</div>
            ${mediaHtml}
            <div class="post-content">${renderMarkdown(post.selftext)}</div>
            <div class="comment-section">
                <textarea id="commentText" placeholder="Write your comment..." rows="4"></textarea>
                <div class="comment-actions">
                    <button class="submit-btn" onclick="submitComment('${post.id}')">Submit Comment</button>
                    <button class="skip-btn" onclick="skipPost('${post.id}')">Skip</button>
                </div>
            </div>
        </div>
    `;
}

function submitComment(postId) {
    const comment = document.getElementById('commentText').value;
    if (comment.trim()) {
        vscode.postMessage({ 
            command: COMMANDS.SUBMIT_COMMENT, 
            postId: postId,
            comment: comment 
        });
    }
}

function skipPost(postId) {
    vscode.postMessage({ 
        command: COMMANDS.SKIP_POST, 
        postId: postId 
    });
}

function showError(message) {
    document.getElementById('postsContainer').innerHTML = 
        `<div class="loading" style="color: var(--vscode-errorForeground);">${message}</div>`;
}

// Utility Functions
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

// Event Listeners
document.getElementById('subredditInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        addSubreddit();
    }
});

// Restore states on DOM load
document.addEventListener('DOMContentLoaded', () => {
    restoreSectionStates();
});

// Initialize
restoreSectionStates();