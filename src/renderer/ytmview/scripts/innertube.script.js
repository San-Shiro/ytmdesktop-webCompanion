// @ts-nocheck
// Core InnerTube API request handler
// This script provides a shared function for making InnerTube API calls
// using the page's authenticated session
(function() {
  window.__YTMD_INNERTUBE__ = {
    async request(endpoint, body, continuationToken) {
      const config = window.ytcfg.data_;
      const apiKey = config.INNERTUBE_API_KEY;
      const clientName = config.INNERTUBE_CLIENT_NAME || "WEB_REMIX";
      const clientVersion = config.INNERTUBE_CLIENT_VERSION;

      let url = `https://music.youtube.com/youtubei/v1/${endpoint}?key=${apiKey}&prettyPrint=false`;
      if (continuationToken) {
        url += `&ctoken=${encodeURIComponent(continuationToken)}&continuation=${encodeURIComponent(continuationToken)}&type=next`;
      }

      const context = {
        client: {
          clientName: clientName,
          clientVersion: clientVersion,
          hl: config.HL || "en",
          gl: config.GL || "US",
          experimentIds: [],
          experimentsToken: "",
          theme: "MUSIC"
        },
        user: {
          enableSafetyMode: false
        }
      };

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Visitor-Id": config.VISITOR_DATA || "",
          "X-YouTube-Client-Name": config.INNERTUBE_CONTEXT_CLIENT_NAME || "67",
          "X-YouTube-Client-Version": clientVersion
        },
        body: JSON.stringify({
          context,
          ...body
        }),
        credentials: "include"
      });

      if (!response.ok) {
        throw new Error(`InnerTube request failed: ${response.status} ${response.statusText}`);
      }

      return response.json();
    }
  };
  return true;
})
