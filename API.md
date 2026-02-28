# WebCompanion API Documentation

> **Base URL**: `http://localhost:{PORT}` (default port: `9863`)  
> **Auth**: All `/api/v1/*` endpoints require `Authorization: {token}` header  
> **Content-Type**: `application/json`

---

## Authentication

### `GET /metadata`
Returns available API versions. **No auth required.**

```bash
curl http://localhost:9863/metadata
```
```json
{ "apiVersions": ["v1"] }
```

### `POST /api/v1/auth/requestcode`
Request a pairing code. A popup appears on the desktop app for the user to approve.

```bash
curl -X POST http://localhost:9863/api/v1/auth/requestcode \
  -H "Content-Type: application/json" \
  -d '{"appId":"my-app","appName":"My App","appVersion":"1.0.0"}'
```
```json
{ "code": "XXXX" }
```

### `POST /api/v1/auth/request`
Exchange the pairing code for a persistent auth token.

```bash
curl -X POST http://localhost:9863/api/v1/auth/request \
  -H "Content-Type: application/json" \
  -d '{"appId":"my-app","code":"XXXX"}'
```
```json
{ "token": "your_auth_token_here" }
```

---

## Player State

### `GET /api/v1/state`
Get current player state. Rate limited to 1 req / 5 seconds — use the WebSocket for realtime updates.

```bash
curl -H "Authorization: YOUR_TOKEN" http://localhost:9863/api/v1/state
```

<details>
<summary>Response</summary>

```json
{
  "player": {
    "trackState": "PLAYING",
    "videoProgress": 45.2,
    "volume": 50,
    "muted": false,
    "adPlaying": false,
    "queue": {
      "autoplay": true,
      "items": [],
      "automixItems": [],
      "isGenerating": false,
      "isInfinite": false,
      "repeatMode": "NONE",
      "selectedItemIndex": 0
    }
  },
  "video": {
    "author": "Rick Astley",
    "channelId": "UCuAXFkgsw1L7xaCfnd5JJOw",
    "title": "Never Gonna Give You Up",
    "album": "Whenever You Need Somebody",
    "albumId": "MPREb_dcYZhAh5urI",
    "likeStatus": "LIKE",
    "thumbnails": [
      { "url": "https://...", "width": 226, "height": 226 },
      { "url": "https://...", "width": 576, "height": 576 }
    ],
    "durationSeconds": 213,
    "id": "dQw4w9WgXcQ"
  }
}
```
</details>

### WebSocket — Realtime State Updates
Connect to `/api/v1/realtime` for live player state updates.

```javascript
const io = require("socket.io-client");
const socket = io("http://localhost:9863/api/v1/realtime", {
  auth: { token: "YOUR_TOKEN" }
});

socket.on("state-update", (state) => {
  console.log("Now playing:", state.video.title);
});

socket.on("playlist-created", (playlist) => { /* ... */ });
socket.on("playlist-deleted", (playlistId) => { /* ... */ });
```

---

## Player Commands

### `POST /api/v1/command`
Send a command to control the player. Returns `204 No Content` on success.

```bash
curl -X POST -H "Authorization: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:9863/api/v1/command \
  -d '{"command":"playPause"}'
```

#### Available Commands

| Command | Data | Description |
|---|---|---|
| `playPause` | — | Toggle play/pause |
| `play` | — | Play |
| `pause` | — | Pause |
| `next` | — | Skip to next track |
| `previous` | — | Go to previous track |
| `shuffle` | — | Toggle shuffle |
| `toggleLike` | — | Toggle like on current track |
| `toggleDislike` | — | Toggle dislike on current track |
| `toggleLibrary` | — | Add/remove current track from library |
| `mute` | — | Mute volume |
| `unmute` | — | Unmute volume |
| `volumeUp` | — | Increase volume |
| `volumeDown` | — | Decrease volume |
| `setVolume` | `number` (0-100) | Set volume to specific level |
| `seekTo` | `number` (seconds) | Seek to position in current track |
| `repeatMode` | `"NONE"` / `"ALL"` / `"ONE"` | Set repeat mode |
| `playQueueIndex` | `number` | Play track at queue index |
| `changeVideo` | `{videoId, playlistId?}` | Navigate to specific video |
| `addToQueue` | `string` (videoId) | Add song to end of queue |
| `playNext` | `string` (videoId) | Insert song as next in queue |
| `removeQueueIndex` | `number` | Remove song at queue index |
| `moveQueueItem` | `{from, to}` | Move song from one queue position to another |
| `addToPlaylist` | `{playlistId, videoId?}` | Add song to a playlist |

#### Examples

```bash
# Set volume to 75%
curl -X POST -H "Authorization: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:9863/api/v1/command \
  -d '{"command":"setVolume","data":75}'

# Seek to 1:30
curl -X POST -H "Authorization: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:9863/api/v1/command \
  -d '{"command":"seekTo","data":90}'

# Add song to queue
curl -X POST -H "Authorization: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:9863/api/v1/command \
  -d '{"command":"addToQueue","data":"dQw4w9WgXcQ"}'

# Play a specific video
curl -X POST -H "Authorization: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:9863/api/v1/command \
  -d '{"command":"changeVideo","data":{"videoId":"dQw4w9WgXcQ"}}'

# Move song from position 3 to position 0 (top of queue)
curl -X POST -H "Authorization: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:9863/api/v1/command \
  -d '{"command":"moveQueueItem","data":{"from":3,"to":0}}'
```

---

## Playlists & Lyrics

### `GET /api/v1/playlists`
Get the user's playlists.

```bash
curl -H "Authorization: YOUR_TOKEN" http://localhost:9863/api/v1/playlists
```
```json
[
  {
    "id": "PLxxxxxxx",
    "title": "My Playlist",
    "thumbnails": [
      { "url": "https://lh3.googleusercontent.com/...", "width": 226, "height": 226 }
    ],
    "containsVideo": false
  },
  {
    "id": "PLyyyyyyy",
    "title": "Favorites",
    "thumbnails": [
      { "url": "https://lh3.googleusercontent.com/...", "width": 226, "height": 226 }
    ],
    "containsVideo": true
  }
]
```

### `POST /api/v1/playlists/:playlistId/add`
Add a song to a specific playlist.

```bash
curl -X POST -H "Authorization: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:9863/api/v1/playlists/PLxxxxxxx/add \
  -d '{"videoId":"dQw4w9WgXcQ"}'
```
```json
{ "success": true, "status": "ADDED" }
```

### `GET /api/v1/lyrics`
Get lyrics for the currently playing song.

```bash
curl -H "Authorization: YOUR_TOKEN" http://localhost:9863/api/v1/lyrics
```
```json
{
  "lyrics": "We're no strangers to love\nYou know the rules...",
  "source": "LyricFind"
}
```

---

## Search

### `GET /api/v1/search`
Search YouTube Music. Returns results matching the query with optional category filtering.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `q` | string | ✅ | Search query |
| `filter` | string | ❌ | `songs`, `videos`, `albums`, `artists`, or `playlists` |

**Rate limit**: 10 requests / 60 seconds

```bash
# Search for songs
curl -H "Authorization: YOUR_TOKEN" \
  "http://localhost:9863/api/v1/search?q=never+gonna+give+you+up&filter=songs"

# Search all categories
curl -H "Authorization: YOUR_TOKEN" \
  "http://localhost:9863/api/v1/search?q=rick+astley"
```

<details>
<summary>Response (filtered by songs)</summary>

```json
{
  "query": "never gonna give you up",
  "filter": "songs",
  "sections": [
    {
      "title": "Songs",
      "items": [
        {
          "thumbnails": [
            { "url": "https://lh3.googleusercontent.com/...", "width": 60, "height": 60 },
            { "url": "https://lh3.googleusercontent.com/...", "width": 120, "height": 120 }
          ],
          "title": "Never Gonna Give You Up",
          "videoId": "lYBUbBu4W08",
          "subtitle": [
            { "text": "Rick Astley", "browseId": "UCwZEU0wAwIyZb4x5G_KJp2w", "pageType": "MUSIC_PAGE_TYPE_ARTIST" },
            { "text": "Whenever You Need Somebody", "browseId": "MPREb_dcYZhAh5urI", "pageType": "MUSIC_PAGE_TYPE_ALBUM" },
            { "text": "3:34" }
          ]
        }
      ]
    }
  ]
}
```
</details>

> **Tip**: Use the `videoId` from search results with the `changeVideo` command to play a song, or `addToQueue` to queue it.

---

## Home Recommendations

### `GET /api/v1/home`
Get personalized home feed recommendations — identical to the YouTube Music mobile app's home screen. Returns sections like "Listen again", "Forgotten favorites", "Mixed for you", "Albums for you", etc.

**Rate limit**: 3 requests / 60 seconds

```bash
curl -H "Authorization: YOUR_TOKEN" http://localhost:9863/api/v1/home
```

<details>
<summary>Response</summary>

```json
{
  "sections": [
    {
      "title": "Albums for you",
      "strapline": null,
      "items": [
        {
          "title": "Dhurandhar",
          "subtitle": "Album • Shashwat Sachdev",
          "thumbnails": [
            { "url": "https://lh3.googleusercontent.com/...", "width": 226, "height": 226 },
            { "url": "https://lh3.googleusercontent.com/...", "width": 544, "height": 544 }
          ],
          "browseId": "MPREb_X2GiOAX5vef"
        }
      ]
    },
    {
      "title": "Trending community playlists",
      "strapline": null,
      "items": [
        {
          "title": "Hindi song ✨",
          "subtitle": "creative world 🖤 • 9.8M views",
          "thumbnails": [ ... ],
          "browseId": "VLPLsCpxlE_CVMPpIsa7HW402D5jN5c6-weB"
        }
      ]
    }
  ]
}
```
</details>

> **Tip**: Use the `browseId` from items with `/browse/:browseId` to get full album/playlist/artist details.

---

## Browse

### `GET /api/v1/browse/:browseId`
Browse detailed content for an album, artist, playlist, or any YouTube Music entity. Use `browseId` values from search results, home feed, or next/related endpoints.

| Parameter | Type | Description |
|---|---|---|
| `browseId` | string (path) | The browse ID (e.g., `MPREb_dcYZhAh5urI` for an album, `UCwZEU0wAwIyZb4x5G_KJp2w` for an artist) |

**Rate limit**: 5 requests / 30 seconds

```bash
# Browse an album
curl -H "Authorization: YOUR_TOKEN" \
  http://localhost:9863/api/v1/browse/MPREb_dcYZhAh5urI

# Browse an artist
curl -H "Authorization: YOUR_TOKEN" \
  http://localhost:9863/api/v1/browse/UCwZEU0wAwIyZb4x5G_KJp2w
```

<details>
<summary>Response (album)</summary>

```json
{
  "header": {
    "title": "Whenever You Need Somebody",
    "subtitle": "Rick Astley • Album • 1987 • 10 songs",
    "thumbnails": [ ... ],
    "description": null
  },
  "sections": [
    {
      "title": null,
      "items": [
        {
          "title": "Never Gonna Give You Up",
          "subtitle": "Rick Astley",
          "videoId": "dQw4w9WgXcQ",
          "thumbnails": [ ... ]
        }
      ]
    }
  ]
}
```
</details>

---

## Song Metadata

### `GET /api/v1/song/:videoId`
Get detailed metadata for a specific song by its video ID. Returns comprehensive info including view count, publish date, category, and multiple thumbnail sizes.

| Parameter | Type | Description |
|---|---|---|
| `videoId` | string (path) | YouTube video ID (e.g., `dQw4w9WgXcQ`) |

**Rate limit**: 5 requests / 30 seconds

```bash
curl -H "Authorization: YOUR_TOKEN" \
  http://localhost:9863/api/v1/song/dQw4w9WgXcQ
```

<details>
<summary>Response</summary>

```json
{
  "videoId": "dQw4w9WgXcQ",
  "title": "Never Gonna Give You Up",
  "author": "Rick Astley",
  "channelId": "UCuAXFkgsw1L7xaCfnd5JJOw",
  "lengthSeconds": 213,
  "isLive": false,
  "isPrivate": false,
  "thumbnails": [
    { "url": "https://i.ytimg.com/vi/dQw4w9WgXcQ/sddefault.jpg?...", "width": 400, "height": 225 },
    { "url": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hq720.jpg?...", "width": 800, "height": 450 },
    { "url": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hq720.jpg?...", "width": 853, "height": 480 }
  ],
  "viewCount": 1745263107,
  "shortDescription": null,
  "keywords": [],
  "category": "Music",
  "publishDate": "2009-10-24T23:57:33-07:00",
  "uploadDate": "2009-10-24T23:57:33-07:00"
}
```
</details>

---

## Up Next / Related Songs

### `GET /api/v1/next/:videoId`
Get the "Up Next" queue and related content for a specific song. Includes the current song's details, upcoming tracks, related artists, and a lyrics browse ID.

| Parameter | Type | Description |
|---|---|---|
| `videoId` | string (path) | YouTube video ID |
| `playlistId` | string (query, optional) | Playlist context for more accurate results |

**Rate limit**: 5 requests / 30 seconds

```bash
# Basic usage
curl -H "Authorization: YOUR_TOKEN" \
  http://localhost:9863/api/v1/next/dQw4w9WgXcQ

# With playlist context
curl -H "Authorization: YOUR_TOKEN" \
  "http://localhost:9863/api/v1/next/dQw4w9WgXcQ?playlistId=RDAMVMdQw4w9WgXcQ"
```

<details>
<summary>Response</summary>

```json
{
  "videoId": "dQw4w9WgXcQ",
  "currentSong": {
    "videoId": "dQw4w9WgXcQ",
    "title": "Never Gonna Give You Up",
    "artists": "Rick Astley • 1.7B views • 18M likes",
    "duration": "3:34",
    "thumbnails": [
      { "url": "https://i.ytimg.com/vi/dQw4w9WgXcQ/sddefault.jpg?...", "width": 400, "height": 225 },
      { "url": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hq720.jpg?...", "width": 800, "height": 450 }
    ],
    "selected": true
  },
  "upNext": [
    {
      "videoId": "...",
      "title": "Together Forever",
      "artists": "Rick Astley",
      "duration": "3:24",
      "thumbnails": [ ... ]
    }
  ],
  "relatedSections": [ ... ],
  "lyrics": {
    "browseId": "MPLYt_6AEOVn4k62q"
  },
  "relatedArtists": [ ... ],
  "relatedBrowseId": "MPTRt_6AEOVn4k62q"
}
```
</details>

> **Tip**: Use the `lyrics.browseId` with `/browse/:browseId` to fetch full lyrics data.

---

## Explore

### `GET /api/v1/explore`
Get the Explore page — charts, new releases, moods & genres. Returns carousels and mood/genre chips with `browseId` links.

**Rate limit**: 5 requests / 60 seconds

```bash
curl -H "Authorization: YOUR_TOKEN" http://localhost:9863/api/v1/explore
```

<details>
<summary>Response</summary>

```json
{
  "sections": [
    {
      "title": "New releases",
      "items": [
        {
          "title": "Album Name",
          "subtitle": "Artist Name",
          "thumbnails": [ ... ],
          "browseId": "MPREb_..."
        }
      ]
    },
    {
      "title": "Moods & genres",
      "type": "grid",
      "items": [
        {
          "title": "Chill",
          "browseId": "FEmusic_moods_and_genres_category",
          "params": "...",
          "type": "mood"
        }
      ]
    }
  ]
}
```
</details>

> **Tip**: Use the `browseId` from mood/genre chips with `/browse/:browseId` to get playlists for that mood.

---

## History

### `GET /api/v1/history`
Get the user's listening history — recently played songs grouped by time period.

**Rate limit**: 3 requests / 60 seconds

```bash
curl -H "Authorization: YOUR_TOKEN" http://localhost:9863/api/v1/history
```

<details>
<summary>Response</summary>

```json
{
  "sections": [
    {
      "title": "Today",
      "items": [
        {
          "title": "DARKHAAST",
          "subtitle": "Mithoon • Tum Bin 2",
          "videoId": "abc123",
          "duration": "6:15",
          "thumbnails": [ ... ]
        }
      ]
    },
    {
      "title": "Yesterday",
      "items": [ ... ]
    }
  ]
}
```
</details>

---

## Queue Mood Chips

### `GET /api/v1/queue/chips`
Get available automix mood filter chips (e.g., "Familiar", "Discover", "Popular", "Deep cuts", "Upbeat", "Chill"). These control the auto-generated queue style.

**Rate limit**: 5 requests / 30 seconds

```bash
curl -H "Authorization: YOUR_TOKEN" http://localhost:9863/api/v1/queue/chips
```
```json
{
  "chips": [
    { "index": 0, "label": "All", "selected": true },
    { "index": 1, "label": "Familiar", "selected": false },
    { "index": 2, "label": "Discover", "selected": false },
    { "index": 3, "label": "Popular", "selected": false },
    { "index": 4, "label": "Deep cuts", "selected": false },
    { "index": 5, "label": "Upbeat", "selected": false },
    { "index": 6, "label": "Chill", "selected": false }
  ]
}
```

### `POST /api/v1/queue/chips`
Select an automix mood filter chip by index.

```bash
# Switch to "Upbeat" mood
curl -X POST -H "Authorization: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:9863/api/v1/queue/chips \
  -d '{"index": 5}'
```
```json
{ "success": true, "selectedIndex": 5, "label": "Upbeat" }
```

> **Note**: Chips are only available when the queue panel is open with Autoplay enabled. If the queue is closed, the endpoint returns an empty chips array.

---

## Sleep Timer

### `POST /api/v1/sleep-timer`
Set a sleep timer that automatically pauses playback after the specified duration. Set minutes to `0` or omit to cancel.

**Rate limit**: 5 requests / 30 seconds

```bash
# Set 30 minute sleep timer
curl -X POST -H "Authorization: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:9863/api/v1/sleep-timer \
  -d '{"minutes": 30}'
```
```json
{ "active": true, "remainingSeconds": 1800 }
```

```bash
# Cancel sleep timer
curl -X POST -H "Authorization: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:9863/api/v1/sleep-timer \
  -d '{"minutes": 0}'
```
```json
{ "active": false, "remainingSeconds": 0 }
```

### `GET /api/v1/sleep-timer`
Get the current sleep timer status.

```bash
curl -H "Authorization: YOUR_TOKEN" http://localhost:9863/api/v1/sleep-timer
```
```json
{ "active": true, "remainingSeconds": 1247 }
```

---

## Common Workflows

### 🔍 Search → Play a Song
```bash
# 1. Search for a song
RESULTS=$(curl -s -H "Authorization: $TOKEN" \
  "http://localhost:9863/api/v1/search?q=bohemian+rhapsody&filter=songs")

# 2. Extract videoId from first result
VIDEO_ID=$(echo $RESULTS | jq -r '.sections[0].items[0].videoId')

# 3. Play it
curl -X POST -H "Authorization: $TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:9863/api/v1/command \
  -d "{\"command\":\"changeVideo\",\"data\":{\"videoId\":\"$VIDEO_ID\"}}"
```

### 🏠 Home → Browse Album → Queue Songs
```bash
# 1. Get home recommendations
HOME=$(curl -s -H "Authorization: $TOKEN" http://localhost:9863/api/v1/home)

# 2. Get browseId of first recommended album
BROWSE_ID=$(echo $HOME | jq -r '.sections[0].items[0].browseId')

# 3. Browse album details
ALBUM=$(curl -s -H "Authorization: $TOKEN" \
  http://localhost:9863/api/v1/browse/$BROWSE_ID)

# 4. Add first track to queue
VIDEO_ID=$(echo $ALBUM | jq -r '.sections[0].items[0].videoId')
curl -X POST -H "Authorization: $TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:9863/api/v1/command \
  -d "{\"command\":\"addToQueue\",\"data\":\"$VIDEO_ID\"}"
```

### 📻 Radio / Related Songs
```bash
# 1. Get related songs for current track
NEXT=$(curl -s -H "Authorization: $TOKEN" \
  http://localhost:9863/api/v1/next/dQw4w9WgXcQ)

# 2. Queue up related songs
echo $NEXT | jq -r '.upNext[].videoId' | while read vid; do
  curl -X POST -H "Authorization: $TOKEN" \
    -H "Content-Type: application/json" \
    http://localhost:9863/api/v1/command \
    -d "{\"command\":\"addToQueue\",\"data\":\"$vid\"}"
done
```

---

## Error Responses

All errors return JSON with an `error` field:

| HTTP Status | Error | Cause |
|---|---|---|
| `401` | `UNAUTHORIZED` | Missing or invalid auth token |
| `400` | `INVALID_VOLUME` | Volume not between 0-100 |
| `400` | `INVALID_POSITION` | Seek position out of range |
| `400` | `INVALID_VIDEO_ID` | Missing video ID |
| `400` | `INVALID_PLAYLIST_ID` | Missing playlist ID |
| `400` | `INVALID_QUEUE_INDEX` | Queue index out of bounds |
| `400` | `INVALID_REPEAT_MODE` | Invalid repeat mode value |
| `408` | `LYRICS_UNAVAILABLE` | No lyrics found for current song |
| `429` | `TOO_MANY_REQUESTS` | Rate limit exceeded |
| `503` | `YOUTUBE_MUSIC_UNAVAILABLE` | YTM page not loaded yet |

```json
{ "error": "UNAUTHORIZED" }
```

---

## Configuration

The companion server port can be configured in **Settings → Integrations → Companion server port** (default: `9863`). Changing the port automatically restarts the server.
