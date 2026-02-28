// @ts-nocheck
// Browse YTM content (album, artist, playlist) via InnerTube
// Uses shared parsers from window.__YTMD_PARSERS__
(function(browseId) {
  const p = window.__YTMD_PARSERS__;

  return new Promise(async (resolve, reject) => {
    try {
      const data = await window.__YTMD_INNERTUBE__.request("browse", { browseId });

      const result = {
        browseId,
        header: null,
        sections: []
      };

      // Parse header
      const header = data.header;
      if (header) {
        const immersiveHeader = header.musicImmersiveHeaderRenderer;
        const detailHeader = header.musicDetailHeaderRenderer;
        const visualHeader = header.musicVisualHeaderRenderer;

        if (immersiveHeader) {
          result.header = {
            title: p.extractTextRuns(immersiveHeader.title?.runs),
            subtitle: p.extractTextRuns(immersiveHeader.subtitle?.runs),
            description: p.extractTextRuns(immersiveHeader.description?.runs),
            thumbnails: p.extractThumbnails(immersiveHeader.thumbnail),
            type: "artist"
          };
          if (immersiveHeader.subscriptionButton?.subscribeButtonRenderer) {
            result.header.subscriberCount = immersiveHeader.subscriptionButton.subscribeButtonRenderer.subscriberCountText?.runs?.[0]?.text;
          }
        }

        if (detailHeader) {
          result.header = {
            title: p.extractTextRuns(detailHeader.title?.runs),
            subtitle: p.extractTextRuns(detailHeader.subtitle?.runs),
            description: p.extractTextRuns(detailHeader.description?.runs),
            thumbnails: p.extractThumbnails(detailHeader.thumbnail),
            type: "album"
          };
          if (detailHeader.subtitle?.runs) {
            result.header.metadata = detailHeader.subtitle.runs.map(r => r.text).filter(t => t !== " • ");
          }
        }

        if (visualHeader) {
          result.header = {
            title: p.extractTextRuns(visualHeader.title?.runs),
            subtitle: p.extractTextRuns(visualHeader.subtitle?.runs),
            thumbnails: p.extractThumbnails(visualHeader.thumbnail),
            type: "artist"
          };
        }
      }

      // Parse content sections
      const tabs = data.contents?.singleColumnBrowseResultsRenderer?.tabs || [];
      for (const tab of tabs) {
        const sectionList = tab.tabRenderer?.content?.sectionListRenderer?.contents || [];
        result.sections.push(...p.parseSections(sectionList));
      }

      resolve(result);
    } catch (e) {
      reject("Browse failed: " + e.message);
    }
  });
})
