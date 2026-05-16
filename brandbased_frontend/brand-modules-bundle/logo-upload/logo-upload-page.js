/**
 * Logo Upload & Crop — page-specific JS.
 *
 * Vendor `bb-smart-ui.js` already wires the Light Mode tile (#bbUploadBtn /
 * #bbUploadInput) to the Konva crop overlay. This file adds:
 *   - Dark Mode SVG uploads forward into #bbUploadInput so the Konva cropper
 *     runs; `bbLuLastUploadMode` routes the saved SVG into the correct preview.
 *   - Dark raster (PNG/JPG) still uses a direct FileReader path (no cropper).
 *   - Light persistence of the brand name + URL fields across reloads (demo).
 *   - Sync button — opens shared popup ("Syncing brand data.." → "Synced")
 *     then navigates to Meta Verification.
 */
(function () {
  if (window.bbLogoUploadInit) return;
  window.bbLogoUploadInit = true;

  // Swallow any stray runtime error so the page chrome stays up.
  window.addEventListener("error", function () { /* noop */ });
  window.addEventListener("unhandledrejection", function () { /* noop */ });

  const LS_NAME       = "bbLuBrandName";
  const LS_URL        = "bbLuBrandUrl";
  const LS_MODE       = "bbLuLastUploadMode"; // "light" | "dark"
  const LS_LIGHT_LOGO = "bbLuLightLogoData";  // data: URL of light-mode upload
  const LS_DARK_LOGO  = "bbLuDarkLogoData";   // data: URL of dark-mode upload

  function init() {
    try {
      // ---- Brand name + URL persistence ----------------------------------
      const nameEl = document.getElementById("bbLuBrandName");
      const urlEl  = document.getElementById("bbLuBrandUrl");
      try {
        if (nameEl && localStorage.getItem(LS_NAME)) nameEl.value = localStorage.getItem(LS_NAME);
        if (urlEl  && localStorage.getItem(LS_URL))  urlEl.value  = localStorage.getItem(LS_URL);
      } catch (_e) { /* localStorage may be unavailable */ }

      if (nameEl) {
        nameEl.addEventListener("input", function () {
          try { localStorage.setItem(LS_NAME, nameEl.value); } catch (_e) {}
        });
      }
      if (urlEl) {
        urlEl.addEventListener("input", function () {
          try { localStorage.setItem(LS_URL, urlEl.value); } catch (_e) {}
        });
      }

      // ---- Light / Dark mode upload tiles --------------------------------
      // Vendor JS auto-wires #bbUploadBtn -> #bbUploadInput. We just stamp a
      // marker so anything reading the cropped output later knows it was the
      // *light* tile that initiated this session.
      const lightBtn = document.getElementById("bbUploadBtn");
      if (lightBtn) {
        lightBtn.addEventListener("click", function () {
          try { localStorage.setItem(LS_MODE, "light"); } catch (_e) {}
        });
      }

      // Dark tile — dedicated <input id="bbUploadInputDark"> so the picker
      // opens cleanly. SVG files are forwarded to #bbUploadInput so
      // bb-smart-ui runs the same crop flow as light; PNG/JPG go straight
      // to the dark preview.
      const darkBtn        = document.getElementById("bbUploadBtnDark");
      const sharedInput    = document.getElementById("bbUploadInput");
      const darkInput      = document.getElementById("bbUploadInputDark");
      if (darkBtn && darkInput) {
        darkBtn.addEventListener("click", function (ev) {
          ev.preventDefault();
          try { localStorage.setItem(LS_MODE, "dark"); } catch (_e) {}
          darkInput.value = "";   // ensure `change` fires for repeat picks
          darkInput.click();
        });
      }

      // ---- Logo previews (light + dark panels in the right card) ---------
      // Each preview panel is a `<figure class="bb-lu-preview ...">` that
      // wraps a stage div + its `<img>`. The shimmer CSS reads the mask
      // shape from `--bb-lu-bicon-src` on the panel so the highlight
      // clips to whatever logo currently sits in that slot — the B by
      // default, or the user's uploaded SVG/PNG once chosen.
      const previewLight = document.getElementById("bbLuPreviewLight");
      const previewDark  = document.getElementById("bbLuPreviewDark");

      function syncPreviewMask(imgEl) {
        if (!imgEl) return;
        const panel = imgEl.closest(".bb-lu-preview");
        if (!panel) return;
        const src = imgEl.currentSrc || imgEl.src;
        if (src) panel.style.setProperty("--bb-lu-bicon-src", "url(\"" + src + "\")");
      }

      // Verification state: "false" (default), "true" (verified) or "failed".
      // Anything truthy non-"failed" maps to "true" for backwards compat.
      function setVerified(mode, state) {
        const panel = (mode === "dark" ? previewDark : previewLight);
        const fig = panel ? panel.closest(".bb-lu-preview") : null;
        if (!fig) return;
        let value;
        if (state === "failed") value = "failed";
        else if (state === true || state === "true") value = "true";
        else value = "false";
        fig.setAttribute("data-verified", value);
      }

      // Demo helper: lets you flip a panel between states from the
      // browser console, e.g.:
      //   bbLuSetVerified("light", "failed")
      //   bbLuSetVerified("dark", "verified")
      //   bbLuSetVerified("dark", "none")
      window.bbLuSetVerified = function (mode, state) {
        const normalized = state === "verified" ? "true"
                         : state === "none"     ? "false"
                         : state;
        setVerified(mode, normalized);
      };

      function setPreview(mode, dataUrl, opts) {
        opts = opts || {};
        const imgEl = mode === "dark" ? previewDark : previewLight;
        if (!imgEl) return;
        const isUserUpload = !!dataUrl;
        const onLoad = function () {
          syncPreviewMask(imgEl);
          imgEl.removeEventListener("load", onLoad);
        };
        imgEl.addEventListener("load", onLoad);
        imgEl.src = dataUrl || imgEl.getAttribute("data-default-src") || imgEl.src;
        if (imgEl.complete) onLoad();
        if (opts.markVerified !== false) setVerified(mode, isUserUpload);
      }

      // Restore previously-uploaded previews (so a refresh keeps state).
      try {
        const lightSaved = localStorage.getItem(LS_LIGHT_LOGO);
        const darkSaved  = localStorage.getItem(LS_DARK_LOGO);
        if (lightSaved) setPreview("light", lightSaved);
        else if (previewLight) { syncPreviewMask(previewLight); setVerified("light", false); }
        if (darkSaved) setPreview("dark", darkSaved);
        else if (previewDark) { syncPreviewMask(previewDark); setVerified("dark", false); }
      } catch (_e) {
        if (previewLight) { syncPreviewMask(previewLight); setVerified("light", false); }
        if (previewDark)  { syncPreviewMask(previewDark);  setVerified("dark", false); }
      }

      // Read a file from one of our inputs and mirror it to the matching
      // preview slot. Persisted to localStorage as a data URL so a refresh
      // keeps the visual state.
      function handleUpload(inputEl, modeOverride) {
        const file = inputEl && inputEl.files && inputEl.files[0];
        if (!file) return;
        const mode = modeOverride || (function () {
          try { return localStorage.getItem(LS_MODE) || "light"; }
          catch (_e) { return "light"; }
        })();
        const reader = new FileReader();
        reader.onload = function () {
          const dataUrl = String(reader.result || "");
          if (!dataUrl) return;
          setPreview(mode, dataUrl);
          try {
            localStorage.setItem(mode === "dark" ? LS_DARK_LOGO : LS_LIGHT_LOGO, dataUrl);
          } catch (_e) { /* quota or unavailable — preview still updates in-memory */ }
        };
        reader.readAsDataURL(file);
      }

      function svgTextToDataUrl(svgText) {
        return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(String(svgText || ""));
      }

      function applyDarkRasterFromFile(file) {
        if (!file) return;
        const r = new FileReader();
        r.onload = function () {
          const dataUrl = String(r.result || "");
          if (!dataUrl) return;
          setPreview("dark", dataUrl);
          try {
            localStorage.setItem(LS_DARK_LOGO, dataUrl);
          } catch (_e) {}
        };
        r.readAsDataURL(file);
      }

      document.addEventListener("bb-asset-lab-crop-saved", function (ev) {
        try {
          const svg = ev.detail && ev.detail.svgText;
          if (!svg) return;
          window.__bbLuDarkSvgCropPending = false;
          let mode = "light";
          try {
            mode = localStorage.getItem(LS_MODE) || "light";
          } catch (_e) {}
          const dataUrl = svgTextToDataUrl(svg);
          setPreview(mode, dataUrl);
          try {
            localStorage.setItem(mode === "dark" ? LS_DARK_LOGO : LS_LIGHT_LOGO, dataUrl);
          } catch (_e2) {}
        } catch (_e) {}
      });

      document.addEventListener("bb-asset-lab-crop-closed", function () {
        if (window.__bbLuDarkSvgCropPending) window.__bbLuDarkSvgCropPending = false;
      });

      if (sharedInput) {
        sharedInput.addEventListener("change", function () {
          if (window.__bbLuDarkSvgCropPending) return;
          handleUpload(sharedInput, "light");
        });
      }
      if (darkInput) {
        darkInput.addEventListener("change", function () {
          const file = darkInput.files && darkInput.files[0];
          if (!file) return;
          const name = (file.name || "").toLowerCase();
          const isSvg = name.endsWith(".svg") || file.type === "image/svg+xml";
          if (isSvg && sharedInput && typeof DataTransfer !== "undefined") {
            try {
              localStorage.setItem(LS_MODE, "dark");
            } catch (_e) {}
            try {
              window.__bbLuDarkSvgCropPending = true;
              const dt = new DataTransfer();
              dt.items.add(file);
              sharedInput.files = dt.files;
              sharedInput.dispatchEvent(new Event("change", { bubbles: true }));
              const f = file;
              requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                  if (document.querySelector(".bb-crop-overlay.open")) return;
                  if (!window.__bbLuDarkSvgCropPending) return;
                  window.__bbLuDarkSvgCropPending = false;
                  applyDarkRasterFromFile(f);
                });
              });
            } catch (_err) {
              window.__bbLuDarkSvgCropPending = false;
              handleUpload(darkInput, "dark");
            }
            darkInput.value = "";
            return;
          }
          handleUpload(darkInput, "dark");
        });
      }

      // ---- Sync button → "Syncing brand data…" → "Synced" → Meta Verification
      // Stage 1 hands off to stage 2 once the shared sync popup completes.
      //
      // Two flows share this script: the standard Brands flow
      // (../logo-upload/Logo-upload-and-Crop-module.html → Meta-Verification.html)
      // and the Start FREE / freemium flow (../freemium/Freemium-Logo-upload-
      // and-Crop-module.html → Freemium-Meta-Verification.html). We pick the
      // right next page from the current pathname so the freemium flow stays
      // self-contained and the Brand Verification page in that flow can hand
      // off to Freemium-Brand-Settings.html without any flag-passing.
      const continueBtn = document.getElementById("bbLuContinue");
      if (continueBtn) {
        continueBtn.addEventListener("click", function () {
          const isFree = /\/freemium\//i.test(window.location.pathname);
          const nextUrl = isFree
            ? "./Freemium-Meta-Verification.html"
            : "./Meta-Verification.html";
          const goNext = function () {
            window.location.href = nextUrl;
          };
          if (typeof window.bbShowSyncPopup === "function") {
            const result = window.bbShowSyncPopup({
              label: "Syncing brand data..",
              doneLabel: "Synced",
              barColor: "#635bff",
              logoSrc: "../brandbased-logo.svg",
              duration: 4500,
              doneHoldMs: 1500,
              shineLabel: true,
            });
            if (result && typeof result.then === "function") {
              result.then(goNext, goNext);
            } else {
              window.setTimeout(goNext, 6500);
            }
          } else {
            goNext();
          }
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
