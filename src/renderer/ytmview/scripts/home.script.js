// @ts-nocheck
// Get YTM home feed — always fetches fresh from InnerTube
// Uses shared parsers from window.__YTMD_PARSERS__
(function() {
  const p = window.__YTMD_PARSERS__;

  return new Promise(async (resolve, reject) => {
    try {
      // Fresh InnerTube request with continuations
      const data = await window.__YTMD_INNERTUBE__.request("browse", { browseId: "FEmusic_home" });
      const slr = data.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer;
      const sectionList = slr?.contents || [];
      const allSections = p.parseSections(sectionList);

      // Follow continuations
      let tokens = [];
      for (const s of sectionList) {
        if (s.continuationItemRenderer) {
          const t = s.continuationItemRenderer.continuationEndpoint?.continuationCommand?.token;
          if (t) tokens.push(t);
        }
      }
      if (slr?.continuations) {
        for (const c of slr.continuations) {
          const t = c.nextContinuationData?.continuation || c.reloadContinuationData?.continuation;
          if (t) tokens.push(t);
        }
      }

      let count = 0;
      while (tokens.length > 0 && count < 10) {
        const token = tokens.shift();
        count++;
        try {
          const cd = await window.__YTMD_INNERTUBE__.request("browse", {}, token);
          const cs = cd.continuationContents?.sectionListContinuation?.contents || [];
          allSections.push(...p.parseSections(cs));
          for (const s of cs) {
            if (s.continuationItemRenderer) {
              const t = s.continuationItemRenderer.continuationEndpoint?.continuationCommand?.token;
              if (t) tokens.push(t);
            }
          }
          const tc = cd.continuationContents?.sectionListContinuation?.continuations;
          if (tc) {
            for (const c of tc) {
              const t = c.nextContinuationData?.continuation || c.reloadContinuationData?.continuation;
              if (t) tokens.push(t);
            }
          }
        } catch (e) { break; }
      }

      resolve({ sections: allSections, source: "innertube" });
    } catch (e) {
      reject("Failed to get home feed: " + e.message);
    }
  });
})
