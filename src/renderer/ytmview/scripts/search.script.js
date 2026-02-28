// @ts-nocheck
// Search YTM using InnerTube API
// Uses shared parsers from window.__YTMD_PARSERS__
(function(query, filter) {
  const FILTER_PARAMS = {
    songs: "EgWKAQIIAWoMEAMQBBAJEA4QChAF",
    videos: "EgWKAQIQAWoMEAMQBBAJEA4QChAF",
    albums: "EgWKAQIYAWoMEAMQBBAJEA4QChAF",
    artists: "EgWKAQIgAWoMEAMQBBAJEA4QChAF",
    playlists: "EgWKAQIoAWoMEAMQBBAJEA4QChAF",
    community_playlists: "EgWKAQIoAWoMEAMQBBAJEA4QChAF"
  };

  const p = window.__YTMD_PARSERS__;

  // Search has a richer parseMusicResponsiveListItem that extracts subtitle parts + overlay
  function parseSearchItem(item) {
    const renderer = item.musicResponsiveListItemRenderer;
    if (!renderer) return p.parseMusicTwoRowItemRenderer(item);

    const result = {};
    if (renderer.thumbnail) result.thumbnails = p.extractThumbnails(renderer.thumbnail);

    const columns = renderer.flexColumns || [];
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i].musicResponsiveListItemFlexColumnRenderer;
      if (!col?.text?.runs) continue;

      if (i === 0) {
        result.title = p.extractTextRuns(col.text.runs);
        const nav = col.text.runs[0]?.navigationEndpoint;
        if (nav?.watchEndpoint) { result.videoId = nav.watchEndpoint.videoId; result.playlistId = nav.watchEndpoint.playlistId; }
        if (nav?.browseEndpoint) { result.browseId = nav.browseEndpoint.browseId; result.pageType = nav.browseEndpoint.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType; }
      } else if (i === 1) {
        const parts = [];
        for (const run of col.text.runs) {
          if (run.text !== " • " && run.text !== " & ") {
            const info = { text: run.text };
            const ep = run.navigationEndpoint;
            if (ep?.browseEndpoint) { info.browseId = ep.browseEndpoint.browseId; info.pageType = ep.browseEndpoint.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType; }
            parts.push(info);
          }
        }
        if (parts.length > 0) result.subtitle = parts;
      }
    }

    // Duration from fixed columns
    const fixedColumns = renderer.fixedColumns || [];
    for (const fc of fixedColumns) {
      const fcr = fc.musicResponsiveListItemFixedColumnRenderer;
      if (fcr?.text) result.duration = p.extractTextRuns(fcr.text.runs);
    }

    // Overlay play button IDs
    if (renderer.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint) {
      const playNav = renderer.overlay.musicItemThumbnailOverlayRenderer.content.musicPlayButtonRenderer.playNavigationEndpoint;
      if (playNav.watchEndpoint) {
        result.videoId = result.videoId || playNav.watchEndpoint.videoId;
        result.playlistId = result.playlistId || playNav.watchEndpoint.playlistId;
      }
      if (playNav.watchPlaylistEndpoint) {
        result.playlistId = result.playlistId || playNav.watchPlaylistEndpoint.playlistId;
      }
    }

    return result;
  }

  return new Promise(async (resolve, reject) => {
    try {
      const body = { query };
      if (filter && FILTER_PARAMS[filter]) body.params = FILTER_PARAMS[filter];

      const data = await window.__YTMD_INNERTUBE__.request("search", body);

      const sections = [];
      const tabbedResults = data.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content;
      const sectionList = tabbedResults?.sectionListRenderer?.contents || [];

      for (const section of sectionList) {
        const shelf = section.musicShelfRenderer;
        const cardShelf = section.musicCardShelfRenderer;

        if (shelf) {
          const items = (shelf.contents || []).map(parseSearchItem).filter(Boolean);
          if (items.length > 0) sections.push({ title: p.extractTextRuns(shelf.title?.runs), items });
        }

        if (cardShelf) {
          const topResult = {
            title: p.extractTextRuns(cardShelf.title?.runs),
            subtitle: p.extractTextRuns(cardShelf.subtitle?.runs),
            thumbnails: p.extractThumbnails(cardShelf.thumbnail),
            type: "topResult"
          };
          const nav = cardShelf.onTap?.watchEndpoint || cardShelf.onTap?.browseEndpoint;
          if (nav) Object.assign(topResult, nav);

          const sectionData = { title: "Top result", items: [topResult] };
          if (cardShelf.contents) {
            sectionData.items.push(...(cardShelf.contents.map(parseSearchItem).filter(Boolean)));
          }
          sections.push(sectionData);
        }
      }

      resolve({ query, filter: filter || "all", sections });
    } catch (e) {
      reject("Search failed: " + e.message);
    }
  });
})
