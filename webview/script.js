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

const vscode = acquireVsCodeApi();
let currentSettings = { 
    subreddits: [], 
    businessPrompt: '',
    refreshInterval: 300
};
let nextRefreshTime = null;
let countdownInterval = null;

// Initialize
vscode.postMessage({ command: COMMANDS.READY });

// Listen for messages
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
}

function addSubreddit() {
    const input = document.getElementById('subredditInput');
    const subreddit = input.value.trim().toLowerCase().replace(/^r\//, '');
    
    if (subreddit && !currentSettings.subreddits.includes(subreddit)) {
        vscode.postMessage({ 
            command: commands.ADD_SUBREDDIT, 
            subreddit: subreddit 
        });
        input.value = '';
    }
}

function removeSubreddit(subreddit) {
    vscode.postMessage({ 
        command: commands.REMOVE_SUBREDDIT, 
        subreddit: subreddit 
    });
}

function savePrompt() {
    const prompt = document.getElementById('businessPrompt').value;
    vscode.postMessage({ 
        command: commands.UPDATE_PROMPT, 
        prompt: prompt 
    });
}

function updateRefreshInterval() {
    const interval = parseInt(document.getElementById('refreshInterval').value);
    if (interval >= 60 && interval <= 3600) {
        vscode.postMessage({ 
            command: commands.UPDATE_REFRESH_INTERVAL, 
            interval: interval 
        });
    } else {
        alert('Refresh interval must be between 60 and 3600 seconds');
    }
}

function manualRefresh() {
    vscode.postMessage({ command: commands.REFRESH });
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

function displayPosts(posts) {
    const container = document.getElementById('postsContainer');
    
    if (posts.length === 0) {
        container.innerHTML = '<div class="loading">No relevant posts found. Try adjusting your prompt or adding more subreddits.</div>';
        return;
    }
    
    // For now, just show the first post
    const post = posts[0];
    container.innerHTML = `
        <div class="post-card">
            <div class="post-title">${escapeHtml(post.title)}</div>
            <div class="post-meta">r/${post.subreddit} • by u/${post.author} • ${getTimeAgo(post.created_utc)}</div>
            <div class="post-content">${escapeHtml(post.selftext || 'No text content')}</div>
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
            command: commands.SUBMIT_COMMENT, 
            postId: postId,
            comment: comment 
        });
    }
}

function skipPost(postId) {
    vscode.postMessage({ 
        command: commands.SKIP_POST, 
        postId: postId 
    });
}

function showError(message) {
    document.getElementById('postsContainer').innerHTML = 
        `<div class="loading" style="color: var(--vscode-errorForeground);">${message}</div>`;
}

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

// Add enter key support for subreddit input
document.getElementById('subredditInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        addSubreddit();
    }
});