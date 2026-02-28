// @ts-nocheck
(function(videoId, action) {
  // action: "addToQueue" or "playNext"
  return new Promise((resolve, reject) => {
    const queueAction = action === "playNext" ? "QUEUE_INSERT_NEXT" : "QUEUE_INSERT_AFTER";

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
            queueAddEndpoint: {
              queueTarget: {
                videoId: videoId
              },
              queueInsertPosition: queueAction
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
        () => {
          resolve(true);
        },
        () => {
          reject("Queue action request failed");
        }
      );
    } else {
      // Some actions may not have an ajax promise (local queue manipulation)
      resolve(true);
    }
  });
})
