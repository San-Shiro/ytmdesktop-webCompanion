// @ts-nocheck
(function() {
  return new Promise((resolve, reject) => {
    try {
      const browseId = document.querySelector("ytmusic-app-layout>ytmusic-player-bar").playerApi.getPlayerResponse()?.videoDetails?.videoId;
      if (!browseId) {
        reject("No song is currently playing");
        return;
      }

      // Try to find the lyrics tab in the tab renderer
      const playerPage = document.querySelector("ytmusic-player-page");
      if (!playerPage) {
        reject("Player page not found");
        return;
      }

      const tabRenderer = playerPage.querySelector("ytmusic-tab-renderer");
      if (!tabRenderer) {
        reject("Tab renderer not found");
        return;
      }

      // Check for an existing lyrics content
      const lyricsContent = tabRenderer.querySelector("ytmusic-description-shelf-renderer");
      if (lyricsContent) {
        const lyricsText = lyricsContent.querySelector(".description");
        const lyricsSource = lyricsContent.querySelector(".footer");
        resolve({
          lyrics: lyricsText ? lyricsText.innerText : null,
          source: lyricsSource ? lyricsSource.innerText : null
        });
        return;
      }

      // Try to get lyrics via the tab endpoint
      const tabs = playerPage.querySelectorAll("tp-yt-paper-tab");
      let lyricsTab = null;
      for (const tab of tabs) {
        if (tab.innerText && tab.innerText.toLowerCase().includes("lyrics")) {
          lyricsTab = tab;
          break;
        }
      }

      if (!lyricsTab) {
        reject("Lyrics tab not available for this song");
        return;
      }

      // Click the lyrics tab and wait for content to load
      lyricsTab.click();

      const checkInterval = setInterval(() => {
        const lyricsShelf = tabRenderer.querySelector("ytmusic-description-shelf-renderer");
        if (lyricsShelf) {
          clearInterval(checkInterval);
          const lyricsText = lyricsShelf.querySelector(".description");
          const lyricsSource = lyricsShelf.querySelector(".footer");

          // Switch back to the first tab (Up Next)
          const firstTab = tabs[0];
          if (firstTab) firstTab.click();

          resolve({
            lyrics: lyricsText ? lyricsText.innerText : null,
            source: lyricsSource ? lyricsSource.innerText : null
          });
        }
      }, 200);

      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkInterval);

        // Switch back to the first tab
        const firstTab = tabs[0];
        if (firstTab) firstTab.click();

        reject("Lyrics loading timed out");
      }, 10000);
    } catch (e) {
      reject("Error fetching lyrics: " + e.message);
    }
  });
})
