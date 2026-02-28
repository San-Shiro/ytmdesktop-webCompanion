/**
 * YTMD Web Companion — App Controller
 * Matches YouTube Music Desktop layout. Integrates all API endpoints.
 */
(function () {
  "use strict";

  const PROXY_PORT = 5099;
  const STORAGE_KEY = "ytmd_credentials";
  const HOME_CACHE_KEY = "ytmd_home_cache";

  let baseUrl = "";
  let token = "";
  let proxyMode = false;
  let socket = null;
  let currentState = null;
  let progressInterval = null;
  let currentView = "home";
  let previousView = null;
  let browseCache = new Map();
  let lastSearchQuery = "";
  let lastSearchFilter = "";
  let playlistsCache = null;
  let lastVideoId = null;
  let volumeDragging = false;
  let volumeDebounce = null;
  let lastQueueFingerprint = "";

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  // ── DOM refs ───────────────────────────────────────────────
  const connectScreen = $("#connect-screen");
  const dashboardScreen = $("#dashboard-screen");
  const connectForm = $("#connect-form");
  const inputHost = $("#input-host");
  const inputPort = $("#input-port");
  const inputToken = $("#input-token");
  const inputRemember = $("#input-remember");
  const connectError = $("#connect-error");
  const btnRequestToken = $("#btn-request-token");
  const authStatus = $("#auth-status");

  const searchInput = $("#search-input");
  const btnSearchClear = $("#btn-search-clear");
  const statusDot = $("#status-dot");
  const statusLabel = $("#status-label");
  const btnDisconnect = $("#btn-disconnect");
  const sidebar = $("#sidebar");

  const views = {
    home: $("#view-home"), search: $("#view-search"), library: $("#view-library"),
    browse: $("#view-browse"), playback: $("#view-playback"),
    settings: $("#view-settings"),
  };

  const homeContent = $("#home-content");
  const btnRefreshHome = $("#btn-refresh-home");
  const searchFilters = $("#search-filters");
  const searchResultsEl = $("#search-results");
  const libraryContent = $("#library-content");
  const btnRefreshLibrary = $("#btn-refresh-library");
  const btnBrowseBack = $("#btn-browse-back");
  const browseHeader = $("#browse-header");
  const browseTracks = $("#browse-tracks");

  // Playback
  const albumArt = $("#album-art");
  const queueList = $("#queue-list");
  const queueSource = $("#queue-source");

  // Player bar
  const playerBar = $(".player-bar");
  const barProgressFill = $("#bar-progress-fill");
  const barProgressInput = $("#bar-progress-input");
  const barElapsed = $("#bar-elapsed");
  const barTotal = $("#bar-total");
  const barThumb = $("#bar-thumb");
  const barTitle = $("#bar-title");
  const barSubtitle = $("#bar-subtitle");
  const barMetaClick = $("#bar-meta-click");
  const barPlayPause = $("#bar-play-pause");
  const barIconPlay = $("#bar-icon-play");
  const barIconPause = $("#bar-icon-pause");
  const barPrev = $("#bar-prev");
  const barNext = $("#bar-next");
  const barLike = $("#bar-like");
  const barDislike = $("#bar-dislike");
  const barShuffle = $("#bar-shuffle");
  const barMute = $("#bar-mute");
  const volumeSlider = $("#volume-slider");

  // Settings
  const settingsStatus = $("#settings-status");
  const settingsServer = $("#settings-server");
  const btnSettingsDisconnect = $("#btn-settings-disconnect");

  // Context menu
  const contextMenu = $("#context-menu");
  let contextTarget = null;
  const toastContainer = $("#toast-container");

  // ── Utilities ──────────────────────────────────────────────
  function formatTime(s) {
    if (!s || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  function toast(msg, type = "") {
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = msg;
    toastContainer.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  function getThumbUrl(thumbnails, preferred) {
    if (!thumbnails || !thumbnails.length) return "";
    const sorted = [...thumbnails].sort((a, b) => (b.width || 0) - (a.width || 0));
    if (preferred === "small") return sorted[sorted.length - 1]?.url || "";
    return sorted[0]?.url || "";
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  function getSubtitle(item) {
    if (item.subtitle && Array.isArray(item.subtitle)) return item.subtitle.map((s) => s.text).join(" • ");
    if (typeof item.subtitle === "string") return item.subtitle;
    if (item.artists) return item.artists;
    if (item.author) return item.author;
    return "";
  }

  // ── API Client ─────────────────────────────────────────────
  async function api(method, path, body) {
    const url = proxyMode ? path : `${baseUrl}${path}`;
    const opts = { method, headers: { Authorization: token, "Content-Type": "application/json" } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.message || `HTTP ${res.status}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  async function sendCommand(command, data) {
    const body = { command };
    if (data !== undefined) body.data = data;
    try { await api("POST", "/api/v1/command", body); }
    catch (e) { toast(`Command failed: ${e.message}`, "error"); }
  }

  const fetchHome = () => api("GET", "/api/v1/home");
  const fetchSearch = (q, f) => { const p = new URLSearchParams({ q }); if (f) p.set("filter", f); return api("GET", `/api/v1/search?${p}`); };
  const fetchBrowse = (id) => api("GET", `/api/v1/browse/${encodeURIComponent(id)}`);
  const fetchPlaylists = () => api("GET", "/api/v1/playlists");
  const fetchLyrics = () => api("GET", "/api/v1/lyrics");
  const fetchExplore = () => api("GET", "/api/v1/explore");
  const fetchHistory = () => api("GET", "/api/v1/history");
  const fetchQueueChips = () => api("GET", "/api/v1/queue/chips");
  const selectQueueChip = (idx) => api("POST", "/api/v1/queue/chips", { index: idx });
  const fetchNext = (videoId, playlistId) => {
    let path = `/api/v1/next/${encodeURIComponent(videoId)}`;
    if (playlistId) path += `?playlistId=${encodeURIComponent(playlistId)}`;
    return api("GET", path);
  };
  const fetchSleepTimer = () => api("GET", "/api/v1/sleep-timer");
  const setSleepTimer = (minutes) => api("POST", "/api/v1/sleep-timer", { minutes });
  const addToPlaylistApi = (playlistId, videoId) => api("POST", `/api/v1/playlists/${encodeURIComponent(playlistId)}/add`, { videoId });
  const fetchLibraryState = () => api("GET", "/api/v1/library-state");

  // ── Socket ─────────────────────────────────────────────────
  function connectSocket() {
    setConnectionStatus("connecting");
    const socketUrl = proxyMode ? "/api/v1/realtime" : `${baseUrl}/api/v1/realtime`;
    socket = io(socketUrl, { transports: ["websocket"], auth: { token }, reconnection: true, reconnectionDelay: 2000 });

    socket.on("connect", () => { setConnectionStatus("connected"); toast("Connected", "success"); });
    socket.on("disconnect", (r) => { setConnectionStatus("disconnected"); if (r !== "io client disconnect") toast(`Disconnected: ${r}`, "error"); });
    socket.on("connect_error", (e) => { setConnectionStatus("disconnected"); console.error("Socket:", e.message); });
    socket.on("state-update", (state) => { currentState = state; renderState(state); });
    socket.on("playlist-created", () => { playlistsCache = null; toast("Playlist created", "info"); });
    socket.on("playlist-deleted", () => { playlistsCache = null; toast("Playlist deleted", "info"); });
  }

  function disconnectSocket() { if (socket) { socket.disconnect(); socket = null; } clearInterval(progressInterval); currentState = null; }
  function setConnectionStatus(s) {
    statusDot.className = `status-dot ${s}`;
    const label = s.charAt(0).toUpperCase() + s.slice(1);
    if (statusLabel) statusLabel.textContent = label;
    if (settingsStatus) settingsStatus.textContent = label;
  }

  // ── Router ─────────────────────────────────────────────────
  function navigateTo(viewName, opts = {}) {
    if (viewName === currentView && !opts.force) return;
    previousView = currentView;
    currentView = viewName;

    Object.values(views).forEach((v) => { if (v) v.classList.remove("active"); });
    if (views[viewName]) views[viewName].classList.add("active");
    $$(".sidebar-item").forEach((el) => el.classList.toggle("active", el.dataset.view === viewName));
    $$(".bottom-nav-item").forEach((el) => el.classList.toggle("active", el.dataset.view === viewName));

    switch (viewName) {
      case "home": loadHome(); break;
      case "library": loadLibrary(); break;
      case "playback": loadPlaybackData(); break;
      case "settings": updateSettings(); break;
    }
  }

  function navigateToBrowse(browseId) { navigateTo("browse"); loadBrowse(browseId); }

  // ── View Loaders ───────────────────────────────────────────

  // HOME
  async function loadHome(force = false) {
    if (!force) {
      try { const c = sessionStorage.getItem(HOME_CACHE_KEY); if (c) { renderShelves(homeContent, JSON.parse(c).sections || []); return; } } catch (e) {}
    }
    homeContent.innerHTML = '<div class="skeleton-shelf"><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div></div>';
    try {
      const data = await fetchHome();
      if (data?.sections) { sessionStorage.setItem(HOME_CACHE_KEY, JSON.stringify(data)); renderShelves(homeContent, data.sections); }
      else homeContent.innerHTML = '<p class="empty-state">No recommendations</p>';
    } catch (e) { homeContent.innerHTML = `<p class="empty-state">Failed: ${e.message}</p>`; }
  }

  // SEARCH
  let searchDebounce = null;
  async function performSearch(query, filter = "") {
    if (!query || query.length < 2) { searchResultsEl.innerHTML = '<p class="empty-state">Search for songs, albums, or artists…</p>'; return; }
    lastSearchQuery = query; lastSearchFilter = filter;
    searchResultsEl.innerHTML = '<div class="skeleton-shelf"><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div></div>';
    try {
      const data = await fetchSearch(query, filter);
      if (data?.sections?.length) renderShelves(searchResultsEl, data.sections);
      else searchResultsEl.innerHTML = '<p class="empty-state">No results</p>';
    } catch (e) { searchResultsEl.innerHTML = `<p class="empty-state">Search failed: ${e.message}</p>`; }
  }

  // LIBRARY
  async function loadLibrary(force = false) {
    if (playlistsCache && !force) { renderPlaylistList(libraryContent, playlistsCache); return; }
    libraryContent.innerHTML = '<div class="skeleton-track"></div><div class="skeleton-track"></div><div class="skeleton-track"></div>';
    try {
      const data = await fetchPlaylists();
      playlistsCache = data || [];
      renderPlaylistList(libraryContent, playlistsCache);
    } catch (e) { libraryContent.innerHTML = `<p class="empty-state">Failed: ${e.message}</p>`; }
  }

  // BROWSE
  async function loadBrowse(browseId) {
    if (browseCache.has(browseId)) { renderBrowseDetail(browseCache.get(browseId)); return; }
    browseHeader.innerHTML = ""; browseTracks.innerHTML = '<div class="skeleton-track"></div><div class="skeleton-track"></div><div class="skeleton-track"></div>';
    try {
      const data = await fetchBrowse(browseId);
      browseCache.set(browseId, data);
      renderBrowseDetail(data);
    } catch (e) { browseTracks.innerHTML = `<p class="empty-state">Failed: ${e.message}</p>`; }
  }

  // PLAYBACK
  async function loadPlaybackData() {
    const vid = currentState?.video;
    if (!vid?.id) return;
  }



  // SETTINGS
  function updateSettings() {
    if (settingsServer) settingsServer.textContent = proxyMode ? `Proxy (localhost:${PROXY_PORT})` : baseUrl;
  }

  // ── Renderers ──────────────────────────────────────────────

  function renderShelves(container, sections) {
    container.innerHTML = "";
    sections.forEach((section) => {
      if (!section.items?.length) return;
      const shelf = document.createElement("div");
      shelf.className = "shelf";
      if (section.title) { const t = document.createElement("div"); t.className = "shelf-title"; t.textContent = section.title; shelf.appendChild(t); }
      const row = document.createElement("div");
      row.className = "card-row";
      section.items.forEach((item) => row.appendChild(createMusicCard(item)));
      shelf.appendChild(row);
      container.appendChild(shelf);
    });
  }

  function renderExploreSections(container, sections) {
    container.innerHTML = "";
    sections.forEach((section) => {
      if (!section.items?.length) return;
      const shelf = document.createElement("div");
      shelf.className = "shelf";
      if (section.title) { const t = document.createElement("div"); t.className = "shelf-title"; t.textContent = section.title; shelf.appendChild(t); }

      // If mood/genre grid type
      if (section.type === "grid" || section.items[0]?.type === "mood") {
        const grid = document.createElement("div");
        grid.className = "mood-grid";
        section.items.forEach((item) => {
          const chip = document.createElement("button");
          chip.className = "mood-chip";
          chip.textContent = item.title;
          chip.addEventListener("click", () => { if (item.browseId) navigateToBrowse(item.browseId); });
          grid.appendChild(chip);
        });
        shelf.appendChild(grid);
      } else {
        const row = document.createElement("div");
        row.className = "card-row";
        section.items.forEach((item) => row.appendChild(createMusicCard(item)));
        shelf.appendChild(row);
      }
      container.appendChild(shelf);
    });
  }

  function renderHistorySections(container, sections) {
    container.innerHTML = "";
    sections.forEach((section) => {
      if (!section.items?.length) return;
      const group = document.createElement("div");
      group.className = "shelf";
      if (section.title) { const t = document.createElement("div"); t.className = "shelf-title"; t.textContent = section.title; group.appendChild(t); }
      const list = document.createElement("div");
      list.className = "track-list";
      section.items.forEach((item, idx) => list.appendChild(createTrackItem(item, idx + 1)));
      group.appendChild(list);
      container.appendChild(group);
    });
  }

  function createMusicCard(item) {
    const card = document.createElement("div");
    card.className = "music-card";
    const thumbUrl = getThumbUrl(item.thumbnails);
    const hasVideo = !!item.videoId;
    const hasBrowse = !!item.browseId;
    card.innerHTML = `
      <div class="music-card-thumb">
        ${thumbUrl ? `<img src="${thumbUrl}" alt="" loading="lazy" />` : ""}
        ${hasVideo ? '<div class="play-overlay"><svg viewBox="0 0 24 24"><polygon points="8 5 19 12 8 19"/></svg></div>' : ""}
      </div>
      <div class="music-card-info">
        <div class="music-card-title">${escapeHtml(item.title || "")}</div>
        <div class="music-card-subtitle">${escapeHtml(getSubtitle(item))}</div>
      </div>`;
    card.addEventListener("click", () => {
      if (hasVideo) { sendCommand("changeVideo", { videoId: item.videoId }); navigateTo("playback"); toast("Playing: " + item.title, "info"); }
      else if (hasBrowse) navigateToBrowse(item.browseId);
    });
    if (hasVideo) card.addEventListener("contextmenu", (e) => { e.preventDefault(); showContextMenu(e, { videoId: item.videoId, title: item.title }); });
    return card;
  }

  function createTrackItem(item, num) {
    const el = document.createElement("div");
    el.className = "track-item";
    const thumbUrl = getThumbUrl(item.thumbnails, "small");
    el.innerHTML = `
      ${num ? `<span class="track-num">${num}</span>` : ""}
      <div class="track-thumb">${thumbUrl ? `<img src="${thumbUrl}" alt="" loading="lazy" />` : ""}</div>
      <div class="track-meta">
        <div class="track-meta-title">${escapeHtml(item.title || "")}</div>
        <div class="track-meta-subtitle">${escapeHtml(item.subtitle || item.artists || item.author || "")}</div>
      </div>
      <span class="track-duration">${item.duration || ""}</span>`;
    if (item.videoId) {
      el.addEventListener("click", () => { sendCommand("changeVideo", { videoId: item.videoId }); navigateTo("playback"); toast("Playing: " + item.title, "info"); });
      el.addEventListener("contextmenu", (e) => { e.preventDefault(); showContextMenu(e, { videoId: item.videoId, title: item.title }); });
    } else if (item.browseId) el.addEventListener("click", () => navigateToBrowse(item.browseId));
    return el;
  }

  function renderPlaylistList(container, playlists) {
    container.innerHTML = "";
    if (!playlists?.length) { container.innerHTML = '<p class="empty-state">No playlists</p>'; return; }
    const list = document.createElement("div");
    list.className = "track-list";
    playlists.forEach((pl) => {
      const item = document.createElement("div");
      item.className = "track-item";
      item.innerHTML = `<div class="track-thumb">${pl.thumbnails ? `<img src="${getThumbUrl(pl.thumbnails, "small")}" alt="" />` : ""}</div>
        <div class="track-meta"><div class="track-meta-title">${escapeHtml(pl.title || "Untitled")}</div><div class="track-meta-subtitle">Playlist</div></div>`;
      item.addEventListener("click", () => { if (pl.id || pl.browseId) navigateToBrowse(pl.browseId || `VL${pl.id}`); });
      list.appendChild(item);
    });
    container.appendChild(list);
  }

  function renderBrowseDetail(data) {
    browseHeader.innerHTML = ""; browseTracks.innerHTML = "";
    if (!data) return;
    if (data.header) {
      const h = data.header;
      browseHeader.innerHTML = `<div class="browse-header-art">${getThumbUrl(h.thumbnails) ? `<img src="${getThumbUrl(h.thumbnails)}" alt="" />` : ""}</div>
        <div class="browse-header-info"><div class="browse-header-title">${escapeHtml(h.title || "")}</div><div class="browse-header-subtitle">${escapeHtml(h.subtitle || "")}</div></div>`;
    }
    if (data.sections) data.sections.forEach((sec) => {
      if (sec.items) sec.items.forEach((item, idx) => browseTracks.appendChild(createTrackItem(item, idx + 1)));
    });
  }

  // ── State Renderer ─────────────────────────────────────────

  function renderState(state) {
    if (!state) return;
    const video = state.video || {};
    const player = state.player || {};
    const queue = player.queue || {};

    // Player bar
    barTitle.textContent = video.title || "Not Playing";
    barSubtitle.textContent = [video.author, video.album].filter(Boolean).join(" • ");
    const thumbUrl = getThumbUrl(video.thumbnails, "small");
    if (thumbUrl) barThumb.src = thumbUrl;

    // Album art in playback view
    const artUrl = getThumbUrl(video.thumbnails);
    if (artUrl && albumArt.src !== artUrl) {
      albumArt.classList.remove("loaded");
      albumArt.src = artUrl;
      albumArt.onload = () => albumArt.classList.add("loaded");
    }

    // Show player bar
    playerBar.classList.add("visible");

    // Play/pause
    const isPlaying = player.trackState === 1 || player.trackState === "PLAYING";
    barIconPlay.style.display = isPlaying ? "none" : "";
    barIconPause.style.display = isPlaying ? "" : "none";

    // Progress
    const duration = video.durationSeconds || 0;
    const progress = player.videoProgress || 0;
    barTotal.textContent = formatTime(duration);
    updateProgress(progress, duration);

    clearInterval(progressInterval);
    if (isPlaying && duration > 0) {
      let cp = progress;
      progressInterval = setInterval(() => { cp += 0.5; if (cp > duration) cp = duration; updateProgress(cp, duration); }, 500);
    }

    // Like/dislike
    const likeStatus = video.likeStatus;
    barLike.classList.toggle("active", likeStatus === "LIKE" || likeStatus === 2);
    barDislike.classList.toggle("active", likeStatus === "DISLIKE" || likeStatus === 0);


    // Volume — don't overwrite while user is dragging
    const vol = player.volume ?? 50;
    const muted = player.muted || false;
    if (!volumeDragging) volumeSlider.value = vol;
    if ($("#icon-vol-on")) { $("#icon-vol-on").style.display = muted ? "none" : ""; $("#icon-vol-off").style.display = muted ? "" : "none"; }

    // Queue source
    if (queue.playlistId) queueSource.innerHTML = `<strong>Playing from queue</strong>`;
    else queueSource.innerHTML = "";

    // Queue list — only re-render when queue actually changes
    const queueFingerprint = JSON.stringify((queue.items || []).map(i => i.videoId || i.title)) + '|' + (queue.selectedItemIndex ?? -1) + '|' + JSON.stringify((queue.automixItems || []).map(i => i.videoId || i.title));
    if (queueFingerprint !== lastQueueFingerprint) {
      lastQueueFingerprint = queueFingerprint;
      renderQueue(queue);
    }

    // Track change detection
    if (video.id && video.id !== lastVideoId) {
      lastVideoId = video.id;
    }
  }

  function updateProgress(current, total) {
    const pct = total > 0 ? (current / total) * 100 : 0;
    barProgressFill.style.width = pct + "%";
    barProgressInput.value = total > 0 ? Math.round((current / total) * 1000) : 0;
    barElapsed.textContent = formatTime(current);
  }

  function renderQueue(queue) {
    queueList.innerHTML = "";
    const items = queue.items || [];
    const selectedIdx = queue.selectedItemIndex ?? -1;

    items.forEach((item, idx) => {
      const el = document.createElement("div");
      el.className = `track-item ${idx === selectedIdx ? "active" : ""}`;
      el.style.cursor = "pointer";
      const thumbUrl = getThumbUrl(item.thumbnails, "small");
      const isCurrentIcon = idx === selectedIdx ? '<span class="track-playing-icon">🔊</span>' : `<span class="track-num">${idx + 1}</span>`;
      el.innerHTML = `${isCurrentIcon}
        <div class="track-thumb">${thumbUrl ? `<img src="${thumbUrl}" alt="" loading="lazy" />` : ""}</div>
        <div class="track-meta"><div class="track-meta-title">${escapeHtml(item.title || "")}</div><div class="track-meta-subtitle">${escapeHtml(item.author || "")}</div></div>
        <span class="track-duration">${item.duration || ""}</span>`;
      el.addEventListener("click", () => sendCommand("playQueueIndex", idx));
      queueList.appendChild(el);
    });

    // Automix
    const automix = queue.automixItems || [];
    if (automix.length) {
      const d = document.createElement("div"); d.style.cssText = "padding:12px 16px 4px;font-weight:600;font-size:0.75rem;color:var(--text-muted)"; d.textContent = "Autoplay"; queueList.appendChild(d);
      automix.forEach((item, amIdx) => {
        const el = document.createElement("div"); el.className = "track-item";
        el.style.cursor = "pointer";
        const t = getThumbUrl(item.thumbnails, "small");
        el.innerHTML = `<div class="track-thumb">${t ? `<img src="${t}" alt="" loading="lazy" />` : ""}</div>
          <div class="track-meta"><div class="track-meta-title">${escapeHtml(item.title || "")}</div><div class="track-meta-subtitle">${escapeHtml(item.author || "")}</div></div>
          <span class="track-duration">${item.duration || ""}</span>`;
        el.addEventListener("click", () => sendCommand("playQueueIndex", items.length + amIdx));
        queueList.appendChild(el);
      });
    }
  }

  // ── Context Menu ───────────────────────────────────────────
  function showContextMenu(e, target) {
    contextTarget = target;
    contextMenu.hidden = false;
    contextMenu.style.left = Math.min(e.clientX, window.innerWidth - 200) + "px";
    contextMenu.style.top = Math.min(e.clientY, window.innerHeight - 180) + "px";
  }
  function hideContextMenu() { contextMenu.hidden = true; contextTarget = null; }

  // ── Playlist Picker Modal ──────────────────────────────────
  const modalPlaylist = $("#modal-playlist");
  const modalPlaylistList = $("#modal-playlist-list");
  const modalPlaylistClose = $("#modal-playlist-close");
  let pendingPlaylistVideoId = null;

  async function openPlaylistPicker(videoId) {
    pendingPlaylistVideoId = videoId;
    modalPlaylist.hidden = false;
    modalPlaylistList.innerHTML = '<p class="empty-state">Loading playlists…</p>';
    try {
      const playlists = await fetchPlaylists();
      modalPlaylistList.innerHTML = "";
      if (!playlists?.length) { modalPlaylistList.innerHTML = '<p class="empty-state">No playlists found</p>'; return; }
      playlists.forEach((pl) => {
        const item = document.createElement("div");
        item.className = "modal-list-item";
        const thumbUrl = getThumbUrl(pl.thumbnails, "small");
        item.innerHTML = `${thumbUrl ? `<img src="${thumbUrl}" alt="" />` : '<div style="width:40px;height:40px;background:var(--bg-surface);border-radius:4px"></div>'}
          <span class="modal-item-title">${escapeHtml(pl.title || "Untitled")}</span>
          ${pl.containsVideo ? '<span class="modal-item-badge">✓ Added</span>' : ''}`;
        item.addEventListener("click", async () => {
          try {
            await addToPlaylistApi(pl.id, pendingPlaylistVideoId);
            toast(`Added to ${pl.title}`, "success");
            modalPlaylist.hidden = true;
          } catch (e) { toast(`Failed: ${e.message}`, "error"); }
        });
        modalPlaylistList.appendChild(item);
      });
    } catch (e) { modalPlaylistList.innerHTML = `<p class="empty-state">Error: ${e.message}</p>`; }
  }

  modalPlaylistClose.addEventListener("click", () => { modalPlaylist.hidden = true; });
  modalPlaylist.addEventListener("click", (e) => { if (e.target === modalPlaylist) modalPlaylist.hidden = true; });

  // ESC key closes modals
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") modalPlaylist.hidden = true;
  });

  // ── Connection Flow ────────────────────────────────────────
  function showScreen(name) {
    connectScreen.classList.toggle("active", name === "connect");
    dashboardScreen.classList.toggle("active", name === "dashboard");
  }

  function loadSavedCredentials() {
    try { const s = JSON.parse(localStorage.getItem(STORAGE_KEY)); if (s) { inputHost.value = s.host || ""; inputPort.value = s.port || 9863; inputToken.value = s.token || ""; } } catch (e) {}
  }

  function saveCredentials() {
    if (inputRemember.checked) localStorage.setItem(STORAGE_KEY, JSON.stringify({ host: inputHost.value, port: inputPort.value, token: inputToken.value }));
  }

  async function doConnect() {
    const host = inputHost.value.trim();
    const port = inputPort.value.trim() || "9863";
    token = inputToken.value.trim();
    if (!token) { connectError.textContent = "Token is required."; connectError.hidden = false; return; }
    proxyMode = !host; baseUrl = proxyMode ? "" : `http://${host}:${port}`;
    const btn = $("#btn-connect");
    btn.querySelector(".btn-label").textContent = "Connecting…"; btn.disabled = true; connectError.hidden = true;
    try {
      const meta = await api("GET", "/metadata");
      if (!meta?.apiVersions?.includes("v1")) throw new Error("API v1 not supported");
      saveCredentials(); showScreen("dashboard"); connectSocket(); navigateTo("home", { force: true });
    } catch (e) { connectError.textContent = `Failed: ${e.message}`; connectError.hidden = false; }
    finally { btn.querySelector(".btn-label").textContent = "Connect"; btn.disabled = false; }
  }

  function doDisconnect() {
    disconnectSocket(); currentState = null;
    playerBar.classList.remove("visible");
    showScreen("connect"); setConnectionStatus("disconnected");
  }

  async function loadConfig() {
    try { const r = await fetch("/config.json"); if (r.ok) { const c = await r.json(); if (c.host) inputHost.value = c.host; if (c.port) inputPort.value = c.port; if (c.token) inputToken.value = c.token; toast("Config loaded", "success"); } }
    catch (e) { toast("Could not load config.json", "error"); }
  }

  async function requestAuthToken() {
    const appId = $("#auth-app-id").value.trim(), appName = $("#auth-app-name").value.trim(), appVersion = $("#auth-app-version").value.trim();
    if (!appId || !appName) { authStatus.textContent = "App ID and Name required."; authStatus.hidden = false; return; }
    const reqBase = !inputHost.value.trim() ? "" : `http://${inputHost.value.trim()}:${inputPort.value.trim() || "9863"}`;
    authStatus.textContent = "Requesting code…"; authStatus.hidden = false;
    try {
      const cRes = await fetch(reqBase + "/api/v1/auth/requestcode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appId, appName, appVersion }) });
      const cData = await cRes.json();
      if (!cData.code) throw new Error("No code received");
      authStatus.textContent = `Code: ${cData.code} — Approve on desktop…`;
      let att = 0;
      const poll = setInterval(async () => {
        if (++att > 30) { clearInterval(poll); authStatus.textContent = "Timed out."; return; }
        try {
          const tRes = await fetch(reqBase + "/api/v1/auth/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appId, code: cData.code }) });
          if (tRes.ok) { const tData = await tRes.json(); if (tData.token) { clearInterval(poll); inputToken.value = tData.token; authStatus.textContent = "Token received!"; toast("Authorized", "success"); } }
        } catch (e) {}
      }, 2000);
    } catch (e) { authStatus.textContent = `Error: ${e.message}`; }
  }

  // ── Seek & Keyboard ────────────────────────────────────────
  function setupProgressSeek() {
    barProgressInput.addEventListener("input", () => {
      const duration = currentState?.video?.durationSeconds || 0;
      if (duration > 0) {
        const seekPos = Math.floor((barProgressInput.value / 1000) * duration);
        updateProgress(seekPos, duration);
        sendCommand("seekTo", seekPos);
      }
    });
  }

  function setupKeyboard() {
    document.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      switch (e.key) {
        case " ": e.preventDefault(); sendCommand("playPause"); break;
        case "ArrowRight": sendCommand("next"); break;
        case "ArrowLeft": sendCommand("previous"); break;
        case "ArrowUp": e.preventDefault(); sendCommand("volumeUp"); break;
        case "ArrowDown": e.preventDefault(); sendCommand("volumeDown"); break;
        case "m": case "M": sendCommand(currentState?.player?.muted ? "unmute" : "mute"); break;
      }
    });
  }

  // ── Event Bindings ─────────────────────────────────────────
  function bindEvents() {
    connectForm.addEventListener("submit", (e) => { e.preventDefault(); doConnect(); });
    $("#btn-load-config").addEventListener("click", loadConfig);
    $("#btn-toggle-token").addEventListener("click", () => { inputToken.type = inputToken.type === "password" ? "text" : "password"; });
    btnRequestToken.addEventListener("click", requestAuthToken);
    btnDisconnect.addEventListener("click", doDisconnect);
    if (btnSettingsDisconnect) btnSettingsDisconnect.addEventListener("click", doDisconnect);


    // Navigation
    $$(".sidebar-item").forEach((el) => el.addEventListener("click", () => navigateTo(el.dataset.view)));
    $$(".bottom-nav-item").forEach((el) => el.addEventListener("click", () => navigateTo(el.dataset.view)));

    // Search
    searchInput.addEventListener("input", () => {
      const q = searchInput.value.trim();
      btnSearchClear.hidden = !q;
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => { if (q.length >= 2) { navigateTo("search"); performSearch(q, searchFilters.querySelector(".chip.active")?.dataset.filter || ""); } }, 400);
    });
    searchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { const q = searchInput.value.trim(); if (q) { navigateTo("search"); performSearch(q, searchFilters.querySelector(".chip.active")?.dataset.filter || ""); } } });
    btnSearchClear.addEventListener("click", () => { searchInput.value = ""; btnSearchClear.hidden = true; searchResultsEl.innerHTML = '<p class="empty-state">Search for songs, albums, or artists…</p>'; });

    // Mobile search toggle
    const btnSearchToggle = $("#btn-search-toggle");
    const btnSearchClose = $("#btn-search-close");
    const searchBar = $("#search-bar");
    if (btnSearchToggle) btnSearchToggle.addEventListener("click", () => { searchBar.classList.add("expanded"); searchInput.focus(); navigateTo("search"); });
    if (btnSearchClose) btnSearchClose.addEventListener("click", () => { searchBar.classList.remove("expanded"); });

    $$(".chip[data-filter]").forEach((chip) => { chip.addEventListener("click", () => { $$(".chip[data-filter]").forEach((c) => c.classList.remove("active")); chip.classList.add("active"); if (lastSearchQuery) performSearch(lastSearchQuery, chip.dataset.filter); }); });

    // View buttons
    btnRefreshHome.addEventListener("click", () => loadHome(true));
    if (btnRefreshLibrary) btnRefreshLibrary.addEventListener("click", () => loadLibrary(true));

    btnBrowseBack.addEventListener("click", () => navigateTo(previousView || "home"));

    // Playback tabs
    $$(".pb-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        $$(".pb-tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        $$(".pb-panel").forEach((p) => p.classList.remove("active"));
        const panel = $(`#panel-${tab.dataset.tab}`);
        if (panel) panel.classList.add("active");
      });
    });

    // Player bar controls
    barPlayPause.addEventListener("click", () => sendCommand("playPause"));
    barPrev.addEventListener("click", () => sendCommand("previous"));
    barNext.addEventListener("click", () => sendCommand("next"));
    barLike.addEventListener("click", () => sendCommand("toggleLike"));
    barDislike.addEventListener("click", () => sendCommand("toggleDislike"));
    if (barShuffle) barShuffle.addEventListener("click", () => { sendCommand("shuffle"); barShuffle.classList.toggle("active"); toast(barShuffle.classList.contains("active") ? "Shuffle on" : "Shuffle off", "info"); });
    // Volume: debounced input + dragging flag to prevent socket overwrite
    if (volumeSlider) {
      volumeSlider.addEventListener("mousedown", () => { volumeDragging = true; });
      volumeSlider.addEventListener("touchstart", () => { volumeDragging = true; });
      volumeSlider.addEventListener("input", () => {
        clearTimeout(volumeDebounce);
        volumeDebounce = setTimeout(() => sendCommand("setVolume", parseInt(volumeSlider.value)), 250);
      });
      const endDrag = () => { volumeDragging = false; sendCommand("setVolume", parseInt(volumeSlider.value)); };
      volumeSlider.addEventListener("mouseup", endDrag);
      volumeSlider.addEventListener("touchend", endDrag);
    }
    if (barMute) barMute.addEventListener("click", () => sendCommand(currentState?.player?.muted ? "unmute" : "mute"));
    barMetaClick.addEventListener("click", () => navigateTo("playback"));

    // Context menu
    contextMenu.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!contextTarget) return;
        switch (btn.dataset.action) {
          case "play": sendCommand("changeVideo", { videoId: contextTarget.videoId }); navigateTo("playback"); break;
          case "playNext": sendCommand("playNext", contextTarget.videoId); toast("Will play next", "info"); break;
          case "addToQueue": sendCommand("addToQueue", contextTarget.videoId); toast("Added to queue", "info"); break;
          case "addToPlaylist": openPlaylistPicker(contextTarget.videoId); break;

        }
        hideContextMenu();
      });
    });
    document.addEventListener("click", hideContextMenu);

    setupProgressSeek();
    setupKeyboard();
  }

  // ── Init ───────────────────────────────────────────────────
  function init() {
    loadSavedCredentials();
    bindEvents();
    if (inputToken.value) doConnect();
  }

  init();
})();
