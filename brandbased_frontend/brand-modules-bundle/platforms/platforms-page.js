/**
 * Platforms module — runs only on Platforms.html (body.bb-platforms-page).
 * Does not register globals used elsewhere in the bundle.
 */
(function () {
  const body = document.body;
  if (!body || !body.classList.contains("bb-platforms-page")) return;

  const mount = document.getElementById("bbPlatformsMount");
  if (!mount) return;

  mount.dataset.bbPlatformsReady = "1";

  function noopSync(label) {
    return function () {
      if (typeof console !== "undefined" && console.info) {
        console.info("[Platforms demo]", label);
      }
    };
  }

  /* Brand purple progress bar — matches the Sync button background. */
  const SYNC_BAR_COLOR = "#635bff";
  const SYNC_LOGO_SRC = "../brandbased-logo.svg";

  function showSyncPopup(label) {
    if (typeof window.bbShowSyncPopup === "function") {
      window.bbShowSyncPopup({ label: "Syncing", barColor: SYNC_BAR_COLOR, logoSrc: SYNC_LOGO_SRC });
    }
    noopSync(label)();
  }

  const syncExcluded = document.getElementById("bbPlatSyncExcluded");
  if (syncExcluded) syncExcluded.addEventListener("click", function () { showSyncPopup("sync excluded URLs"); });

  const syncGlobal = document.getElementById("bbPlatSyncGlobal");
  if (syncGlobal) syncGlobal.addEventListener("click", function () { showSyncPopup("sync global platforms"); });

  const excludedRoot = document.getElementById("bbPlatExcludedUrlsRoot");
  const addExcludedBtn = document.getElementById("bbPlatAddExcludedUrl");
  let excludedUrlSeq = 0;

  function addExcludedUrlRow() {
    if (!excludedRoot) return;
    const templateField = excludedRoot.querySelector(".bb-plat-url-field");
    if (!templateField) return;
    excludedUrlSeq += 1;
    const row = templateField.cloneNode(true);
    const input = row.querySelector(".bb-plat-url-input");
    const label = row.querySelector("label.bb-plat-visually-hidden");
    const nextId = "bbPlatExcludedUrl_" + excludedUrlSeq;
    if (input) {
      input.id = nextId;
      input.value = "";
    }
    if (label) label.setAttribute("for", nextId);
    excludedRoot.appendChild(row);
    if (input) input.focus();
  }

  if (addExcludedBtn) addExcludedBtn.addEventListener("click", addExcludedUrlRow);

  if (excludedRoot) {
    excludedRoot.addEventListener("click", function (e) {
      const btn = e.target && e.target.closest && e.target.closest(".bb-plat-url-remove");
      if (!btn || !excludedRoot.contains(btn)) return;
      const row = btn.closest(".bb-plat-url-field");
      if (!row || !excludedRoot.contains(row)) return;
      const rows = excludedRoot.querySelectorAll(".bb-plat-url-field");
      if (rows.length > 1) {
        row.remove();
      } else {
        const input = row.querySelector(".bb-plat-url-input");
        if (input) input.value = "";
      }
    });
  }

  function syncPlatformRowOffState(row) {
    const input = row.querySelector(".bb-plat-toggle__input");
    if (!input) return;
    row.classList.toggle("bb-plat-platform-row--off", !input.checked);
  }

  document.querySelectorAll(".bb-plat-platform-row").forEach(function (row) {
    const input = row.querySelector(".bb-plat-toggle__input");
    if (input) {
      input.addEventListener("change", function () {
        syncPlatformRowOffState(row);
      });
      syncPlatformRowOffState(row);
    }
  });

  document.querySelectorAll(".bb-plat-info-btn").forEach(function (btn) {
    btn.addEventListener("click", noopSync("info tip"));
  });

  const enableHotspotsBtn = document.getElementById("bbPlatEnableHotspotsBtn");
  if (enableHotspotsBtn) {
    enableHotspotsBtn.addEventListener("click", function () {
      window.location.href = "../hotspots/Hotspots.html";
    });
  }

  /* Mobile/stacked layout: Enable Dynamic Hotspots CTA should sit *below* the Platform Partners
     panel rather than between the Excluded URLs and Partners panels. We physically relocate the
     element since it lives inside .bb-bts-left in the source order, and CSS reordering across
     parent containers (.bb-bts-left vs .bb-bts-right) is awkward without display:contents hacks. */
  (function () {
    const ctaPanel = document.querySelector(".bb-plat-hotspots-cta");
    const partnersPanel = document.querySelector(".bb-bts-right.bb-bts-right--platforms");
    if (!ctaPanel || !partnersPanel) return;

    const originalParent = ctaPanel.parentElement;
    const originalNext = ctaPanel.nextElementSibling;
    const STACK_BREAKPOINT = 1350; /* matches theme: <1351px collapses the 2-col grid */
    let lastIsMobile = null;

    function applyOrder() {
      const isMobile = window.matchMedia("(max-width: " + STACK_BREAKPOINT + "px)").matches;
      if (isMobile === lastIsMobile) return;
      lastIsMobile = isMobile;
      if (isMobile) {
        if (partnersPanel.parentElement) {
          partnersPanel.parentElement.appendChild(ctaPanel);
        }
        ctaPanel.classList.add("bb-plat-hotspots-cta--stacked");
      } else {
        ctaPanel.classList.remove("bb-plat-hotspots-cta--stacked");
        if (!originalParent) return;
        if (originalNext && originalNext.parentElement === originalParent) {
          originalParent.insertBefore(ctaPanel, originalNext);
        } else {
          originalParent.appendChild(ctaPanel);
        }
      }
    }

    applyOrder();
    let resizeT = null;
    window.addEventListener("resize", function () {
      try { window.clearTimeout(resizeT); } catch {}
      resizeT = window.setTimeout(applyOrder, 80);
    });
  })();

  const excludedPanel = document.getElementById("bbPlatExcludedPanel");
  const excludedResizeHandle = document.getElementById("bbPlatExcludedResizeHandle");
  const EXCLUDED_H_STORAGE = "bb-plat-excluded-panel-height-px";
  const EXCLUDED_H_MIN = 425;

  function excludedPanelMaxHeight() {
    return Math.min(720, Math.floor(window.innerHeight * 0.88));
  }

  function getExcludedPanelHeightPx(panel) {
    if (!panel) return EXCLUDED_H_MIN;
    const raw = getComputedStyle(panel).getPropertyValue("--bb-plat-excluded-panel-height").trim();
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : EXCLUDED_H_MIN;
  }

  function setExcludedPanelHeightPx(panel, h) {
    if (!panel) return;
    const maxH = excludedPanelMaxHeight();
    const next = Math.round(Math.max(EXCLUDED_H_MIN, Math.min(maxH, h)));
    panel.style.setProperty("--bb-plat-excluded-panel-height", next + "px");
    try {
      localStorage.setItem(EXCLUDED_H_STORAGE, String(next));
    } catch (e) {}
  }

  function excludedPanelHeightReloadClearsStorage() {
    try {
      const navList = performance.getEntriesByType && performance.getEntriesByType("navigation");
      const nav = navList && navList[0];
      if (nav && nav.type === "reload") {
        localStorage.removeItem(EXCLUDED_H_STORAGE);
        return;
      }
      if (
        typeof performance.navigation !== "undefined" &&
        performance.navigation.type === performance.navigation.TYPE_RELOAD
      ) {
        localStorage.removeItem(EXCLUDED_H_STORAGE);
      }
    } catch (e) {}
  }

  function initExcludedPanelHeight() {
    if (!excludedPanel) return;
    excludedPanelHeightReloadClearsStorage();
    try {
      const saved = localStorage.getItem(EXCLUDED_H_STORAGE);
      if (saved != null) {
        const n = parseInt(saved, 10);
        if (!Number.isNaN(n)) setExcludedPanelHeightPx(excludedPanel, n);
      }
    } catch (e) {}
  }

  function clampExcludedPanelHeightOnResize() {
    if (!excludedPanel) return;
    setExcludedPanelHeightPx(excludedPanel, getExcludedPanelHeightPx(excludedPanel));
  }

  initExcludedPanelHeight();

  const excludedCollapseBtn = document.getElementById("bbPlatExcludedCollapse");
  if (excludedCollapseBtn && excludedPanel) {
    excludedCollapseBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      setExcludedPanelHeightPx(excludedPanel, EXCLUDED_H_MIN);
    });
  }

  if (excludedPanel && excludedResizeHandle) {
    excludedResizeHandle.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      const startY = e.clientY;
      const startH = getExcludedPanelHeightPx(excludedPanel);

      function onMove(ev) {
        const dy = ev.clientY - startY;
        setExcludedPanelHeightPx(excludedPanel, startH + dy);
      }

      function onUp() {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
      }

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    });

    excludedResizeHandle.addEventListener("dblclick", function () {
      setExcludedPanelHeightPx(excludedPanel, EXCLUDED_H_MIN);
    });
  }

  window.addEventListener("resize", clampExcludedPanelHeightOnResize);
})();
