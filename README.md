# Privex AI

Privacy-first AI chat in pure vanilla HTML/CSS/JS.

## Highlights

- GPT-powered chat with streaming responses.
- Device-only storage with IndexedDB and localStorage.
- AES-256-GCM encryption at rest for stored conversation data.
- No backend, no database server, no build tools.
- Works on GitHub Pages.

## Project Structure

- `dashboard.html` - App shell and UI markup.
- `style.css` - Styling, responsive layout, animations.
- `app.js` - Main runtime controller and event wiring.
- `gemini.js` - OpenAI GPT API client (streaming and non-streaming).
- `storage.js` - IndexedDB abstraction layer.
- `markdown.js` - Lightweight markdown renderer.
- `themes.js` - Theme and accent utilities.
- `crypto.js` - AES-GCM local encryption helpers.
- `manifest.json` - PWA manifest.
- `service-worker.js` - Offline shell cache service worker.
- `.nojekyll` - GitHub Pages compatibility.
- `assets/logo.svg` - Brand logo.
- `assets/favicon.ico` - Favicon.

## Setup

1. Open the app in a browser.
2. Create `config.js` in project root with your key:

```javascript
window.PRIVEX_CONFIG = {
  openaiApiKey: 'YOUR_OPENAI_API_KEY'
};
```

3. Complete first-time onboarding (name + theme).
4. Start chatting.

Your key is read from `config.js` and sent only to OpenAI API endpoints.

## API Key Safety

- Never hardcode any OpenAI key in `app.js`, `gemini.js`, `dashboard.html`, or any tracked source file.
- `config.js` is git-ignored by default in this project.
- If a key is committed to GitHub, Google scanners can invalidate it quickly.

Serverless proxy option (recommended for public deployments): use Netlify/Vercel functions and keep key in environment variables.

## Run Locally

Because this app uses ES modules, use a simple static server (or GitHub Pages) instead of opening `dashboard.html` directly from `file://`.

Examples:

- VS Code Live Server extension.
- Python static server:
  - `python -m http.server 8080`

Then open `http://localhost:8080`.

## Deploy on GitHub Pages

1. Push this folder to a GitHub repository.
2. Go to repository `Settings -> Pages`.
3. Set source to `Deploy from branch`.
4. Select `main` and root (`/`).
5. Save.
6. Open your URL:
   - `https://<your-username>.github.io/<repo-name>/`

## Privacy Model

- Stored locally:
  - Conversations
  - Messages
  - Personas
  - User memory
  - Preferences
- Encryption:
  - IndexedDB sensitive fields are AES-256-GCM encrypted at rest
- Sent to OpenAI:
  - Current conversation context for GPT responses
- Sent to Privex servers:
  - Nothing (no analytics, no backend)

## Security Note

This app encrypts local data at rest. A determined attacker with full access to an unlocked browser session can still inspect runtime data via developer tools.

## Notes

- Incognito mode keeps conversation only in memory for current tab session.
- Export/import is available in settings for backup and migration.
- Chat menu includes transcript copy in plain text or HTML.
- Command palette includes built-in prompt templates.
- AI settings include response style control (balanced/concise/detailed).
- In-app "What's New" changelog appears on version updates.
- Conversation folders/collections are available in the sidebar.
- Pinboard panel tracks pinned messages across conversations.
- Storage panel shows richer local usage stats (starred/pinned/avg/last activity).
- No API key is embedded in source files.
