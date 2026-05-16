/**
 * Meta Verification — page-specific JS.
 *
 * Stage 2 of brand verification:
 *   - Reads the light/dark logos saved by stage 1 (Logo Upload & Crop) out of
 *     localStorage and paints them into the right-hand "Verified Brand
 *     Identity" preview tiles.
 *   - Wires the Verify button to the shared sync popup ("Verifying…" → "Verified").
 *   - Wires the Copy button on the meta-tag snippet card.
 *
 * The Free / Freemium variant of this page lives at
 * ../freemium/Freemium-Meta-Verification.html and loads this same script;
 * its Continue button already points directly at Freemium-Brand-Settings,
 * so there's no tier-flag logic here.
 */
(function () {
  if (window.bbMetaVerificationInit) return;
  window.bbMetaVerificationInit = true;

  window.addEventListener("error", function () { /* keep chrome up */ });
  window.addEventListener("unhandledrejection", function () { /* keep chrome up */ });

  const LS_LIGHT_LOGO = "bbLuLightLogoData";
  const LS_DARK_LOGO  = "bbLuDarkLogoData";

  /* Dev-only override that flips this page from the default
     "Verified" state into the "Brand Not Verified" failure state.
     Set from the dev export tool (dev/export-settings.html) and
     read live here so engineers / backend devs can preview the
     failure UI without having to actually fail the verify flow.
     Values: "fail" → failed state, anything else → verified.   */
  const LS_DEV_VERIFY_STATE = "bbDevVerifyState";

  /* Default & failed title content for the right-hand card. The
     failed title doubles as a support-contact line per design. */
  const TITLE_DEFAULT = "Verified Brand Identity";
  const TITLE_FAILED_HTML =
    "Unable to Verify Brand." +
    "<span class=\"bb-lu-card-title-sub\">Please contact " +
    "<a href=\"mailto:support@brandbased.ai\">support@brandbased.ai</a>" +
    "</span>";

  function isFailedState() {
    try {
      return localStorage.getItem(LS_DEV_VERIFY_STATE) === "fail";
    } catch (_e) {
      return false;
    }
  }

  /* Apply the verified / failed state. Toggles `data-verified` on
     each preview figure (the existing logo-upload.css already knows
     how to paint both states) and swaps the right-card title text +
     red helper class. Safe to call repeatedly. */
  function applyVerifyState() {
    const failed = isFailedState();
    const figures = document.querySelectorAll(".bb-lu-preview");
    figures.forEach(function (fig) {
      fig.setAttribute("data-verified", failed ? "failed" : "true");
    });
    const title = document.getElementById("bbMvRightTitle");
    if (title) {
      if (failed) {
        title.classList.add("bb-lu-card-title--failed");
        title.innerHTML = TITLE_FAILED_HTML;
      } else {
        title.classList.remove("bb-lu-card-title--failed");
        title.textContent = TITLE_DEFAULT;
      }
    }
  }

  function syncPreviewMask(imgEl) {
    if (!imgEl) return;
    const panel = imgEl.closest(".bb-lu-preview");
    if (!panel) return;
    const src = imgEl.currentSrc || imgEl.src;
    if (src) panel.style.setProperty("--bb-lu-bicon-src", "url(\"" + src + "\")");
  }

  function setPreview(imgEl, dataUrl) {
    if (!imgEl) return;
    const onLoad = function () {
      syncPreviewMask(imgEl);
      imgEl.removeEventListener("load", onLoad);
    };
    imgEl.addEventListener("load", onLoad);
    if (dataUrl) imgEl.src = dataUrl;
    if (imgEl.complete) onLoad();
  }

  function init() {
    try {
      // ---- Dev verify-state override ------------------------------------
      // Apply once on load, then react to the dev export tool toggling
      // the flag in another tab so the preview flips live.
      applyVerifyState();
      window.addEventListener("storage", function (e) {
        if (e && e.key && e.key !== LS_DEV_VERIFY_STATE) return;
        applyVerifyState();
      });

      // ---- Hydrate verified previews from stage 1 -----------------------
      const previewLight = document.getElementById("bbMvPreviewLight");
      const previewDark  = document.getElementById("bbMvPreviewDark");
      try {
        const lightSaved = localStorage.getItem(LS_LIGHT_LOGO);
        const darkSaved  = localStorage.getItem(LS_DARK_LOGO);
        if (lightSaved) setPreview(previewLight, lightSaved);
        else if (previewLight) syncPreviewMask(previewLight);
        if (darkSaved)  setPreview(previewDark, darkSaved);
        else if (previewDark)  syncPreviewMask(previewDark);
      } catch (_e) {
        if (previewLight) syncPreviewMask(previewLight);
        if (previewDark)  syncPreviewMask(previewDark);
      }

      // ---- Verify button → shared "Verifying…" → "Verified" popup ------
      const syncBtn = document.getElementById("bbMvSyncBtn");
      if (syncBtn) {
        syncBtn.addEventListener("click", function () {
          if (typeof window.bbShowSyncPopup !== "function") return;
          window.bbShowSyncPopup({
            label: "Verifying…",
            doneLabel: "Verified",
            barColor: "#635bff",
            logoSrc: "../brandbased-logo.svg",
            duration: 4500,
            doneHoldMs: 1500,
            shineLabel: true,
          });
        });
      }

      // ---- Copy meta-tag snippet ----------------------------------------
      const copyBtn   = document.getElementById("bbMvCopyBtn");
      const snippetEl = document.getElementById("bbMvCodeSnippet");
      const toastEl   = document.getElementById("bbMvCopyToast");
      let toastTimer = 0;

      function flashToast() {
        if (!toastEl) return;
        toastEl.classList.add("bb-mv-copy-toast--show");
        if (toastTimer) window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(function () {
          toastEl.classList.remove("bb-mv-copy-toast--show");
        }, 1400);
      }

      if (copyBtn && snippetEl) {
        /* Best-effort copy: try the async Clipboard API first, then fall
           back to a selection + `execCommand("copy")` if it rejects (the
           async API rejects on insecure contexts like `file://`, where
           the demo is opened directly off disk). Either way we always
           flash the blue "Copied" toast so the user gets visual
           confirmation that the action ran — a previous version set a
           `done` flag synchronously before the promise resolved, which
           silently swallowed the rejection and showed no toast at all. */
        function legacyCopy() {
          try {
            const range = document.createRange();
            range.selectNodeContents(snippetEl);
            const sel = window.getSelection();
            if (sel) {
              sel.removeAllRanges();
              sel.addRange(range);
              document.execCommand("copy");
              sel.removeAllRanges();
            }
          } catch (_e) { /* clipboard unsupported; ignore */ }
        }

        copyBtn.addEventListener("click", function () {
          const text = snippetEl.textContent || "";
          let triedAsync = false;
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              triedAsync = true;
              navigator.clipboard.writeText(text).catch(function () {
                legacyCopy();
              });
            }
          } catch (_e) { /* legacy path below */ }
          if (!triedAsync) legacyCopy();

          flashToast();
          copyBtn.classList.add("bb-mv-code-copy--bump");
          window.setTimeout(function () {
            copyBtn.classList.remove("bb-mv-code-copy--bump");
          }, 280);
        });
      }
    } catch (_e) {
      /* page still renders fine via static HTML/CSS */
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
