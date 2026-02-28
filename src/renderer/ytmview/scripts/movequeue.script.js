// @ts-nocheck
// Move a song within the queue from one position to another
(function(fromIndex, toIndex) {
  return new Promise((resolve, reject) => {
    try {
      const state = window.__YTMD_HOOK__.ytmStore.getState();
      const queue = state.queue;

      if (!queue || !queue.items || queue.items.length === 0) {
        reject("Queue is empty");
        return;
      }

      const maxIndex = queue.items.length - 1;
      if (fromIndex < 0 || fromIndex > maxIndex || toIndex < 0 || toIndex > maxIndex) {
        reject("Invalid queue index: from=" + fromIndex + " to=" + toIndex + " max=" + maxIndex);
        return;
      }

      if (fromIndex === toIndex) {
        resolve({ success: true, message: "No move needed" });
        return;
      }

      // Get the queue panel element which manages queue operations
      const playerBar = document.querySelector("ytmusic-app-layout>ytmusic-player-bar");
      if (!playerBar || !playerBar.queue) {
        reject("Queue panel not found");
        return;
      }

      // Get the video ID of the song to move
      const song = queue.items[fromIndex];
      let playlistPanelVideoRenderer;
      if (song.playlistPanelVideoRenderer) {
        playlistPanelVideoRenderer = song.playlistPanelVideoRenderer;
      } else if (song.playlistPanelVideoWrapperRenderer) {
        playlistPanelVideoRenderer = song.playlistPanelVideoWrapperRenderer.primaryRenderer.playlistPanelVideoRenderer;
      }

      if (!playlistPanelVideoRenderer) {
        reject("Cannot find video renderer for item at index " + fromIndex);
        return;
      }

      // Use the queue's internal dispatch to reorder
      // The approach: remove from old position, then re-insert at new position using yt-service-request
      const videoId = playlistPanelVideoRenderer.videoId;

      // Remove the song first
      playerBar.queue.removeByVideoId(videoId);

      // Determine insert position based on toIndex
      // After removal, we need to insert relative to what's now at toIndex
      const insertAction = toIndex === 0 ? "QUEUE_INSERT_NEXT" : "QUEUE_INSERT_AFTER";

      // Re-add the song
      var returnValue = [];
      var serviceRequestEvent = {
        bubbles: true,
        cancelable: false,
        composed: true,
        detail: {
          actionName: "yt-service-request",
          args: [
            playerBar,
            {
              queueAddEndpoint: {
                queueTarget: {
                  videoId: videoId
                },
                queueInsertPosition: insertAction
              }
            }
          ],
          optionalAction: false,
          returnValue
        }
      };
      playerBar.dispatchEvent(new CustomEvent("yt-action", serviceRequestEvent));

      // Wait a bit for the queue to settle
      setTimeout(() => {
        resolve({ success: true, videoId: videoId, from: fromIndex, to: toIndex });
      }, 500);
    } catch (e) {
      reject("Failed to move queue item: " + e.message);
    }
  });
})
