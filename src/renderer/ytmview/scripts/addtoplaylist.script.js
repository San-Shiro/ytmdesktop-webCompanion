// @ts-nocheck
(function(playlistId, videoId) {
  return new Promise((resolve, reject) => {
    // Use the current playing video if no videoId is provided
    if (!videoId) {
      videoId = document.querySelector("ytmusic-app-layout>ytmusic-player-bar").playerApi.getPlayerResponse()?.videoDetails?.videoId;
    }

    if (!videoId) {
      reject("No videoId provided and no song is currently playing");
      return;
    }

    var returnValue = [];
    var serviceRequestEvent = {
      bubbles: true,
      cancelable: false,
      composed: true,
      detail: {
        actionName: "yt-service-request",
        args: [
          document.querySelector("ytmusic-app-layout>ytmusic-player-bar"),
          {
            playlistEditEndpoint: {
              playlistId: playlistId,
              actions: [
                {
                  addedVideoId: videoId,
                  action: "ACTION_ADD_VIDEO"
                }
              ]
            }
          }
        ],
        optionalAction: false,
        returnValue
      }
    };
    document.querySelector("ytmusic-app-layout>ytmusic-player-bar").dispatchEvent(new CustomEvent("yt-action", serviceRequestEvent));

    if (returnValue[0] && returnValue[0].ajaxPromise) {
      returnValue[0].ajaxPromise.then(
        (response) => {
          resolve({
            success: true,
            status: response.data?.status || "SUCCEEDED"
          });
        },
        () => {
          reject("Failed to add video to playlist");
        }
      );
    } else {
      reject("Service request did not return a promise");
    }
  });
})
