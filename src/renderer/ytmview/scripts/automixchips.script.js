// @ts-nocheck
// Automix taste profile chips - read and select mood filter chips
// These are the "Familiar", "Discover", "Popular", "Deep cuts", "Upbeat", "Chill" chips
(function(action, chipIndex) {
  // action: "get" — returns available chips
  // action: "select" — selects chip at chipIndex

  return new Promise((resolve, reject) => {
    try {
      // Find the queue/side panel where the chips live
      const queuePanel = document.querySelector("ytmusic-player-queue-overlay, ytmusic-tab-renderer, ytmusic-player-page");
      
      // Try to find chip elements in the queue panel
      // The chips are rendered as iron-selector > a.chip-container or ytmusic-chip-cloud-renderer
      const chipCloud = document.querySelector("ytmusic-player-queue-overlay #automix-contents ytmusic-chip-cloud-renderer") ||
                        document.querySelector("#tabsContent ytmusic-chip-cloud-renderer") ||
                        document.querySelector("ytmusic-chip-cloud-renderer");

      if (!chipCloud) {
        // Fallback: try to get chips from the store/player state
        const state = window.__YTMD_HOOK__?.ytmStore?.getState();
        if (state?.queue?.automixItems) {
          resolve({ chips: [], message: "Automix chips not visible (queue panel may be closed)" });
        } else {
          resolve({ chips: [], message: "No automix chips found" });
        }
        return;
      }

      const chipElements = chipCloud.querySelectorAll("ytmusic-chip-cloud-chip-renderer");

      if (action === "get") {
        const chips = [];
        chipElements.forEach((chip, index) => {
          const text = chip.querySelector("yt-formatted-string, .text")?.textContent?.trim() || chip.textContent?.trim();
          const isSelected = chip.hasAttribute("selected") || chip.getAttribute("chip-style") === "STYLE_PRIMARY";
          chips.push({
            index: index,
            label: text,
            selected: isSelected
          });
        });
        resolve({ chips });
        return;
      }

      if (action === "select") {
        if (chipIndex < 0 || chipIndex >= chipElements.length) {
          reject("Invalid chip index: " + chipIndex + ", available: " + chipElements.length);
          return;
        }

        // Click the chip
        const targetChip = chipElements[chipIndex];
        targetChip.click();

        setTimeout(() => {
          resolve({ success: true, selectedIndex: chipIndex, label: targetChip.textContent?.trim() });
        }, 300);
        return;
      }

      reject("Unknown action: " + action);
    } catch (e) {
      reject("Failed automix chip operation: " + e.message);
    }
  });
})
