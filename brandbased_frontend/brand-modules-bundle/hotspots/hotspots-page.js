/**
 * Hotspots module — runs only on Hotspots.html (body.bb-hotspots-page).
 * Lightweight: persist the URL across reloads via localStorage and flash a
 * "Synced" affordance on the Sync button so the demo feels live.
 */
(function () {
  const body = document.body;
  if (!body || !body.classList.contains("bb-hotspots-page")) return;

  const STORAGE_KEY = "bb.hotspots.url.v1";

  const input = document.getElementById("bbHotspotsUrl");
  const syncBtn = document.getElementById("bbHotspotsSyncBtn");

  /* Hydrate any previously-typed URL so the demo behaves predictably across reloads. */
  if (input) {
    try {
      const prev = window.localStorage?.getItem(STORAGE_KEY) || "";
      if (prev) input.value = prev;
    } catch {}
    input.addEventListener("input", function () {
      try {
        window.localStorage?.setItem(STORAGE_KEY, String(input.value || ""));
      } catch {}
    });
  }

  if (syncBtn) {
    syncBtn.addEventListener("click", function () {
      try {
        if (typeof console !== "undefined" && console.info) {
          console.info("[Hotspots demo] sync URL", input ? input.value : "");
        }
      } catch {}
      if (typeof window.bbShowSyncPopup === "function") {
        window.bbShowSyncPopup({
          label: "Syncing",
          barColor: "#635bff",
          logoSrc: "../brandbased-logo.svg",
        });
      }
    });
  }

  document.querySelectorAll(".bb-plat-info-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      try {
        if (typeof console !== "undefined" && console.info) {
          console.info("[Hotspots demo] info tip");
        }
      } catch {}
    });
  });

  /* Publish Now panel — shared bbShowSyncPopup handles the
     "Publishing → Published" finishing beat automatically (it
     auto-derives the done label by replacing a trailing "ing" with
     "ed"), so all we do here is open the popup with a 10s bar fill. */
  const publishBtn = document.getElementById("bbHotspotsPublishBtn");
  if (publishBtn && typeof window.bbShowSyncPopup === "function") {
    publishBtn.addEventListener("click", function () {
      window.bbShowSyncPopup({
        label: "Publishing",
        barColor: "#635bff",
        logoSrc: "../brandbased-logo.svg",
        shineLabel: true,
        duration: 10000,
        doneHoldMs: 1500,
      });
    });
  }
})();

