# For Future Ketan

Hello future self! If you're reading this, it's probably been a few months since you touched the **YTMD Web Companion**. Here is the catch-up guide to get you back up to speed immediately.

## 🚀 Quick Start
To run the web companion:
1. Open a terminal in the `web-companion` directory.
2. Run `node server.js`.
3. Open your browser to `http://localhost:5099`.
4. Ensure your **YouTube Music Desktop App** is running and the **Companion Server** integration is enabled in its settings.

## 📁 Where is Everything?
- **`web-companion/`**: This is the heart of the remote UI.
  - `index.html`: The structure of the player.
  - `style.css`: The YouTube Music "Dark/Red" theme.
  - `app.js`: The "brain" that handles routing, API calls, and real-time state.
  - `server.js`: The local proxy server (solves CORS issues and serves the app).
  - `config.json`: Stores your connection settings so you don't have to re-type them.
- **`API.md`** (Root): Full documentation of every single endpoint available in the Companion API.

## ✨ What's New? (The UI Overhaul)
The UI was completely rewritten to move away from a "simple remote" to a "full music app" experience matching the official desktop app.
- **Multi-View Navigation**: Added a sidebar (desktop) and bottom nav (mobile) with **Home**, **Explore**, **Library**, **History**, and **Settings**.
- **Playback Redesign**: Matches YTM Desktop exactly.
  - **Left**: Large high-res album art.
  - **Right**: Tabbed panel with **Up Next** (Queue), **Lyrics**, and **Related** songs.
- **New Features**:
  - **Explore Tab**: Browse trending, new releases, and moods.
  - **History Tab**: See your recent listening history.
  - **Queue Filters**: Use mood chips (Discover, Familiar, Chill, etc.) to change the autoplay style.
  - **Sleep Timer**: Found in Settings.

## 💡 Important Notes
- **Caching**: The Home page is cached in `sessionStorage` to avoid rate limits. If it feels stale, use the Refresh button on the Home view.
- **Proxy Mode**: By default, the app uses `server.js` as a proxy. This is why you visit port `5099` instead of the default `9863`.
- **Keyboard Shortcuts**: `Space` (Play/Pause), `Arrows` (Skip/Volume), `M` (Mute).

Enjoy the music! 🎵
