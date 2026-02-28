# YTMD Web Companion

A browser-based remote control dashboard for [YouTube Music Desktop App](https://github.com/ArnoldsAventuresTeam/ytmdesktop). Connect from any device on your local network — phone, tablet, or another desktop — and control playback in real time.

## Features

- **Full playback control** — play/pause, previous, next, shuffle, repeat, seek, volume
- **Live state sync** — track info, album art, progress, and queue update in real time via WebSocket
- **Queue management** — view and jump to any track in the current queue
- **Playlists** — browse and switch playlists
- **Like/Dislike** — toggle like and dislike for the current track
- **Responsive UI** — desktop split-panel layout with a mobile full-screen player
- **Proxy mode** — bypass CORS by serving everything through a single Node.js proxy
- **Keyboard shortcuts** — `Space` (play/pause), `←`/`→` (prev/next), `↑`/`↓` (volume), `M` (mute)

---

## Quick Start

### Prerequisites

- **Node.js** ≥ 16
- **YouTube Music Desktop App** running with the Companion Server enabled  
  *(Settings → Integrations → Enable Companion Server)*

### 1. Configure

Edit `config.json` with your YTMD server details:

```json
{
  "host": "localhost",
  "port": 9863,
  "token": "YOUR_AUTH_TOKEN_HERE",
  "appId": "ytmd-web-companion",
  "appName": "YTMD Web Companion",
  "appVersion": "1.0.0"
}
```

| Field      | Description                                                                 |
|------------|-----------------------------------------------------------------------------|
| `host`     | YTMD hostname/IP. Use `localhost` if running the proxy on the same machine. |
| `port`     | YTMD Companion Server port (default `9863`).                                |
| `token`    | Authorization token (obtain via the auth flow below or from YTMD settings). |
| `appId`    | App identifier for the auth handshake.                                      |
| `appName`  | Display name shown in YTMD when requesting authorization.                   |
| `appVersion` | Version string for the auth handshake.                                    |

### 2. Start the Proxy Server

```bash
cd web-companion
node server.js
```

The proxy starts at **http://localhost:5099**.

### 3. Open the Dashboard

Navigate to `http://localhost:5099` in any browser. If `config.json` contains a valid token, it auto-connects.

---

## Obtaining an Auth Token

If you don't have a token yet:

1. Open the dashboard and expand **"Need a new token? Request authorization"**
2. Fill in the App ID, Name, and Version (defaults are fine)
3. Click **Request Code & Token**
4. A code appears — **approve the request in the YTMD desktop app**
5. The token auto-fills. Copy it into `config.json` for future use.

Alternatively, generate tokens manually via the REST API (see below).

---

## Architecture

```
┌─────────────┐      HTTP/WS       ┌──────────────┐     HTTP/WS      ┌────────────────┐
│   Browser    │ ◄───────────────► │  server.js    │ ◄──────────────► │  YTMD Desktop  │
│  (app.js)    │   localhost:5099   │  (Proxy)      │  localhost:9863  │  Companion API │
└─────────────┘                    └──────────────┘                   └────────────────┘
```

### File Structure

| File          | Purpose                                                              |
|---------------|----------------------------------------------------------------------|
| `server.js`   | Node.js HTTP proxy — serves static files and proxies API/WS to YTMD  |
| `index.html`  | Dashboard HTML — connection screen + player UI                       |
| `style.css`   | Full CSS with YouTube Red theme, desktop + mobile responsive layouts |
| `app.js`      | Client-side JavaScript — REST client, Socket.IO, UI rendering        |
| `config.json` | Connection credentials (host, port, token)                           |

### Proxy Server (`server.js`)

The proxy solves CORS restrictions by routing all requests through a single origin:

- **Static files** — `GET /` serves `index.html`, CSS, JS, config
- **API proxy** — `GET|POST /api/*` and `/metadata` → forwarded to `http://{host}:{port}`
- **WebSocket proxy** — `Upgrade` requests to `/socket.io/*` are tunneled bidirectionally
- **CORS headers** — added to all proxied responses
- **No-cache headers** — CSS/JS/HTML served with `Cache-Control: no-cache` for development

### Client App (`app.js`)

The client uses two communication channels:

1. **REST API** — for sending commands and fetching metadata/playlists
2. **Socket.IO** — for receiving real-time state updates (track changes, progress, volume, queue)

State updates arrive via the `state-update` event. No polling is used — the UI refreshes instantly on every state change.

---

## API Reference

All endpoints are relative to the YTMD Companion Server (or the proxy at `localhost:5099`).

### Authentication

All requests require an `Authorization` header with the token:

```
Authorization: YOUR_TOKEN_HERE
```

### Auth Flow Endpoints

#### `POST /api/v1/auth/requestcode`

Request an authorization code to register a new companion app.

**Request Body:**
```json
{
  "appId": "ytmd-web-companion",
  "appName": "YTMD Web Companion",
  "appVersion": "1.0.0"
}
```

**Response:**
```json
{ "code": "ABC123" }
```

The user must approve this code in the YTMD desktop app.

---

#### `POST /api/v1/auth/request`

Exchange the approved code for an authorization token.

**Request Body:**
```json
{
  "appId": "ytmd-web-companion",
  "code": "ABC123"
}
```

**Response:**
```json
{ "token": "long-hex-token-string" }
```

---

### State & Metadata

#### `GET /metadata`

Returns server metadata including supported API versions.

**Response:**
```json
{
  "apiVersions": ["v1"]
}
```

---

#### `GET /api/v1/playlists`

Returns the user's playlists.

**Response:** Array of playlist objects:
```json
[
  { "id": "PLxxxxx", "title": "My Playlist" }
]
```

---

### Commands

#### `POST /api/v1/command`

Send a playback command to YTMD.

**Request Body:**
```json
{
  "command": "commandName",
  "data": "optional-data"
}
```

#### Available Commands

| Command          | Data                  | Description                         |
|------------------|-----------------------|-------------------------------------|
| `playPause`      | —                     | Toggle play/pause                   |
| `next`           | —                     | Skip to next track                  |
| `previous`       | —                     | Go to previous track                |
| `shuffle`        | —                     | Toggle shuffle                      |
| `repeatMode`     | `0` / `1` / `2`      | Set repeat: None / All / One        |
| `seekTo`         | `seconds` (int)       | Seek to position in seconds         |
| `setVolume`      | `0–100` (int)         | Set volume level                    |
| `mute`           | —                     | Mute audio                          |
| `unmute`         | —                     | Unmute audio                        |
| `volumeUp`       | —                     | Increase volume one step            |
| `volumeDown`     | —                     | Decrease volume one step            |
| `toggleLike`     | —                     | Toggle like for current track       |
| `toggleDislike`  | —                     | Toggle dislike for current track    |
| `playQueueIndex` | `index` (int)         | Jump to track at queue index        |
| `changeVideo`    | `{ playlistId: id }`  | Switch to a different playlist      |

---

### Socket.IO — Real-time Events

Connect to the `/api/v1/realtime` namespace with the auth token:

```javascript
const socket = io("/api/v1/realtime", {
  transports: ["websocket"],
  auth: { token: "YOUR_TOKEN" }
});
```

#### Events Received

| Event              | Payload                    | Description                          |
|--------------------|----------------------------|--------------------------------------|
| `state-update`     | Full player state object   | Fired on any state change            |
| `playlist-created` | Playlist object            | A new playlist was created           |
| `playlist-deleted` | Playlist ID (string)       | A playlist was deleted               |

#### State Object Shape

```javascript
{
  video: {
    title: "Song Title",
    author: "Artist Name",
    album: "Album Name",
    durationSeconds: 234,
    likeStatus: 1,          // -1=Unknown, 0=Dislike, 1=Indifferent, 2=Like
    thumbnails: [
      { url: "https://...", width: 226, height: 226 },
      { url: "https://...", width: 544, height: 544 }
    ]
  },
  player: {
    trackState: 1,          // -1=Unknown, 0=Paused, 1=Playing, 2=Buffering
    videoProgress: 45.2,    // seconds elapsed
    volume: 75,
    muted: false,
    queue: {
      items: [ { title, author, duration, selected, thumbnails } ],
      automixItems: [ ... ],
      repeatMode: 0         // 0=None, 1=All, 2=One
    }
  }
}
```

---

## UI Layout

### Desktop

```
┌──────────────────────────────────────────────────────────┐
│  ▶ Companion  ● Connected                          ⏻   │ ← Top bar
├──────────────────────────────────────────┬───────────────┤
│                                          │  Up Next │ PL │ ← Tabs
│            ┌──────────────┐              │───────────────│
│            │              │              │  ♪ Track 1    │
│            │  Album Art   │              │  ♪ Track 2 ◄  │ ← Queue
│            │   (large)    │              │  ♪ Track 3    │
│            │              │              │  ♪ Track 4    │
│            └──────────────┘              │               │
│                                          │               │
├──────────────────────────────────────────┴───────────────┤
│ 🖼 Title   ♡ 👎  ⤮ ⏮ ⏸ ⏭ 🔁  0:45 ━━━━━● 3:30  🔊━━○ │ ← Player bar
└──────────────────────────────────────────────────────────┘
```

- Large album art centered in the main area
- Right sidebar with tabbed Queue / Playlists panel
- Bottom bar: mini thumb, track info, controls, progress, volume

### Mobile (≤ 640px)

```
┌─────────────────────┐
│ ▶ Companion  ≡  ⏻   │ ← Top bar
├─────────────────────┤
│    Song Title       │
│    Artist Name      │ ← Track info (top)
│                     │
│      ╭─────╮        │
│     │ ○○○○ │        │
│     │ ART  │        │ ← Circular album art
│     │ ○○○○ │        │
│      ╰─────╯        │
│                     │
│     ♡       👎      │ ← Like/Dislike
│                     │
│ 0:45 ━━━━━━● 3:30  │ ← Progress bar
│                     │
│   ⤮  ⏮  ⏸  ⏭  🔁  │ ← Large controls
└─────────────────────┘
```

- Full-screen player layout
- Circular album art
- Queue opens as a slide-up overlay (via ≡ button)

---

## Theming

The design follows a **YouTube Red** dark theme:

| Token              | Value                        | Usage                    |
|--------------------|------------------------------|--------------------------|
| `--bg`             | `#0f0f0f`                    | App background           |
| `--bg-elevated`    | `#1a1a1a`                    | Bars, panels, cards      |
| `--bg-surface`     | `#212121`                    | Input backgrounds        |
| `--red`            | `#FF0000`                    | Accents, progress, likes |
| `--text`           | `#e8eaed`                    | Primary text             |
| `--text-secondary` | `#aaaaaa`                    | Subtitles, muted info    |
| `--white`          | `#ffffff`                    | Play button              |

Customize by editing the `:root` CSS variables in `style.css`.

---

## Troubleshooting

| Issue                         | Solution                                                  |
|-------------------------------|-----------------------------------------------------------|
| **429 Rate Limiting**         | The app uses WebSocket for state — avoid polling REST API |
| **CORS errors (direct mode)** | Enable CORS wildcard in YTMD settings, or use proxy mode  |
| **Stale UI after changes**    | Hard-refresh (`Ctrl+Shift+R`) — server sends no-cache     |
| **Can't connect**             | Check YTMD is running, companion server is enabled, and the token is valid |
| **Queue empty**               | Queue appears only when YTMD is actively playing          |

---

## License

This project is a companion interface for [ytmdesktop](https://github.com/ArnoldsAventuresTeam/ytmdesktop) and follows its license terms.
