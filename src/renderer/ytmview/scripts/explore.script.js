// @ts-nocheck
// Fetch YTM Explore page (charts, new releases, moods & genres) via InnerTube
// Uses shared parsers from window.__YTMD_PARSERS__
(function() {
  const p = window.__YTMD_PARSERS__;

  return new Promise(async (resolve, reject) => {
    try {
      const data = await window.__YTMD_INNERTUBE__.request("browse", {
        browseId: "FEmusic_explore"
      });

      const sectionList = data.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
      resolve({ sections: p.parseSections(sectionList) });
    } catch (e) {
      reject("Failed to get explore page: " + e.message);
    }
  });
})
