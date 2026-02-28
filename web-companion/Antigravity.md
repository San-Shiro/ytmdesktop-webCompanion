# YTMD Web Companion — Technical Documentation

## Overview

The web companion dashboard is **bundled directly into the YTMD Electron app** — no separate server, no proxy, no API token. Access at `http://localhost:9863/dashboard` (or `http://<LAN_IP>:9863/dashboard` from phone on same WiFi).

**Authentication:** Password-based login (default: `ytmd`). Configurable from Settings → Integrations → Dashboard password.

---

## Architecture

### Bundled Dashboard (Built-in)

```
Phone/Browser → http://192.168.x.x:9863/dashboard → Fastify (same companion server)
                                                    → /dashboard/login (POST)
                                                    → /api/v1/* (cookie-based auth)
                                                    → /api/v1/realtime (WebSocket)
```

The dashboard is served by the **existing Fastify companion server** at `/dashboard`. No proxy, no separate process. Cookie-based session auth bypasses both API token validation and rate limiting.

### File Structure

| File | Location | Purpose |
|------|----------|---------|
| `dashboard/index.html` | `src/main/integrations/companion-server/dashboard/` | UI — login page + dashboard views + player bar |
| `dashboard/app.js` | Same directory | App logic — cookie-based API client, socket, router, renderers |
| `dashboard/style.css` | Same directory | YTM-matching dark theme, responsive breakpoints |
| `auth.ts` | `api-shared/` | Dashboard session management + auth bypass middleware |
| `index.ts` | `companion-server/` | Dashboard routes, static serving, `getLocalIP()` |

### Build Pipeline

Dashboard files are static (HTML/JS/CSS) copied to the Vite output via a custom inline plugin in `viteconfig/main.ts`:

```typescript
{
  name: "copy-dashboard",
  writeBundle() {
    cpSync(src, dest, { recursive: true });  // → .vite/main/dashboard/
  }
}
```

---

## Authentication Flow

### Password Login (Cookie-Based)

```
Browser                         Companion Server
  |                                    |
  |-- POST /dashboard/login ---------->| Body: { password: "ytmd" }
  |<-- Set-Cookie: ytmd_session=UUID --| httpOnly, sameSite=lax
  |                                    |
  |-- GET /api/v1/home --------------->| Cookie: ytmd_session=UUID
  |<-- 200 OK (bypasses token auth) --|
  |                                    |
  |-- WS /api/v1/realtime ------------>| Cookie parsed from handshake headers
  |<-- Connected (bypasses token) ----|
```

### Session Management

- Sessions stored in-memory (`Set<string>` in `auth.ts`)
- `addDashboardSession(sessionId)` — called on login success
- `isDashboardSession(request)` — checks `request.cookies.ytmd_session`
- `isDashboardSessionId(sessionId)` — checks raw ID (used for socket.io)
- `clearDashboardSessions()` — clears all (on server restart)

### Auth Bypass

Dashboard sessions bypass both layers:
1. **HTTP auth** — `isAuthValidMiddleware()` checks cookie before `Authorization` header
2. **Socket auth** — `io.of("/api/v1/realtime").use()` parses cookie from `socket.handshake.headers.cookie`
3. **Rate limiting** — Not bypassed (uses same global limits), but no 429 issues since global limit is 500/min

---

## Settings (Store Schema)

Added to `integrations` in `src/shared/store/schema.ts`:

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `companionDashboardEnabled` | boolean | `true` | Toggle dashboard serving at `/dashboard` |
| `companionDashboardPassword` | string | `"ytmd"` | Password for dashboard login |

Settings UI in `Settings.vue` → Integrations tab:
- **Web dashboard** checkbox (gated by companion server enabled)
- **Dashboard password** text input (gated by dashboard enabled)

---

## Dashboard Routes

All routes registered in `companion-server/index.ts`:

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/dashboard` | GET | None | Serves `index.html` (returns 404 if dashboard disabled) |
| `/dashboard/*` | GET | None | Static files (app.js, style.css) via `@fastify/static` |
| `/dashboard/login` | POST | None | Validates password, sets session cookie |
| `/dashboard/session` | GET | Cookie | Checks if session cookie is valid (204 or 401) |
| `/dashboard/info` | GET | None | Returns `{ localIp, port, dashboardUrl }` |
| `/metadata` | GET | None | Now includes `dashboardUrl` field |

---

## Local IP Detection

`getLocalIP()` in `companion-server/index.ts`:
- Scans `os.networkInterfaces()` for non-internal IPv4 addresses
- Skips `169.254.x.x` (APIPA/link-local addresses from disconnected adapters)
- Prefers common LAN ranges: `192.168.x.x`, `10.x.x.x`, `172.x.x.x`
- Falls back to any other non-internal IPv4, then `"localhost"`

Displayed in dashboard Settings view (`#settings-dashboard-url`).

---

## API Endpoints Used

All endpoints under `/api/v1/`. The dashboard `api()` function uses same-origin `fetch()` with `credentials: "same-origin"`.

### State & Realtime

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/realtime` | WebSocket | Socket.IO — live state updates (cookie auth) |
| `/api/v1/state` | GET | One-shot state fetch |

**Socket.IO Events:** `state-update`, `playlist-created`, `playlist-deleted`

### Playback Commands

| Endpoint | Method | Body | Description |
|----------|--------|------|-------------|
| `/api/v1/command` | POST | `{ command, data }` | Sends any playback command |

**Commands:** `playPause`, `play`, `pause`, `next`, `previous`, `toggleLike`, `toggleDislike`, `shuffle`, `seekTo`, `setVolume`, `mute`, `unmute`, `playQueueIndex`, `changeVideo`, `addToQueue`, `playNext`, `toggleLibrary`

### Content Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/home` | GET | Home page shelves |
| `/api/v1/search?q=...&filter=...` | GET | Search results |
| `/api/v1/browse/:browseId` | GET | Album, artist, or playlist content |
| `/api/v1/playlists` | GET | User's playlists |
| `/api/v1/lyrics` | GET | Lyrics for current song |
| `/api/v1/explore` | GET | Explore/discover page |
| `/api/v1/history` | GET | Listening history |
| `/api/v1/playlists/:id/add` | POST | Add video to playlist |

---

## State Object Structure

The `state-update` socket event delivers:

```javascript
{
  player: {
    trackState: 1,          // 1 = PLAYING, 2 = PAUSED
    videoProgress: 45.2,    // Current position in seconds
    volume: 72,             // 0-100
    muted: false,
    queue: {
      items: [{ videoId, title, author, duration, thumbnails }],
      automixItems: [...],
      selectedItemIndex: 2,
      repeatMode: "NONE",   // "NONE", "ALL", "ONE"
      playlistId: "RDMM..."
    }
  },
  video: {
    id: "dQw4w9WgXcQ",
    title: "Never Gonna Give You Up",
    author: "Rick Astley",
    durationSeconds: 213,
    likeStatus: "LIKE",     // "LIKE", "DISLIKE", "INDIFFERENT"
    thumbnails: [{ url, width, height }]
  }
}
```

---

## Application Architecture

### Initialization Flow

```
1. bindEvents()                — attach all DOM handlers
2. fetch /dashboard/session    — check existing cookie
3. If valid → showScreen("dashboard") → startDashboard()
4. If not → showScreen("login")
```

### Router (`navigateTo()`)

| View | Trigger | Loader |
|------|---------|--------|
| Home | Sidebar/nav click | `loadHome()` → `renderShelves()` |
| Search | Search input | `performSearch()` → `renderShelves()` |
| Library | Sidebar/nav click | `loadLibrary()` → `renderPlaylistList()` |
| Browse | Album/playlist click | `loadBrowse()` → `renderBrowseDetail()` |
| Playback | Player bar click | Shows queue + album art |
| Settings | Sidebar/nav click | Shows dashboard URL + status |

### Browse Detail Rendering

`renderBrowseDetail()` auto-detects content type:
- **Track items** (have `videoId`/`duration`) → renders as numbered track list
- **Browseable cards** (have `browseId`) → renders as shelves with card rows

### Card Click Priority

`createMusicCard()` prioritizes `browseId` > `videoId`:
- If `browseId` → navigates to browse detail (album/artist/playlist)
- If only `videoId` → plays the song

---

## Caching

| Data | Cache | Invalidation |
|------|-------|-------------|
| Home shelves | `sessionStorage` | Refresh button / page reload |
| Playlists | In-memory | Socket events |
| Browse detail | In-memory Map | Session duration |
| Queue | Fingerprint comparison | Content change |

---

## Responsive Design

| Breakpoint | Changes |
|-----------|---------|
| **Desktop (>900px)** | Full sidebar, search bar, volume slider |
| **Tablet (≤900px)** | Narrower queue panel, smaller cards |
| **Mobile (≤640px)** | Bottom nav, search icon, vertical playback |

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Space | Play/Pause |
| → | Next track |
| ← | Previous track |
| ↑ | Volume up |
| ↓ | Volume down |
| M | Toggle mute |

---

## Dependencies Added

| Package | Purpose |
|---------|---------|
| `@fastify/cookie` | Parse/set session cookies |
| `@fastify/static` | Serve dashboard static files at `/dashboard/` |

---

## Legacy Standalone Mode

The `web-companion/` directory still contains the original standalone version (requires separate server + proxy + API token). The bundled dashboard in `src/main/integrations/companion-server/dashboard/` replaces this for production use.
