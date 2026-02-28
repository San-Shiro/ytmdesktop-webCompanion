/**
 * YTMD Web Companion — Bundled Dashboard App Controller
 * Cookie-based auth, no proxy, auto-connects on page load.
 */
(function () {
  "use strict";

  const HOME_CACHE_KEY = "ytmd_home_cache";

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
  const loginScreen = $("#login-screen");
  const dashboardScreen = $("#dashboard-screen");
  const loginForm = $("#login-form");
  const inputPassword = $("#input-password");
  const loginError = $("#login-error");

  const searchInput = $("#search-input");
  const btnSearchClear = $("#btn-search-clear");
  const statusDot = $("#status-dot");
  const statusLabel = $("#status-label");
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

  const albumArt = $("#album-art");
  const queueList = $("#queue-list");
  const queueSource = $("#queue-source");

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

  const settingsStatus = $("#settings-status");

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

  // ── API Client (cookie-based, same-origin) ────────────────
  async function api(method, path, body) {
    const opts = { method, headers: { "Content-Type": "application/json" }, credentials: "same-origin" };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(path, opts);
    if (res.status === 401) {
      // Session expired — show login
      showScreen("login");
      throw new Error("Session expired");
    }
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
  const addToPlaylistApi = (playlistId, videoId) => api("POST", `/api/v1/playlists/${encodeURIComponent(playlistId)}/add`, { videoId });

  // ── Socket ─────────────────────────────────────────────────
  function connectSocket() {
    setConnectionStatus("connecting");
    socket = io("/api/v1/realtime", {
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 2000
    });

    socket.on("connect", () => { setConnectionStatus("connected"); });
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
      case "settings": break;
    }
  }

  function navigateToBrowse(browseId) { navigateTo("browse"); loadBrowse(browseId); }

  // ── View Loaders ───────────────────────────────────────────

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

  async function loadLibrary(force = false) {
    if (playlistsCache && !force) { renderPlaylistList(libraryContent, playlistsCache); return; }
    libraryContent.innerHTML = '<div class="skeleton-track"></div><div class="skeleton-track"></div><div class="skeleton-track"></div>';
    try {
      const data = await fetchPlaylists();
      playlistsCache = data || [];
      renderPlaylistList(libraryContent, playlistsCache);
    } catch (e) { libraryContent.innerHTML = `<p class="empty-state">Failed: ${e.message}</p>`; }
  }

  async function loadBrowse(browseId) {
    if (browseCache.has(browseId)) { renderBrowseDetail(browseCache.get(browseId)); return; }
    browseHeader.innerHTML = ""; browseTracks.innerHTML = '<div class="skeleton-track"></div><div class="skeleton-track"></div><div class="skeleton-track"></div>';
    try {
      const data = await fetchBrowse(browseId);
      browseCache.set(browseId, data);
      renderBrowseDetail(data);
    } catch (e) { browseTracks.innerHTML = `<p class="empty-state">Failed: ${e.message}</p>`; }
  }

  async function loadPlaybackData() {
    const vid = currentState?.video;
    if (!vid?.id) return;
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

  function createMusicCard(item) {
    const card = document.createElement("div");
    card.className = "music-card";
    const thumbUrl = getThumbUrl(item.thumbnails);
    const hasVideo = !!item.videoId;
    const hasBrowse = !!item.browseId;
    card.innerHTML = `
      <div class="music-card-thumb">
        ${thumbUrl ? `<img src="${thumbUrl}" alt="" loading="lazy" />` : ""}
        ${hasVideo && !hasBrowse ? '<div class="play-overlay"><svg viewBox="0 0 24 24"><polygon points="8 5 19 12 8 19"/></svg></div>' : ""}
      </div>
      <div class="music-card-info">
        <div class="music-card-title">${escapeHtml(item.title || "")}</div>
        <div class="music-card-subtitle">${escapeHtml(getSubtitle(item))}</div>
      </div>`;
    card.addEventListener("click", () => {
      if (hasBrowse) navigateToBrowse(item.browseId);
      else if (hasVideo) { sendCommand("changeVideo", { videoId: item.videoId }); navigateTo("playback"); toast("Playing: " + item.title, "info"); }
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
    console.log("[Dashboard] Browse data:", JSON.stringify(data).slice(0, 500));
    if (data.header) {
      const h = data.header;
      browseHeader.innerHTML = `<div class="browse-header-art">${getThumbUrl(h.thumbnails) ? `<img src="${getThumbUrl(h.thumbnails)}" alt="" />` : ""}</div>
        <div class="browse-header-info"><div class="browse-header-title">${escapeHtml(h.title || "")}</div><div class="browse-header-subtitle">${escapeHtml(h.subtitle || "")}</div></div>`;
    }
    if (data.sections && data.sections.length > 0) {
      // Check if sections contain track items (have videoId/duration) or browseable cards
      let hasTrackItems = false;
      let hasBrowseItems = false;
      for (const sec of data.sections) {
        if (!sec.items) continue;
        for (const item of sec.items) {
          if (item.videoId || item.duration) hasTrackItems = true;
          if (item.browseId && !item.videoId) hasBrowseItems = true;
        }
      }

      if (hasTrackItems) {
        // Render as track list (album/playlist)
        data.sections.forEach((sec) => {
          if (sec.title) {
            const titleEl = document.createElement("div");
            titleEl.className = "shelf-title";
            titleEl.textContent = sec.title;
            browseTracks.appendChild(titleEl);
          }
          if (sec.items) sec.items.forEach((item, idx) => browseTracks.appendChild(createTrackItem(item, idx + 1)));
        });
      } else {
        // Render as shelves (artist page, browseable cards)
        renderShelves(browseTracks, data.sections);
      }
    } else {
      browseTracks.innerHTML = '<p class="empty-state">No content found</p>';
    }
  }

  // ── State Renderer ─────────────────────────────────────────

  function renderState(state) {
    if (!state) return;
    const video = state.video || {};
    const player = state.player || {};
    const queue = player.queue || {};

    barTitle.textContent = video.title || "Not Playing";
    barSubtitle.textContent = [video.author, video.album].filter(Boolean).join(" • ");
    const thumbUrl = getThumbUrl(video.thumbnails, "small");
    if (thumbUrl) barThumb.src = thumbUrl;

    const artUrl = getThumbUrl(video.thumbnails);
    if (artUrl && albumArt.src !== artUrl) {
      albumArt.classList.remove("loaded");
      albumArt.src = artUrl;
      albumArt.onload = () => albumArt.classList.add("loaded");
    }

    playerBar.classList.add("visible");

    const isPlaying = player.trackState === 1 || player.trackState === "PLAYING";
    barIconPlay.style.display = isPlaying ? "none" : "";
    barIconPause.style.display = isPlaying ? "" : "none";

    const duration = video.durationSeconds || 0;
    const progress = player.videoProgress || 0;
    barTotal.textContent = formatTime(duration);
    updateProgress(progress, duration);

    clearInterval(progressInterval);
    if (isPlaying && duration > 0) {
      let cp = progress;
      progressInterval = setInterval(() => { cp += 0.5; if (cp > duration) cp = duration; updateProgress(cp, duration); }, 500);
    }

    const likeStatus = video.likeStatus;
    barLike.classList.toggle("active", likeStatus === "LIKE" || likeStatus === 2);
    barDislike.classList.toggle("active", likeStatus === "DISLIKE" || likeStatus === 0);

    const vol = player.volume ?? 50;
    const muted = player.muted || false;
    if (!volumeDragging) volumeSlider.value = vol;
    if ($("#icon-vol-on")) { $("#icon-vol-on").style.display = muted ? "none" : ""; $("#icon-vol-off").style.display = muted ? "" : "none"; }

    if (queue.playlistId) queueSource.innerHTML = `<strong>Playing from queue</strong>`;
    else queueSource.innerHTML = "";

    const queueFingerprint = JSON.stringify((queue.items || []).map(i => i.videoId || i.title)) + '|' + (queue.selectedItemIndex ?? -1) + '|' + JSON.stringify((queue.automixItems || []).map(i => i.videoId || i.title));
    if (queueFingerprint !== lastQueueFingerprint) {
      lastQueueFingerprint = queueFingerprint;
      renderQueue(queue);
    }

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
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") modalPlaylist.hidden = true; });

  // ── Login & Screen Management ─────────────────────────────
  function showScreen(name) {
    loginScreen.classList.toggle("active", name === "login");
    dashboardScreen.classList.toggle("active", name === "dashboard");
  }

  async function doLogin() {
    const password = inputPassword.value;
    if (!password) { loginError.textContent = "Password required."; loginError.hidden = false; return; }

    const btn = $("#btn-login");
    btn.querySelector(".btn-label").textContent = "Logging in…"; btn.disabled = true; loginError.hidden = true;

    try {
      const res = await fetch("/dashboard/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ password })
      });
      if (res.ok) {
        showScreen("dashboard");
        startDashboard();
      } else {
        const data = await res.json().catch(() => ({}));
        loginError.textContent = data.error || "Wrong password";
        loginError.hidden = false;
      }
    } catch (e) {
      loginError.textContent = `Connection failed: ${e.message}`;
      loginError.hidden = false;
    } finally {
      btn.querySelector(".btn-label").textContent = "Login"; btn.disabled = false;
    }
  }

  function startDashboard() {
    connectSocket();
    navigateTo("home", { force: true });
    // Fetch and display dashboard URL
    fetch("/dashboard/info", { credentials: "same-origin" })
      .then(r => r.json())
      .then(info => {
        if (info.dashboardUrl) {
          const el = $("#settings-dashboard-url");
          if (el) el.textContent = info.dashboardUrl;
        }
      })
      .catch(() => {});
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
    loginForm.addEventListener("submit", (e) => { e.preventDefault(); doLogin(); });

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
  async function init() {
    bindEvents();

    // Check if we already have a valid session cookie
    try {
      const res = await fetch("/dashboard/session", { credentials: "same-origin" });
      if (res.ok) {
        showScreen("dashboard");
        startDashboard();
        return;
      }
    } catch (e) {}

    // Show login screen
    showScreen("login");
  }

  init();
})();
