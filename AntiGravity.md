# AntiGravity Technical Documentation

This document provides a technical deep-dive into the **YTMD Web Companion** project for future AI assistants. It describes the architecture, implementation details, and interaction patterns of the remote UI.

## 🏗️ Architecture Overview

The project is a client-server architecture designed to remotely control the YouTube Music Desktop App (YTMD) through its Companion Server API.

- **Backend (Proxy Server)**: `server.js` (Express-based)
  - Acts as a proxy to bypass CORS restrictions.
  - Serves static files from the root.
  - Handles initial configuration logic.
- **Frontend (SPA)**: HTML/CSS/JS in `web-companion/`
  - A Single Page Application (SPA) using a custom hash-less router (DOM-based view switching).
  - Uses CSS Grid/Flexbox for a responsive "YouTube Music" themed layout.
  - Communicates with the YTMD API via REST (commands/data) and Socket.io (real-time state).

## 🛠️ File Descriptions

### `web-companion/app.js` (The Brain)
- **State Management**: Maintains `currentState` synced via the `state-update` socket event.
- **API Client**: Modular functions for fetching Home, Search, Browse, Explore, History, Lyrics, and Queue Chips.
- **Routing**: `navigateTo(viewName)` function toggles visibility between containers (Home, Search, Explore, Library, History, Browse, Playback, Settings).
- **Caching**: 
  - `sessionStorage`: Used for Home feed to reduce API load.
  - `Map` (browseCache): In-memory cache for browse pages (albums/artists) during the session.
- **Interaction Logic**:
  - `sendCommand(command, data)`: Unified entry point for all player controls.
  - `renderState(state)`: Reactive-style function that updates the DOM whenever the player state changes.
  - **Playback Tab Logic**: Handles switching between Up Next, Lyrics, and Related panels.

### `web-companion/index.html` (The Structure)
- **Multi-View Layout**: Contains hidden-by-default containers for different app states.
- **Playback View**: Implements a two-column desktop layout (Left: Art, Right: Tabbed Info) and a stacked mobile layout.
- **Persistent Player Bar**: A fixed footer containing transport controls, progress bar (using `range` input for seeking), and track metadata.
- **Components**: Sidebar (desktop-only rail), Bottom Nav (mobile-only), Context Menu, and Toast notifications.

### `web-companion/style.css` (The Design)
- **Theme Variables**: Defined in `:root` for colors matching YouTube Music's dark theme (#0f0f0f background, red accents).
- **Responsive Design**: 
  - Desktop: Sidebar with main content area.
  - Mobile (< 640px): Sidebar hides, Bottom Nav shows, Playback view stacks.
- **Component Styling**: Custom styles for music cards, shelf grids, track lists, and skeleton loaders for transitions.

### `web-companion/server.js` (The Proxy)
- **Express Server**: Listens on port 5099.
- **CORS Proxy**: Routes all `/api/v1` requests to the configured YTMD port (default 9863).
- **Static Hosting**: Serves the `web-companion` directory.

## 📡 API Interaction

The app consumes the Companion API documented in `API.md`.
- **Primary Transport**: REST (mostly `GET` for data and `POST` to `/command`).
- **Real-time**: Socket.io `/api/v1/realtime` namespace.
- **Advanced Features**:
  - `/queue/chips`: Mood-based autoplay filtering.
  - `/next/`: Related songs and Up Next sequence.
  - `/explore`: Personalized charts and moods.

## 🚦 UI Workflows
1. **Connection**: User enters credentials -> app verifies via `/metadata` -> Socket.io connection established -> transitions to Home.
2. **Search**: Debounced input triggers `/search` -> results rendered as shelves -> clicking a song triggers `changeVideo` command -> transitions to Playback view.
3. **Playback**: real-time update loop ensures `renderState` is called on every websocket packet. Progress bar uses local interpolation (setInterval) to ensure smoothness between server updates.
