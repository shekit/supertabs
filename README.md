# Supertabs

A VSCode extension that surfaces Reddit posts where you can add value — filtered by Claude against a description of your expertise — and lets you comment on them without leaving the editor.

## How it works

1. You list the subreddits you want to monitor and write a short prompt describing your business, products, or expertise.
2. Supertabs fetches new posts from those subreddits.
3. Claude scores each post 1–10 for relevance against your prompt and explains why.
4. The webview shows you the top-ranked unread post with a comment box. Submit a reply (posted to Reddit via your account) or skip — either way the post is marked seen and won't reappear.
5. The feed auto-refreshes on a configurable interval.

## Setup

### 1. Create a Reddit OAuth app

Go to https://www.reddit.com/prefs/apps and create a new app:

- Type: **web app**
- Redirect URI: `http://localhost:54321/callback`

Copy the client ID (under the app name) and the secret.

### 2. Get an Anthropic API key

Create one at https://console.anthropic.com/.

### 3. Configure environment

```bash
cp .env.example .env
```

Fill in the three values in `.env`:

```
REDDIT_CLIENT_ID=...
REDDIT_CLIENT_SECRET=...
CLAUDE_API_KEY=...
```

`.env` is gitignored.

### 4. Install & build

```bash
npm install
npm run compile
```

For active development:

```bash
npm run watch
```

### 5. Run the extension

Open the project in VSCode and press `F5` to launch an Extension Development Host with Supertabs loaded.

## Usage

Open the command palette (`Cmd+Shift+P`) and run:

- **Supertabs: Authenticate with Reddit** — opens a browser, completes OAuth, stores tokens in VSCode SecretStorage.
- **Supertabs: Open Reddit Feed** — opens the main webview panel.
- **Supertabs: Fetch from Reddit** — quick subreddit picker (debug helper).
- **Supertabs: Logout from Reddit** — clears stored tokens.

Inside the feed panel:

- **Tracked Subreddits** — add/remove subreddits to monitor.
- **Your Business/Interests** — the prompt Claude uses to filter posts. Be specific about what you can credibly speak to.
- **Auto-Refresh Settings** — interval in seconds (60–3600).

Posts are sorted by Claude's relevance score, shown one at a time. Submitting a comment posts it to Reddit immediately under the authenticated account.

## Configuration reference

Defaults live in [`src/storage-service.ts`](src/storage-service.ts) and [`src/constants/constants.ts`](src/constants/constants.ts):

| Setting | Default | Notes |
| --- | --- | --- |
| Subreddits | `programming`, `webdev`, `node` | Per-user, stored in `globalState` |
| Refresh interval | 300s | Min 60, max 3600 |
| Posts fetched per subreddit | 5 | `REDDIT.NUM_POSTS` |
| OAuth scopes | `read,submit,identity` | |
| OAuth callback | `http://localhost:54321/callback` | |
| Claude model | `claude-sonnet-4-20250514` | |

## Project layout

```
src/
  extension.ts          # activation, command registration
  auth.ts               # Reddit OAuth (Express callback server)
  reddit-service.ts     # Reddit REST client
  llm-service.ts        # Claude-based relevance filter
  storage-service.ts    # globalState wrapper (settings + seen posts)
  webview-provider.ts   # webview panel + message routing
  constants/constants.ts
webview/                # vanilla HTML/CSS/JS UI
prompts/filter-prompt.txt          # system prompt for the LLM
tools/analyze-posts-tool.json      # Anthropic tool schema
```

## Tweaking the filter

The system prompt and tool schema are externalized — edit them without rebuilding TypeScript:

- [`prompts/filter-prompt.txt`](prompts/filter-prompt.txt) — what counts as "relevant"
- [`tools/analyze-posts-tool.json`](tools/analyze-posts-tool.json) — the schema Claude returns (`postId`, `isRelevant`, `relevanceScore`, `reasoning`)

## Known limitations

- No access-token refresh — re-run **Authenticate** when the token expires (~1h).
- `processedPosts` is stored indefinitely in `globalState`; clear it via `StorageService.clearProcessedPosts` if needed.
- Webview renders post bodies as markdown without sanitization — only run on Reddit content you trust.
