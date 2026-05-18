/**
 * Logo Upload & Crop — page-specific JS.
 *
 * Vendor `bb-smart-ui.js` already wires the Light Mode tile (#bbUploadBtn /
 * #bbUploadInput) to the Konva crop overlay. This file adds:
 *   - Dark Mode SVG uploads forward into #bbUploadInput so the Konva cropper
 *     runs; `bbLuLastUploadMode` routes the saved SVG into the correct preview.
 *   - Dark raster (PNG/JPG) still uses a direct FileReader path (no cropper).
 *   - Brand name / URL / logos persist only during the current page visit (for Sync).
 *     Each new load of this page starts empty — no previous test draft.
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
  const LS_VERIFICATION_REQUEST = "bbCurrentBrandVerificationRequest";
  const SS_START_FRESH = "bbLuStartFresh";
  const LS_ASSET_LAB_SVG = "bbAssetLab:svg:v1";
  const LS_ASSET_LAB_FILENAME = "bbAssetLab:filename:v1";
  const LS_ASSET_LAB_CROP_SAVED = "bbAssetLab:cropSaved:v1";

  function shouldStartFreshFromStartNow() {
    try {
      const q = new URLSearchParams(window.location.search);
      if (q.get("fresh") === "1" || q.get("bb_fresh") === "1") return true;
      if (sessionStorage.getItem(SS_START_FRESH) === "1") {
        sessionStorage.removeItem(SS_START_FRESH);
        return true;
      }
    } catch (_e) {
      return false;
    }
    return false;
  }

  function stripFreshQueryFromUrl() {
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has("fresh") && !url.searchParams.has("bb_fresh")) return;
      url.searchParams.delete("fresh");
      url.searchParams.delete("bb_fresh");
      window.history.replaceState(
        null,
        "",
        url.pathname + (url.searchParams.toString() ? "?" + url.searchParams.toString() : "") + url.hash
      );
    } catch (_e) { /* ignore */ }
  }

  function clearLogoUploadDraft() {
    try {
      localStorage.removeItem(LS_NAME);
      localStorage.removeItem(LS_URL);
      localStorage.removeItem(LS_MODE);
      localStorage.removeItem(LS_LIGHT_LOGO);
      localStorage.removeItem(LS_DARK_LOGO);
      localStorage.removeItem(LS_VERIFICATION_REQUEST);
      localStorage.removeItem(LS_ASSET_LAB_SVG);
      localStorage.removeItem(LS_ASSET_LAB_FILENAME);
      localStorage.removeItem(LS_ASSET_LAB_CROP_SAVED);
    } catch (_e) { /* ignore */ }
  }

  function init() {
    try {
      clearLogoUploadDraft();
      stripFreshQueryFromUrl();

      // ---- Brand name + URL (empty on each page load) --------------------
      const nameEl = document.getElementById("bbLuBrandName");
      const urlEl  = document.getElementById("bbLuBrandUrl");
      if (nameEl) nameEl.value = "";
      if (urlEl) urlEl.value = "";

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

      const TERMINAL_IDENTITY = new Set([
        "verified",
        "under_review",
        "rejected",
        "flagged",
      ]);

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

      function setVerifiedBoth(state) {
        setVerified("light", state);
        setVerified("dark", state);
      }

      const verifyTitle = document.getElementById("bbLuVerifyTitle");
      const identityStatusEl = document.getElementById("bbLuIdentityStatus");
      const metaCtaBtn = document.getElementById("bbLuVerifyCtaBtn");
      const TITLE_DEFAULT = "Brand Identity";
      const TITLE_FAILED_HTML =
        "Unable to Verify Brand." +
        '<span class="bb-lu-card-title-sub">Please contact ' +
        '<a href="mailto:support@brandbased.ai">support@brandbased.ai</a>' +
        "</span>";

      function setMetaCtaEnabled(enabled) {
        if (!metaCtaBtn) return;
        if (enabled) {
          metaCtaBtn.removeAttribute("aria-disabled");
          metaCtaBtn.classList.remove("bb-mv-cta-btn--disabled");
          metaCtaBtn.style.pointerEvents = "";
        } else {
          metaCtaBtn.setAttribute("aria-disabled", "true");
          metaCtaBtn.classList.add("bb-mv-cta-btn--disabled");
          metaCtaBtn.style.pointerEvents = "none";
        }
      }

      function setIdentityStatusMessage(text, tone) {
        if (!identityStatusEl) return;
        if (!text) {
          identityStatusEl.hidden = true;
          identityStatusEl.textContent = "";
          identityStatusEl.className = "bb-lu-identity-status";
          return;
        }
        identityStatusEl.hidden = false;
        identityStatusEl.textContent = text;
        identityStatusEl.className = "bb-lu-identity-status";
        if (tone) identityStatusEl.classList.add("bb-lu-identity-status--" + tone);
      }

      function applyIdentityOutcome(brandRequest) {
        if (!brandRequest || !brandRequest.identity_status) return;
        const status = brandRequest.identity_status;

        if (verifyTitle) {
          verifyTitle.classList.remove("bb-lu-card-title--failed");
        }

        if (status === "verified") {
          setVerifiedBoth("true");
          if (verifyTitle) verifyTitle.textContent = "Verified Brand Identity";
          setIdentityStatusMessage(
            "Identity verified. You can continue to website verification.",
            ""
          );
          setMetaCtaEnabled(true);
          return;
        }

        if (status === "rejected" || status === "flagged") {
          setVerifiedBoth("failed");
          if (verifyTitle) {
            verifyTitle.classList.add("bb-lu-card-title--failed");
            verifyTitle.innerHTML = TITLE_FAILED_HTML;
          }
          setIdentityStatusMessage(
            "Unable to verify this brand association.",
            "failed"
          );
          setMetaCtaEnabled(false);
          return;
        }

        if (status === "under_review") {
          setVerifiedBoth("false");
          if (verifyTitle) verifyTitle.textContent = "Verification Under Review";
          setIdentityStatusMessage(
            "Your brand needs manual review before you can continue. We will notify you when review is complete.",
            "review"
          );
          setMetaCtaEnabled(false);
          return;
        }

        setVerifiedBoth("false");
        if (verifyTitle) verifyTitle.textContent = TITLE_DEFAULT;
        setIdentityStatusMessage("", "");
        setMetaCtaEnabled(false);
      }

      async function finishProgressModal(modal, finishOpts) {
        if (!modal || typeof modal.finish !== "function") return;
        try {
          await Promise.race([
            modal.finish(finishOpts || {}),
            new Promise(function (resolve) {
              window.setTimeout(resolve, 4500);
            }),
          ]);
        } catch (_e) {
          try {
            if (typeof modal.dismiss === "function") modal.dismiss();
          } catch (_d) { /* ignore */ }
        }
      }

      function clearStoredVerificationRequest() {
        try {
          localStorage.removeItem(LS_VERIFICATION_REQUEST);
          const api = window.BBBrandVerification;
          if (api && api.LS_CURRENT_REQUEST) {
            localStorage.removeItem(api.LS_CURRENT_REQUEST);
          }
        } catch (_e) { /* ignore */ }
      }

      /** Fresh upload screen — previews may stay, identity UI waits for Sync. */
      function resetIdentityUiForNewUpload() {
        clearStoredVerificationRequest();
        if (verifyTitle) {
          verifyTitle.classList.remove("bb-lu-card-title--failed");
          verifyTitle.textContent = TITLE_DEFAULT;
        }
        setIdentityStatusMessage("", "");
        setVerifiedBoth("false");
        setMetaCtaEnabled(false);
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
        const onLoad = function () {
          syncPreviewMask(imgEl);
          imgEl.removeEventListener("load", onLoad);
        };
        imgEl.addEventListener("load", onLoad);
        imgEl.src = dataUrl || imgEl.getAttribute("data-default-src") || imgEl.src;
        if (imgEl.complete) onLoad();
        if (opts.markVerified === true || opts.markVerified === "true") {
          setVerified(mode, "true");
        } else if (opts.markVerified === "failed") {
          setVerified(mode, "failed");
        } else {
          setVerified(mode, false);
        }
      }

      function resetPreviewToDefaults() {
        if (previewLight) {
          const defL = previewLight.getAttribute("data-default-src");
          if (defL) previewLight.src = defL;
          syncPreviewMask(previewLight);
          setVerified("light", false);
        }
        if (previewDark) {
          const defD = previewDark.getAttribute("data-default-src");
          if (defD) previewDark.src = defD;
          syncPreviewMask(previewDark);
          setVerified("dark", false);
        }
      }

      resetPreviewToDefaults();

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
          resetIdentityUiForNewUpload();
          setPreview(mode, dataUrl, { markVerified: false });
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
          resetIdentityUiForNewUpload();
          setPreview("dark", dataUrl, { markVerified: false });
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
          resetIdentityUiForNewUpload();
          setPreview(mode, dataUrl, { markVerified: false });
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

      resetIdentityUiForNewUpload();

      // ---- Sync → Laravel brand verification (Stage 1 AI) → Meta Verification
      // Premium: Meta-Verification.html | Freemium: Freemium-Meta-Verification.html
      const continueBtn = document.getElementById("bbLuContinue");

      function loginUrlFromModules() {
        if (window.BB_APP && window.BB_APP.routes && window.BB_APP.routes.loginFromModules) {
          return window.BB_APP.routes.loginFromModules;
        }
        return "../../index.html";
      }

      async function runBrandVerificationSync() {
        const api = window.BBBrandVerification;
        if (!api) {
          alert("Verification is unavailable. Please refresh and try again.");
          return;
        }

        if (!localStorage.getItem("auth_token")) {
          window.location.href = loginUrlFromModules();
          return;
        }

        const nameEl = document.getElementById("bbLuBrandName");
        const urlEl = document.getElementById("bbLuBrandUrl");
        const brandName = nameEl && nameEl.value ? nameEl.value.trim() : "";
        let websiteUrl = urlEl && urlEl.value ? urlEl.value.trim() : "";

        if (!brandName) {
          alert("Please enter your brand name.");
          return;
        }
        if (!websiteUrl) {
          alert("Please enter your brand website URL.");
          return;
        }
        if (!/^https?:\/\//i.test(websiteUrl)) {
          websiteUrl = "https://" + websiteUrl;
          if (urlEl) urlEl.value = websiteUrl;
          try { localStorage.setItem(LS_URL, websiteUrl); } catch (_e) {}
        }

        let lightSvg = "";
        let darkSvg = "";
        try {
          lightSvg = api.dataUrlToSvgString(localStorage.getItem(LS_LIGHT_LOGO));
          darkSvg = api.dataUrlToSvgString(localStorage.getItem(LS_DARK_LOGO));
        } catch (_e) { /* ignore */ }

        if (!lightSvg || lightSvg.toLowerCase().indexOf("<svg") < 0) {
          alert("Please upload and crop your light mode logo.");
          return;
        }
        if (!darkSvg || darkSvg.toLowerCase().indexOf("<svg") < 0) {
          alert("Please upload and crop your dark mode logo.");
          return;
        }

        const isFree = /\/freemium\//i.test(window.location.pathname);
        const nextUrl = isFree
          ? "./Freemium-Meta-Verification.html"
          : "./Meta-Verification.html";

        const prevLabel = continueBtn.textContent;
        continueBtn.disabled = true;

        const progressModal =
          typeof window.bbOpenSyncProgressModal === "function"
            ? window.bbOpenSyncProgressModal({
                label: "Submitting for verification..",
                progress: 8,
                barColor: "#635bff",
                logoSrc: "../brandbased-logo.svg",
                shineLabel: true,
              })
            : null;

        try {
          if (progressModal) {
            progressModal.update({
              label: "Submitting for verification..",
              progress: 12,
            });
          }

          const brandRequest = await api.submitBrandVerificationRequest({
            brandName: brandName,
            websiteUrl: websiteUrl,
            lightLogoSvg: lightSvg,
            darkLogoSvg: darkSvg,
          });

          if (progressModal) {
            progressModal.update({
              label: "AI verification in progress..",
              progress: Math.max(15, Number(brandRequest.identity_progress || 0)),
            });
          }

          const finalRequest = await api.pollBrandVerificationUntilTerminal(
            brandRequest.id,
            {
              pollIntervalMs: 2500,
              maxMs: 300000,
              onUpdate: function (br) {
                try {
                  localStorage.setItem(
                    api.LS_CURRENT_REQUEST,
                    JSON.stringify(br)
                  );
                } catch (_save) { /* ignore */ }
                if (!progressModal) return;
                progressModal.update({
                  label: api.identityStatusLabel(br.identity_status),
                  progress: Number(br.identity_progress || 0),
                });
              },
            }
          );

          try {
            localStorage.setItem(
              api.LS_CURRENT_REQUEST,
              JSON.stringify(finalRequest)
            );
          } catch (_saveFin) { /* ignore */ }

          applyIdentityOutcome(finalRequest);

          if (api.isIdentityRejected(finalRequest.identity_status)) {
            await finishProgressModal(progressModal, {
              label: "Unable to verify this brand association.",
              doneLabel: "Unable to Verify",
              barColor: "#e5484d",
              doneHoldMs: 1600,
            });
            return;
          }

          if (finalRequest.identity_status === "under_review") {
            await finishProgressModal(progressModal, {
              label: "Verification requires manual review.",
              doneLabel: "Under Review",
              doneHoldMs: 1400,
            });
            return;
          }

          if (api.canProceedToMetaVerification(finalRequest.identity_status)) {
            await finishProgressModal(progressModal, {
              label: "Identity verified",
              doneLabel: "Verified",
              barColor: "#635bff",
              doneHoldMs: 1100,
            });
            window.location.href = nextUrl;
          }
        } catch (err) {
          console.error(err);
          await finishProgressModal(progressModal, {
            label: err.message || "Verification failed",
            doneLabel: "Error",
            barColor: "#e5484d",
            doneHoldMs: 1200,
          });
          alert(err.message || "Verification failed. Please try again.");
        } finally {
          continueBtn.disabled = false;
          continueBtn.textContent = prevLabel;
        }
      }

      if (continueBtn) {
        continueBtn.addEventListener("click", function () {
          runBrandVerificationSync();
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
