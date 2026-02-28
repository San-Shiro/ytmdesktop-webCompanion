// @ts-nocheck
// Shared InnerTube response parsers — installed to window.__YTMD_PARSERS__
// Used by: browse, search, home, explore, history, next scripts
(function() {
  window.__YTMD_PARSERS__ = {
    extractTextRuns(runs) {
      if (!runs) return null;
      return runs.map(r => r.text).join("");
    },

    extractThumbnails(thumbnailRenderer) {
      if (!thumbnailRenderer) return [];
      const t = thumbnailRenderer.musicThumbnailRenderer || thumbnailRenderer;
      if (t.thumbnail) return t.thumbnail.thumbnails;
      if (t.thumbnails) return t.thumbnails;
      return [];
    },

    parseMusicTwoRowItemRenderer(item) {
      const renderer = item.musicTwoRowItemRenderer;
      if (!renderer) return null;

      const p = window.__YTMD_PARSERS__;
      const result = {};
      result.title = p.extractTextRuns(renderer.title?.runs);
      result.subtitle = p.extractTextRuns(renderer.subtitle?.runs);
      result.thumbnails = p.extractThumbnails(renderer.thumbnailRenderer);

      const nav = renderer.navigationEndpoint;
      if (nav) {
        if (nav.watchEndpoint) {
          result.videoId = nav.watchEndpoint.videoId;
          result.playlistId = nav.watchEndpoint.playlistId;
        }
        if (nav.browseEndpoint) {
          result.browseId = nav.browseEndpoint.browseId;
        }
        if (nav.watchPlaylistEndpoint) {
          result.playlistId = nav.watchPlaylistEndpoint.playlistId;
        }
      }

      const crop = renderer.thumbnailRenderer?.musicThumbnailRenderer?.thumbnailCrop;
      if (crop === "MUSIC_THUMBNAIL_CROP_CIRCLE") result.type = "artist";

      return result;
    },

    parseMusicResponsiveListItem(item) {
      const renderer = item.musicResponsiveListItemRenderer;
      if (!renderer) return null;

      const p = window.__YTMD_PARSERS__;
      const result = {};
      if (renderer.thumbnail) result.thumbnails = p.extractThumbnails(renderer.thumbnail);

      const columns = renderer.flexColumns || [];
      for (let i = 0; i < columns.length; i++) {
        const col = columns[i].musicResponsiveListItemFlexColumnRenderer;
        if (!col?.text?.runs) continue;
        if (i === 0) {
          result.title = p.extractTextRuns(col.text.runs);
          const nav = col.text.runs[0]?.navigationEndpoint;
          if (nav?.watchEndpoint) {
            result.videoId = nav.watchEndpoint.videoId;
            result.playlistId = nav.watchEndpoint.playlistId;
          }
          if (nav?.browseEndpoint) result.browseId = nav.browseEndpoint.browseId;
        } else {
          result.subtitle = p.extractTextRuns(col.text.runs);
        }
      }

      // Fixed columns (duration)
      const fixedColumns = renderer.fixedColumns || [];
      for (const fc of fixedColumns) {
        const fcr = fc.musicResponsiveListItemFixedColumnRenderer;
        if (fcr?.text) result.duration = p.extractTextRuns(fcr.text.runs);
      }

      return result;
    },

    parseItem(item) {
      const p = window.__YTMD_PARSERS__;
      return p.parseMusicTwoRowItemRenderer(item) || p.parseMusicResponsiveListItem(item);
    },

    parseNavigationButton(item) {
      const navBtn = item.musicNavigationButtonRenderer;
      if (!navBtn) return null;
      const p = window.__YTMD_PARSERS__;
      return {
        title: p.extractTextRuns(navBtn.buttonText?.runs),
        browseId: navBtn.clickCommand?.browseEndpoint?.browseId,
        params: navBtn.clickCommand?.browseEndpoint?.params,
        color: navBtn.solid?.leftStripeColor,
        type: "mood"
      };
    },

    parseCarouselSection(carousel) {
      if (!carousel) return null;
      const p = window.__YTMD_PARSERS__;
      const items = (carousel.contents || []).map(i => p.parseItem(i)).filter(Boolean);
      if (items.length === 0) return null;
      return {
        title: p.extractTextRuns(carousel.header?.musicCarouselShelfBasicHeaderRenderer?.title?.runs),
        strapline: p.extractTextRuns(carousel.header?.musicCarouselShelfBasicHeaderRenderer?.strapline?.runs),
        items
      };
    },

    parseImmersiveSection(immersive) {
      if (!immersive) return null;
      const p = window.__YTMD_PARSERS__;
      const items = (immersive.contents || []).map(i => p.parseItem(i)).filter(Boolean);
      if (items.length === 0) return null;
      return {
        title: p.extractTextRuns(immersive.header?.musicImmersiveCarouselShelfBasicHeaderRenderer?.title?.runs),
        strapline: p.extractTextRuns(immersive.header?.musicImmersiveCarouselShelfBasicHeaderRenderer?.strapline?.runs),
        items,
        type: "immersive"
      };
    },

    parseSections(sectionList) {
      const p = window.__YTMD_PARSERS__;
      const sections = [];
      for (const section of sectionList) {
        if (section.musicCarouselShelfRenderer) {
          const s = p.parseCarouselSection(section.musicCarouselShelfRenderer);
          if (s) sections.push(s);
        }
        if (section.musicImmersiveCarouselShelfRenderer) {
          const s = p.parseImmersiveSection(section.musicImmersiveCarouselShelfRenderer);
          if (s) sections.push(s);
        }
        if (section.musicDescriptionShelfRenderer) {
          const desc = section.musicDescriptionShelfRenderer;
          sections.push({
            title: p.extractTextRuns(desc.header?.runs),
            description: p.extractTextRuns(desc.description?.runs),
            type: "description"
          });
        }
        if (section.musicShelfRenderer) {
          const shelf = section.musicShelfRenderer;
          const items = (shelf.contents || []).map(i => p.parseMusicResponsiveListItem(i)).filter(Boolean);
          if (items.length > 0) {
            sections.push({
              title: p.extractTextRuns(shelf.title?.runs),
              items
            });
          }
        }
        if (section.gridRenderer) {
          const grid = section.gridRenderer;
          const items = (grid.items || []).map(i => p.parseItem(i) || p.parseNavigationButton(i)).filter(Boolean);
          if (items.length > 0) {
            sections.push({
              title: p.extractTextRuns(grid.header?.gridHeaderRenderer?.title?.runs),
              items,
              type: "grid"
            });
          }
        }
        if (section.musicPlaylistShelfRenderer) {
          const shelf = section.musicPlaylistShelfRenderer;
          const items = (shelf.contents || []).map(i => p.parseMusicResponsiveListItem(i)).filter(Boolean);
          if (items.length > 0) {
            sections.push({
              title: p.extractTextRuns(shelf.title?.runs),
              items
            });
          }
        }
      }
      return sections;
    }
  };
  return true;
})
