// IMPORTANT NOTES ABOUT THIS FILE
//
// This file contains all logic related to interacting with YTM itself and works under the assumption of a trusted environment and data.
// Anything passed to this file does not necessarily need to be or will be validated.
//
// If adding new things to this file ensure best security practices are followed.
// - executeJavaScript is used to enter the main world when you need to interact with YTM APIs or anything from YTM that would otherwise need the prototypes or events from YTM.
//   - Always wrap your executeJavaScript code in an IIFE calling it from outside executeJavaScript when it returns
// - Add functions to exposeInMainWorld when you need to call back to the main program. By nature you should not trust data coming from this.

import { contextBridge, ipcRenderer, webFrame } from "electron";
import Store from "../store-ipc/store";
import { StoreSchema } from "~shared/store/schema";

import playerBarControlsScript from "./scripts/playerbarcontrols.script?raw";
import hookPlayerApiEventsScript from "./scripts/hookplayerapievents.script?raw";
import getPlaylistsScript from "./scripts/getplaylists.script?raw";
import toggleLikeScript from "./scripts/togglelike.script?raw";
import toggleDislikeScript from "./scripts/toggledislike.script?raw";
import addToQueueScript from "./scripts/addtoqueue.script?raw";
import getLyricsScript from "./scripts/getlyrics.script?raw";
import addToPlaylistScript from "./scripts/addtoplaylist.script?raw";
import parsersScript from "./scripts/parsers.script?raw";
import innertubeScript from "./scripts/innertube.script?raw";
import searchScript from "./scripts/search.script?raw";
import homeScript from "./scripts/home.script?raw";
import browseScript from "./scripts/browse.script?raw";
import songInfoScript from "./scripts/songinfo.script?raw";
import nextScript from "./scripts/next.script?raw";
import exploreScript from "./scripts/explore.script?raw";
import historyScript from "./scripts/history.script?raw";
import moveQueueScript from "./scripts/movequeue.script?raw";
import automixChipsScript from "./scripts/automixchips.script?raw";

const store = new Store<StoreSchema>();

contextBridge.exposeInMainWorld("ytmd", {
  sendVideoProgress: (volume: number) => ipcRenderer.send("ytmView:videoProgressChanged", volume),
  sendVideoState: (state: number) => ipcRenderer.send("ytmView:videoStateChanged", state),
  sendVideoData: (videoDetails: unknown, playlistId: string, album: { id: string; text: string }, likeStatus: unknown, hasFullMetadata: boolean) =>
    ipcRenderer.send("ytmView:videoDataChanged", videoDetails, playlistId, album, likeStatus, hasFullMetadata),
  sendStoreUpdate: (queueState: unknown, likeStatus: string, volume: number, muted: boolean, adPlaying: boolean) =>
    ipcRenderer.send("ytmView:storeStateChanged", queueState, likeStatus, volume, muted, adPlaying),
  sendCreatePlaylistObservation: (playlist: unknown) => ipcRenderer.send("ytmView:createPlaylistObserved", playlist),
  sendDeletePlaylistObservation: (playlistId: string) => ipcRenderer.send("ytmView:deletePlaylistObserved", playlistId)
});

function createStyleSheet() {
  const css = document.createElement("style");
  css.appendChild(
    document.createTextNode(`
      .ytmd-history-back, .ytmd-history-forward {
        cursor: pointer;
        margin: 0 18px 0 2px;
        font-size: 24px;
        color: rgba(255, 255, 255, 0.5);
      }

      .ytmd-history-back.pivotbar, .ytmd-history-forward.pivotbar {
        padding-top: 12px;
      }

      .ytmd-history-back.disabled, .ytmd-history-forward.disabled {
        cursor: not-allowed;
      }

      .ytmd-history-back:hover:not(.disabled), .ytmd-history-forward:hover:not(.disabled) {
        color: #FFFFFF;
      }

      .ytmd-hidden {
        display: none;
      }

      .ytmd-persist-volume-slider {
        opacity: 1 !important;
        pointer-events: initial !important;
      }
      
      .ytmd-player-bar-control.library-button {
        margin-left: 8px;
      }

      .ytmd-player-bar-control.library-button.hidden {
        display: none;
      }

      .ytmd-player-bar-control.playlist-button {
        margin-left: 8px;
      }

      .ytmd-player-bar-control.playlist-button.hidden {
        display: none;
      }

      .ytmd-player-bar-control.sleep-timer-button.active {
        color: #FFFFFF;
      }
    `)
  );
  document.head.appendChild(css);
}

function createMaterialSymbolsLink() {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,100,0,0";
  return link;
}

function createNavigationMenuArrows() {
  // Go back in history
  const historyBackElement = document.createElement("span");
  historyBackElement.classList.add("material-symbols-outlined", "ytmd-history-back", "disabled");
  historyBackElement.innerText = "west";

  historyBackElement.addEventListener("click", function () {
    if (!historyBackElement.classList.contains("disabled")) {
      history.back();
    }
  });

  // Go forward in history
  const historyForwardElement = document.createElement("span");
  historyForwardElement.classList.add("material-symbols-outlined", "ytmd-history-forward", "disabled");
  historyForwardElement.innerText = "east";

  historyForwardElement.addEventListener("click", function () {
    if (!historyForwardElement.classList.contains("disabled")) {
      history.forward();
    }
  });

  ipcRenderer.on("ytmView:navigationStateChanged", (event, state) => {
    if (state.canGoBack) {
      historyBackElement.classList.remove("disabled");
    } else {
      historyBackElement.classList.add("disabled");
    }

    if (state.canGoForward) {
      historyForwardElement.classList.remove("disabled");
    } else {
      historyForwardElement.classList.add("disabled");
    }
  });

  const pivotBar = document.querySelector("ytmusic-pivot-bar-renderer");
  if (!pivotBar) {
    // New YTM UI
    const searchBar = document.querySelector("ytmusic-search-box");
    const navBar = searchBar.parentNode;
    navBar.insertBefore(historyForwardElement, searchBar);
    navBar.insertBefore(historyBackElement, historyForwardElement);
  } else {
    historyForwardElement.classList.add("pivotbar");
    historyBackElement.classList.add("pivotbar");
    pivotBar.prepend(historyForwardElement);
    pivotBar.prepend(historyBackElement);
  }
}

function createKeyboardNavigation() {
  const keyboardNavigation = document.createElement("div");
  keyboardNavigation.tabIndex = 32767;
  keyboardNavigation.onfocus = () => {
    keyboardNavigation.blur();
    ipcRenderer.send("ytmView:switchFocus", "main");
  };
  document.body.appendChild(keyboardNavigation);
}

async function createAdditionalPlayerBarControls() {
  (await webFrame.executeJavaScript(playerBarControlsScript))();
}

async function hideChromecastButton() {
  (
    await webFrame.executeJavaScript(`
      (function() {
        window.__YTMD_HOOK__.ytmStore.dispatch({ type: 'SET_CAST_AVAILABLE', payload: false });
      })
    `)
  )();
}

async function hookPlayerApiEvents() {
  (await webFrame.executeJavaScript(hookPlayerApiEventsScript))();
}

function overrideHistoryButtonDisplay() {
  // @ts-expect-error Style is reported as readonly but this still works
  document.querySelector<HTMLElement>("#history-link .history-button").style = "display: inline-block !important;";
}

function getYTMTextRun(runs: { text: string }[]) {
  let final = "";
  for (const run of runs) {
    final += run.text;
  }
  return final;
}

// This function helps hook YTM
(async function () {
  (
    await webFrame.executeJavaScript(`
    (function() {
      let fakeBaseClass = function() {
        try {
          if (!window.__YTMD_HOOK__) {
            if (this.store && !!this.store.getState && !!this.store.dispatch && !!this.store.subscribe) {
              let ytmdHook = {
                ytmStore: this.store
              };
              Object.freeze(ytmdHook);
              window.__YTMD_HOOK__ = ytmdHook;
            }
          }
        } catch {}
      }
      Object.defineProperty(window, "PolymerFakeBaseClassWithoutHtml", {
        set: (value) => {},
        get: () => {
          return fakeBaseClass
        }
      })
    })
  `)
  )();
})();

window.addEventListener("load", async () => {
  if (window.location.hostname !== "music.youtube.com") {
    if (window.location.hostname === "consent.youtube.com" || window.location.hostname === "accounts.google.com") {
      ipcRenderer.send("ytmView:loaded");
    }
    return;
  }

  await new Promise<void>(resolve => {
    const interval = setInterval(async () => {
      const hooked = (
        await webFrame.executeJavaScript(`
        (function() {
          if (window.__YTMD_HOOK__) {
            return true;
          }
          
          return false;
        })
      `)
      )();

      if (hooked) {
        clearInterval(interval);
        resolve();
      }
    }, 250);
  });

  let materialSymbolsLoaded = false;

  const materialSymbols = createMaterialSymbolsLink();
  materialSymbols.onload = () => {
    materialSymbolsLoaded = true;
  };
  document.head.appendChild(materialSymbols);

  await new Promise<void>(resolve => {
    const interval = setInterval(async () => {
      const playerApiReady: boolean = (
        await webFrame.executeJavaScript(`
          (function() {
            return document.querySelector("ytmusic-app-layout>ytmusic-player-bar").playerApi.isReady();
          })
        `)
      )();

      if (materialSymbolsLoaded && playerApiReady) {
        clearInterval(interval);
        resolve();
      }
    }, 250);
  });

  createStyleSheet();
  createNavigationMenuArrows();
  createKeyboardNavigation();
  await createAdditionalPlayerBarControls();
  await hideChromecastButton();
  await hookPlayerApiEvents();
  await (await webFrame.executeJavaScript(parsersScript))();
  await (await webFrame.executeJavaScript(innertubeScript))();
  overrideHistoryButtonDisplay();

  const integrationScripts: { [integrationName: string]: { [scriptName: string]: string } } = await ipcRenderer.invoke("ytmView:getIntegrationScripts");

  const state = await store.get("state");
  const continueWhereYouLeftOff = (await store.get("playback")).continueWhereYouLeftOff;

  if (continueWhereYouLeftOff) {
    // The last page the user was on is already a page where it will be playing a song from (no point telling YTM to play it again)
    if (!state.lastUrl.startsWith("https://music.youtube.com/watch")) {
      if (state.lastVideoId) {
        // This height transition check is a hack to fix the `Start playback` hint from not being in the correct position https://github.com/ytmdesktop/ytmdesktop/issues/1159
        let heightTransitionCount = 0;
        const transitionEnd = async (e: TransitionEvent) => {
          if (e.target === document.querySelector("ytmusic-app-layout>ytmusic-player-bar")) {
            if (e.propertyName === "height") {
              (
                await webFrame.executeJavaScript(`
                  (function() {
                    document.querySelector("ytmusic-popup-container").refitPopups_();
                  })
                `)
              )();
              heightTransitionCount++;
              if (heightTransitionCount >= 2) {
                document.querySelector("ytmusic-app-layout>ytmusic-player-bar").removeEventListener("transitionend", transitionEnd);
              }
            }
          }
        };
        document.querySelector("ytmusic-app-layout>ytmusic-player-bar").addEventListener("transitionend", transitionEnd);

        document.dispatchEvent(
          new CustomEvent("yt-navigate", {
            detail: {
              endpoint: {
                watchEndpoint: {
                  videoId: state.lastVideoId,
                  playlistId: state.lastPlaylistId
                }
              }
            }
          })
        );
      }
    } else {
      (
        await webFrame.executeJavaScript(`
          (function() {
            window.ytmd.sendVideoData(document.querySelector("ytmusic-app-layout>ytmusic-player-bar").playerApi.getPlayerResponse().videoDetails, document.querySelector("ytmusic-app-layout>ytmusic-player-bar").playerApi.getPlaylistId());
          })
        `)
      )();
    }
  }

  const alwaysShowVolumeSlider = (await store.get("appearance")).alwaysShowVolumeSlider;
  if (alwaysShowVolumeSlider) {
    document.querySelector("ytmusic-app-layout>ytmusic-player-bar #volume-slider").classList.add("ytmd-persist-volume-slider");
  }

  ipcRenderer.on("remoteControl:execute", async (_event, command, value) => {
    switch (command) {
      case "playPause": {
        (
          await webFrame.executeJavaScript(`
            (function() {
              document.querySelector("ytmusic-app-layout>ytmusic-player-bar").playing ? document.querySelector("ytmusic-app-layout>ytmusic-player-bar").playerApi.pauseVideo() : document.querySelector("ytmusic-app-layout>ytmusic-player-bar").playerApi.playVideo();
            })
          `)
        )();
        break;
      }

      case "play": {
        (
          await webFrame.executeJavaScript(`
            (function() {
              document.querySelector("ytmusic-app-layout>ytmusic-player-bar").playerApi.playVideo();
            })
          `)
        )();
        break;
      }

      case "pause": {
        (
          await webFrame.executeJavaScript(`
            (function() {
              document.querySelector("ytmusic-app-layout>ytmusic-player-bar").playerApi.pauseVideo();
            })
          `)
        )();
        break;
      }

      case "next": {
        (
          await webFrame.executeJavaScript(`
            (function() {
              document.querySelector("ytmusic-app-layout>ytmusic-player-bar").playerApi.nextVideo();
            })
          `)
        )();
        break;
      }

      case "previous": {
        (
          await webFrame.executeJavaScript(`
            (function() {
              document.querySelector("ytmusic-app-layout>ytmusic-player-bar").playerApi.previousVideo();
            })
          `)
        )();
        break;
      }

      case "toggleLike": {
        (await webFrame.executeJavaScript(toggleLikeScript))();
        break;
      }

      case "toggleDislike": {
        (await webFrame.executeJavaScript(toggleDislikeScript))();
        break;
      }

      case "volumeUp": {
        const currentVolumeUp: number = (
          await webFrame.executeJavaScript(`
            (function() {
              return document.querySelector("ytmusic-app-layout>ytmusic-player-bar").playerApi.getVolume();
            })
          `)
        )();

        let newVolumeUp = currentVolumeUp + 10;
        if (currentVolumeUp > 100) {
          newVolumeUp = 100;
        }
        (
          await webFrame.executeJavaScript(`
            (function(newVolumeUp) {
              document.querySelector("ytmusic-app-layout>ytmusic-player-bar").playerApi.setVolume(newVolumeUp);
              window.__YTMD_HOOK__.ytmStore.dispatch({ type: 'SET_VOLUME', payload: newVolumeUp });
            })
          `)
        )(newVolumeUp);
        break;
      }

      case "volumeDown": {
        const currentVolumeDown: number = (
          await webFrame.executeJavaScript(`
            (function() {
              return document.querySelector("ytmusic-app-layout>ytmusic-player-bar").playerApi.getVolume();
            })
          `)
        )();

        let newVolumeDown = currentVolumeDown - 10;
        if (currentVolumeDown < 0) {
          newVolumeDown = 0;
        }
        (
          await webFrame.executeJavaScript(`
            (function(newVolumeDown) {
              document.querySelector("ytmusic-app-layout>ytmusic-player-bar").playerApi.setVolume(newVolumeDown);
              window.__YTMD_HOOK__.ytmStore.dispatch({ type: 'SET_VOLUME', payload: newVolumeDown });
            })
          `)
        )(newVolumeDown);
        break;
      }

      case "setVolume": {
        const valueInt: number = parseInt(value);
        // Check if Volume is a number and between 0 and 100
        if (isNaN(valueInt) || valueInt < 0 || valueInt > 100) {
          return;
        }

        (
          await webFrame.executeJavaScript(`
            (function(valueInt) {
              document.querySelector("ytmusic-app-layout>ytmusic-player-bar").playerApi.setVolume(valueInt);
              window.__YTMD_HOOK__.ytmStore.dispatch({ type: 'SET_VOLUME', payload: valueInt });
            })
          `)
        )(valueInt);
        break;
      }

      case "mute":
        (
          await webFrame.executeJavaScript(`
            (function() {
              document.querySelector("ytmusic-app-layout>ytmusic-player-bar").playerApi.mute();
              window.__YTMD_HOOK__.ytmStore.dispatch({ type: 'SET_MUTED', payload: true });
            })
          `)
        )();
        break;

      case "unmute":
        (
          await webFrame.executeJavaScript(`
            (function() {
              document.querySelector("ytmusic-app-layout>ytmusic-player-bar").playerApi.unMute();
              window.__YTMD_HOOK__.ytmStore.dispatch({ type: 'SET_MUTED', payload: false });
            })
          `)
        )();
        break;

      case "repeatMode":
        (
          await webFrame.executeJavaScript(`
            (function(value) {
              window.__YTMD_HOOK__.ytmStore.dispatch({ type: 'SET_REPEAT', payload: value });
            })
          `)
        )(value);
        break;

      case "seekTo":
        (
          await webFrame.executeJavaScript(`
            (function(value) {
              document.querySelector("ytmusic-app-layout>ytmusic-player-bar").playerApi.seekTo(value);
            })
          `)
        )(value);
        break;

      case "shuffle":
        (
          await webFrame.executeJavaScript(`
            (function() {
              document.querySelector("ytmusic-app-layout>ytmusic-player-bar").queue.shuffle();
            })
          `)
        )();
        break;

      case "playQueueIndex": {
        const index: number = parseInt(value);

        (
          await webFrame.executeJavaScript(`
            (function(index) {
              const state = window.__YTMD_HOOK__.ytmStore.getState();
              const queue = state.queue;

              const maxQueueIndex = state.queue.items.length - 1;
              const maxAutoMixQueueIndex = Math.max(state.queue.automixItems.length - 1, 0);

              let useAutoMix = false;
              if (index > maxQueueIndex) {
                index = index - state.queue.items.length;
                useAutoMix = true;
              }

              let song = null;
              if (!useAutoMix) {
                song = queue.items[index];
              } else {
                song = queue.automixItems[index];
              }

              let playlistPanelVideoRenderer;
              if (song.playlistPanelVideoRenderer) {
                playlistPanelVideoRenderer = song.playlistPanelVideoRenderer;
              } else if (song.playlistPanelVideoWrapperRenderer) {
                playlistPanelVideoRenderer = song.playlistPanelVideoWrapperRenderer.primaryRenderer.playlistPanelVideoRenderer;
              }

              document.dispatchEvent(
                new CustomEvent("yt-navigate", {
                  detail: {
                    endpoint: {
                      watchEndpoint: playlistPanelVideoRenderer.navigationEndpoint.watchEndpoint
                    }
                  }
                })
              );
            })
          `)
        )(index);

        break;
      }

      case "navigate": {
        const endpoint = value;
        document.dispatchEvent(
          new CustomEvent("yt-navigate", {
            detail: {
              endpoint
            }
          })
        );
        break;
      }

      case "addToQueue": {
        const videoIdQueue: string = value;
        try {
          await (await webFrame.executeJavaScript(addToQueueScript))(videoIdQueue, "addToQueue");
        } catch (e) {
          console.error("Failed to add to queue:", e);
        }
        break;
      }

      case "playNext": {
        const videoIdNext: string = value;
        try {
          await (await webFrame.executeJavaScript(addToQueueScript))(videoIdNext, "playNext");
        } catch (e) {
          console.error("Failed to add play next:", e);
        }
        break;
      }

      case "removeQueueIndex": {
        const removeIndex: number = parseInt(value);
        (
          await webFrame.executeJavaScript(`
            (function(index) {
              const state = window.__YTMD_HOOK__.ytmStore.getState();
              const queue = state.queue;

              const maxQueueIndex = queue.items.length - 1;

              if (index < 0 || index > maxQueueIndex) {
                return false;
              }

              const song = queue.items[index];
              let playlistPanelVideoRenderer;
              if (song.playlistPanelVideoRenderer) {
                playlistPanelVideoRenderer = song.playlistPanelVideoRenderer;
              } else if (song.playlistPanelVideoWrapperRenderer) {
                playlistPanelVideoRenderer = song.playlistPanelVideoWrapperRenderer.primaryRenderer.playlistPanelVideoRenderer;
              }

              if (playlistPanelVideoRenderer) {
                document.querySelector("ytmusic-app-layout>ytmusic-player-bar").queue.removeByVideoId(playlistPanelVideoRenderer.videoId);
                return true;
              }
              return false;
            })
          `)
        )(removeIndex);
        break;
      }

      case "moveQueueItem": {
        const moveData = JSON.parse(value);
        try {
          await (await webFrame.executeJavaScript(moveQueueScript))(moveData.from, moveData.to);
        } catch (e) {
          console.error("Failed to move queue item:", e);
        }
        break;
      }

      case "toggleLibrary": {
        (
          await webFrame.executeJavaScript(`
            (function() {
              const currentMenu = document.querySelector("ytmusic-app-layout>ytmusic-player-bar").getMenuRenderer();
              if (!currentMenu) return;

              for (let i = 0; i < currentMenu.items.length; i++) {
                const item = currentMenu.items[i];
                if (item.toggleMenuServiceItemRenderer) {
                  if (
                    item.toggleMenuServiceItemRenderer.defaultIcon.iconType === "BOOKMARK_BORDER" ||
                    item.toggleMenuServiceItemRenderer.defaultIcon.iconType === "BOOKMARK"
                  ) {
                    const state = window.__YTMD_HOOK__.ytmStore.getState();
                    const defaultToken = item.toggleMenuServiceItemRenderer.defaultServiceEndpoint.feedbackEndpoint.feedbackToken;
                    const toggledToken = item.toggleMenuServiceItemRenderer.toggledServiceEndpoint.feedbackEndpoint.feedbackToken;

                    const isToggled = state.toggleStates.feedbackToggleStates[defaultToken] || false;
                    const feedbackToken = isToggled ? toggledToken : defaultToken;

                    var feedbackEvent = {
                      bubbles: true,
                      cancelable: false,
                      composed: true,
                      detail: {
                        actionName: "yt-service-request",
                        args: [
                          document.querySelector("ytmusic-app-layout>ytmusic-player-bar"),
                          {
                            feedbackEndpoint: {
                              feedbackToken: feedbackToken
                            }
                          }
                        ],
                        optionalAction: false,
                        returnValue: []
                      }
                    };
                    document.querySelector("ytmusic-app-layout>ytmusic-player-bar").dispatchEvent(new CustomEvent("yt-action", feedbackEvent));
                    window.__YTMD_HOOK__.ytmStore.dispatch({
                      type: "SET_FEEDBACK_TOGGLE_STATE",
                      payload: { defaultEndpointFeedbackToken: defaultToken, isToggled: !isToggled }
                    });
                    break;
                  }
                }
              }
            })
          `)
        )();
        break;
      }

      case "addToPlaylist": {
        const playlistData = value;
        try {
          await (await webFrame.executeJavaScript(addToPlaylistScript))(playlistData.playlistId, playlistData.videoId);
        } catch (e) {
          console.error("Failed to add to playlist:", e);
        }
        break;
      }
    }
  });

  ipcRenderer.on("ytmView:getPlaylists", async (_event, requestId) => {
    const rawPlaylists = await (await webFrame.executeJavaScript(getPlaylistsScript))();

    const playlists = [];
    for (const rawPlaylist of rawPlaylists) {
      const playlist = rawPlaylist.playlistAddToOptionRenderer;
      if (!playlist) continue;
      playlists.push({
        id: playlist.playlistId,
        title: playlist.title?.simpleText || getYTMTextRun(playlist.title?.runs || []),
        thumbnails: playlist.thumbnail?.thumbnails || [],
        containsVideo: playlist.containsSelectedVideos === "ALL"
      });
    }
    ipcRenderer.send(`ytmView:getPlaylists:response:${requestId}`, playlists);
  });

  ipcRenderer.on("ytmView:libraryState", async (_event, requestId) => {
    try {
      const result = await (
        await webFrame.executeJavaScript(`
          (function() {
            const menuRenderer = document.querySelector("ytmusic-app-layout>ytmusic-player-bar")?.getMenuRenderer?.();
            if (!menuRenderer || !menuRenderer.items) return null;

            const result = { inLibrary: false, isLiked: false, isDisliked: false };
            for (const item of menuRenderer.items) {
              const toggle = item.toggleMenuServiceItemRenderer;
              if (!toggle) continue;
              const text = toggle.defaultText?.runs?.[0]?.text || "";
              if (text === "Save to library" || text === "Remove from library") {
                result.inLibrary = !!toggle.isToggled;
              }
              if (text === "Add to liked songs" || text === "Remove from liked songs") {
                result.isLiked = !!toggle.isToggled;
              }
            }
            return result;
          })
        `)
      )();
      ipcRenderer.send(`ytmView:libraryState:response:${requestId}`, result);
    } catch (e) {
      ipcRenderer.send(`ytmView:libraryState:response:${requestId}`, null);
    }
  });

  ipcRenderer.on("ytmView:getLyrics", async (_event, requestId) => {
    try {
      const lyrics = await (await webFrame.executeJavaScript(getLyricsScript))();
      ipcRenderer.send(`ytmView:getLyrics:response:${requestId}`, lyrics);
    } catch (e) {
      ipcRenderer.send(`ytmView:getLyrics:response:${requestId}`, null);
    }
  });

  ipcRenderer.on("ytmView:addToPlaylist", async (_event, requestId, playlistId, videoId) => {
    try {
      const result = await (await webFrame.executeJavaScript(addToPlaylistScript))(playlistId, videoId);
      ipcRenderer.send(`ytmView:addToPlaylist:response:${requestId}`, result);
    } catch (e) {
      ipcRenderer.send(`ytmView:addToPlaylist:response:${requestId}`, null);
    }
  });

  ipcRenderer.on("ytmView:search", async (_event, requestId, query, filter) => {
    try {
      const results = await (await webFrame.executeJavaScript(searchScript))(query, filter);
      ipcRenderer.send(`ytmView:search:response:${requestId}`, results);
    } catch (e) {
      ipcRenderer.send(`ytmView:search:response:${requestId}`, null);
    }
  });

  ipcRenderer.on("ytmView:home", async (_event, requestId) => {
    try {
      const results = await (await webFrame.executeJavaScript(homeScript))();
      ipcRenderer.send(`ytmView:home:response:${requestId}`, results);
    } catch (e) {
      ipcRenderer.send(`ytmView:home:response:${requestId}`, null);
    }
  });

  ipcRenderer.on("ytmView:browse", async (_event, requestId, browseId) => {
    try {
      const results = await (await webFrame.executeJavaScript(browseScript))(browseId);
      ipcRenderer.send(`ytmView:browse:response:${requestId}`, results);
    } catch (e) {
      ipcRenderer.send(`ytmView:browse:response:${requestId}`, null);
    }
  });

  ipcRenderer.on("ytmView:songInfo", async (_event, requestId, videoId) => {
    try {
      const results = await (await webFrame.executeJavaScript(songInfoScript))(videoId);
      ipcRenderer.send(`ytmView:songInfo:response:${requestId}`, results);
    } catch (e) {
      ipcRenderer.send(`ytmView:songInfo:response:${requestId}`, null);
    }
  });

  ipcRenderer.on("ytmView:next", async (_event, requestId, videoId, playlistId) => {
    try {
      const results = await (await webFrame.executeJavaScript(nextScript))(videoId, playlistId);
      ipcRenderer.send(`ytmView:next:response:${requestId}`, results);
    } catch (e) {
      ipcRenderer.send(`ytmView:next:response:${requestId}`, null);
    }
  });

  ipcRenderer.on("ytmView:explore", async (_event, requestId) => {
    try {
      const results = await (await webFrame.executeJavaScript(exploreScript))();
      ipcRenderer.send(`ytmView:explore:response:${requestId}`, results);
    } catch (e) {
      ipcRenderer.send(`ytmView:explore:response:${requestId}`, null);
    }
  });

  ipcRenderer.on("ytmView:history", async (_event, requestId) => {
    try {
      const results = await (await webFrame.executeJavaScript(historyScript))();
      ipcRenderer.send(`ytmView:history:response:${requestId}`, results);
    } catch (e) {
      ipcRenderer.send(`ytmView:history:response:${requestId}`, null);
    }
  });

  ipcRenderer.on("ytmView:getAutomixChips", async (_event, requestId) => {
    try {
      const results = await (await webFrame.executeJavaScript(automixChipsScript))("get", null);
      ipcRenderer.send(`ytmView:getAutomixChips:response:${requestId}`, results);
    } catch (e) {
      ipcRenderer.send(`ytmView:getAutomixChips:response:${requestId}`, null);
    }
  });

  ipcRenderer.on("ytmView:selectAutomixChip", async (_event, requestId, chipIndex) => {
    try {
      const results = await (await webFrame.executeJavaScript(automixChipsScript))("select", chipIndex);
      ipcRenderer.send(`ytmView:selectAutomixChip:response:${requestId}`, results);
    } catch (e) {
      ipcRenderer.send(`ytmView:selectAutomixChip:response:${requestId}`, null);
    }
  });

  store.onDidAnyChange(newState => {
    if (newState.appearance.alwaysShowVolumeSlider) {
      const volumeSlider = document.querySelector("#volume-slider");
      if (!volumeSlider.classList.contains("ytmd-persist-volume-slider")) {
        volumeSlider.classList.add("ytmd-persist-volume-slider");
      }
    } else {
      const volumeSlider = document.querySelector("#volume-slider");
      if (volumeSlider.classList.contains("ytmd-persist-volume-slider")) {
        volumeSlider.classList.remove("ytmd-persist-volume-slider");
      }
    }
  });

  ipcRenderer.on("ytmView:refitPopups", async () => {
    // Update 4/14/2024: Broken until a hook is provided for this
    /*
    (
      await webFrame.executeJavaScript(`
        (function() {
          document.querySelector("ytmusic-popup-container").refitPopups_();
        })
      `)
    )();
    */
  });

  ipcRenderer.on("ytmView:executeScript", async (_event, integrationName, scriptName) => {
    const scripts = integrationScripts[integrationName];
    if (scripts) {
      const script = scripts[scriptName];
      if (script) {
        (await webFrame.executeJavaScript(script))();
      }
    }
  });

  ipcRenderer.send("ytmView:loaded");
});
