// @ts-nocheck
// Get "Up Next" / related songs via InnerTube next endpoint
// Uses shared parsers from window.__YTMD_PARSERS__
(function(videoId, playlistId) {
  const p = window.__YTMD_PARSERS__;

  return new Promise(async (resolve, reject) => {
    try {
      const body = {
        videoId,
        isAudioOnly: true,
        enablePersistentPlaylistPanel: true,
        tunerSettingValue: "AUTOMIX_SETTING_NORMAL"
      };
      if (playlistId) body.playlistId = playlistId;

      const data = await window.__YTMD_INNERTUBE__.request("next", body);

      const result = {
        videoId,
        currentSong: null,
        upNext: [],
        lyrics: null,
        relatedBrowseId: null
      };

      const playlistPanel = data.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs;
      if (!playlistPanel) {
        resolve(result);
        return;
      }

      // Tab 0: Up Next queue
      const upNextTab = playlistPanel[0]?.tabRenderer?.content?.musicQueueRenderer?.content?.playlistPanelRenderer;
      if (upNextTab) {
        for (const item of (upNextTab.contents || [])) {
          const renderer = item.playlistPanelVideoRenderer;
          if (!renderer) continue;

          const song = {
            videoId: renderer.videoId,
            title: p.extractTextRuns(renderer.title?.runs),
            artists: p.extractTextRuns(renderer.longBylineText?.runs) || p.extractTextRuns(renderer.shortBylineText?.runs),
            duration: p.extractTextRuns(renderer.lengthText?.runs),
            thumbnails: renderer.thumbnail?.thumbnails || [],
            selected: renderer.selected || false
          };

          if (renderer.selected) result.currentSong = song;
          else result.upNext.push(song);
        }

        // Automix items
        for (const item of (upNextTab.automixItems || [])) {
          const renderer = item.playlistPanelVideoRenderer;
          if (!renderer) continue;
          result.upNext.push({
            videoId: renderer.videoId,
            title: p.extractTextRuns(renderer.title?.runs),
            artists: p.extractTextRuns(renderer.longBylineText?.runs) || p.extractTextRuns(renderer.shortBylineText?.runs),
            duration: p.extractTextRuns(renderer.lengthText?.runs),
            thumbnails: renderer.thumbnail?.thumbnails || [],
            automix: true
          });
        }
      }

      // Tab 1: Lyrics browse endpoint
      const lyricsTab = playlistPanel[1]?.tabRenderer;
      if (lyricsTab?.endpoint?.browseEndpoint?.browseId) {
        result.lyrics = { browseId: lyricsTab.endpoint.browseEndpoint.browseId };
      }

      // Tab 2: Related browse endpoint
      const relatedTab = playlistPanel[2]?.tabRenderer;
      if (relatedTab?.endpoint?.browseEndpoint?.browseId) {
        result.relatedBrowseId = relatedTab.endpoint.browseEndpoint.browseId;
      }

      resolve(result);
    } catch (e) {
      reject("Failed to get next/related songs: " + e.message);
    }
  });
})
