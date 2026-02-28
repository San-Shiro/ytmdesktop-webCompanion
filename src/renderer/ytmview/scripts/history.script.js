// @ts-nocheck
// Fetch YTM listening history via InnerTube browse
// Uses shared parsers from window.__YTMD_PARSERS__
(function() {
  const p = window.__YTMD_PARSERS__;

  return new Promise(async (resolve, reject) => {
    try {
      const data = await window.__YTMD_INNERTUBE__.request("browse", {
        browseId: "FEmusic_history"
      });

      const sectionList = data.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
      resolve({ sections: p.parseSections(sectionList) });
    } catch (e) {
      reject("Failed to get history: " + e.message);
    }
  });
})
