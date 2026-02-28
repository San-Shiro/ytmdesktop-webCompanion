// @ts-nocheck
// Get detailed song/video metadata via InnerTube player endpoint
(function(videoId) {
  return new Promise(async (resolve, reject) => {
    try {
      const data = await window.__YTMD_INNERTUBE__.request("player", {
        videoId,
        playlistId: null
      });

      if (!data.videoDetails) {
        reject("Song not found: " + videoId);
        return;
      }

      const vd = data.videoDetails;
      const md = data.microformat?.microformatDataRenderer;

      const result = {
        videoId: vd.videoId,
        title: vd.title,
        author: vd.author,
        channelId: vd.channelId,
        lengthSeconds: parseInt(vd.lengthSeconds),
        isLive: vd.isLiveContent || false,
        isPrivate: vd.isPrivate || false,
        thumbnails: vd.thumbnail?.thumbnails || [],
        viewCount: vd.viewCount ? parseInt(vd.viewCount) : null,
        shortDescription: vd.shortDescription || null,
        keywords: vd.keywords || [],
        // Microformat data (richer metadata)
        category: md?.category || null,
        publishDate: md?.publishDate || null,
        uploadDate: md?.uploadDate || null
      };

      // Extract streaming data availability (not the URLs themselves)
      if (data.streamingData) {
        result.streamingAvailable = true;
        result.expiresInSeconds = parseInt(data.streamingData.expiresInSeconds || "0");
        // List available quality formats without URLs
        result.availableFormats = (data.streamingData.adaptiveFormats || []).map(f => ({
          mimeType: f.mimeType,
          qualityLabel: f.qualityLabel || null,
          audioQuality: f.audioQuality || null,
          bitrate: f.bitrate,
          contentLength: f.contentLength ? parseInt(f.contentLength) : null
        }));
      }

      resolve(result);
    } catch (e) {
      reject("Failed to get song info: " + e.message);
    }
  });
})
