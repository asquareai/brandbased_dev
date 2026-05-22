/**
 * Meta Verification — Stage 2: website meta tag + runtime script.
 */
(function () {
  if (window.bbMetaVerificationInit) return;
  window.bbMetaVerificationInit = true;

  window.addEventListener("error", function () { /* keep chrome up */ });
  window.addEventListener("unhandledrejection", function () { /* keep chrome up */ });

  const LS_LIGHT_LOGO = "bbLuLightLogoData";
  const LS_DARK_LOGO = "bbLuDarkLogoData";
  const LS_DEV_VERIFY_STATE = "bbDevVerifyState";

  const TITLE_DEFAULT = "Verified Brand Identity";
  const TITLE_FAILED_HTML =
    "Unable to Verify Brand." +
    '<span class="bb-lu-card-title-sub">Please contact ' +
    '<a href="mailto:support@brandbased.ai">support@brandbased.ai</a>' +
    "</span>";

  function loginUrl() {
    if (window.BB_APP && window.BB_APP.routes && window.BB_APP.routes.loginFromModules) {
      return window.BB_APP.routes.loginFromModules;
    }
    return "../../index.html";
  }

  function logoUploadUrl() {
    return /\/freemium\//i.test(window.location.pathname)
      ? "../freemium/Freemium-Logo-upload-and-Crop-module.html"
      : "./Logo-upload-and-Crop-module.html";
  }

  function isDevFailForced() {
    try {
      return localStorage.getItem(LS_DEV_VERIFY_STATE) === "fail";
    } catch (_e) {
      return false;
    }
  }

  /** @param {"true"|"failed"|"false"} state */
  function applyPreviewState(state) {
    const figures = document.querySelectorAll(".bb-lu-preview");
    figures.forEach(function (fig) {
      fig.setAttribute("data-verified", state);
    });
  }

  function setRightCardTitle(verified, failed) {
    const title = document.getElementById("bbMvRightTitle");
    if (!title) return;

    if (failed) {
      title.classList.add("bb-lu-card-title--failed");
      title.innerHTML = TITLE_FAILED_HTML;
      return;
    }

    title.classList.remove("bb-lu-card-title--failed");
    title.textContent = verified ? TITLE_DEFAULT : "Brand Identity";
  }

  function setContinueEnabled(enabled) {
    const btn = document.getElementById("bbMvContinueBtn");
    if (!btn) return;
    if (enabled) {
      btn.removeAttribute("aria-disabled");
      btn.classList.remove("bb-mv-cta-btn--disabled");
      btn.style.pointerEvents = "";
    } else {
      btn.setAttribute("aria-disabled", "true");
      btn.classList.add("bb-mv-cta-btn--disabled");
      btn.style.pointerEvents = "none";
    }
  }

  function setMetaStatusMessage(text, tone) {
    let el = document.getElementById("bbMvMetaStatus");
    if (!text) {
      if (el) el.hidden = true;
      return;
    }
    if (!el) {
      const syncBtn = document.getElementById("bbMvSyncBtn");
      el = document.createElement("p");
      el.id = "bbMvMetaStatus";
      el.className = "bb-mv-instructions";
      if (syncBtn && syncBtn.parentNode) {
        syncBtn.parentNode.insertBefore(el, syncBtn);
      }
    }
    el.hidden = false;
    el.textContent = text;
    el.className = "bb-mv-instructions";
    if (tone) el.classList.add("bb-mv-meta-status--" + tone);
  }

  function renderSnippet(api, brandRequest, serverSnippet) {
    const snippetEl = document.getElementById("bbMvCodeSnippet");
    const idEl = document.getElementById("bbMvBrandId");
    if (!snippetEl) return;

    if (serverSnippet) {
      snippetEl.textContent = serverSnippet;
    } else if (brandRequest && brandRequest.brand_unique_id && api) {
      snippetEl.textContent = api.buildMetaVerificationSnippet(
        brandRequest.brand_unique_id
      );
    } else {
      snippetEl.textContent =
        "Your brand ID is loading… If this does not update, go back to Upload Brand Assets and run Sync again.";
      if (idEl) idEl.textContent = "";
      return;
    }

    if (idEl && brandRequest && brandRequest.brand_unique_id) {
      idEl.textContent = "Brand ID: " + brandRequest.brand_unique_id;
    }
  }

  async function loadSnippetFromServer(api, brandRequest) {
    if (!brandRequest || !brandRequest.id || !api.fetchMetaSnippet) {
      renderSnippet(api, brandRequest);
      return brandRequest;
    }

    try {
      const payload = await api.fetchMetaSnippet(brandRequest.id);
      if (payload.brand_unique_id) {
        brandRequest.brand_unique_id = payload.brand_unique_id;
        api.saveCurrentBrandRequest(brandRequest);
      }
      renderSnippet(api, brandRequest, payload.snippet || null);
    } catch (err) {
      console.warn("meta-snippet fetch failed, using cached data", err);
      if (!brandRequest.brand_unique_id && api.hydrateCurrentBrandRequest) {
        brandRequest = await api.hydrateCurrentBrandRequest();
      }
      renderSnippet(api, brandRequest);
    }

    return brandRequest;
  }

  function syncPreviewMask(imgEl) {
    if (!imgEl) return;
    const panel = imgEl.closest(".bb-lu-preview");
    if (!panel) return;
    const src = imgEl.currentSrc || imgEl.src;
    if (src) panel.style.setProperty("--bb-lu-bicon-src", 'url("' + src + '")');
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

  function showVerifyPopup(verified) {
    if (typeof window.bbShowSyncPopup !== "function") {
      return Promise.resolve();
    }
    const result = window.bbShowSyncPopup({
      label: "Verifying…",
      doneLabel: verified ? "Verified" : "Not verified",
      barColor: "#635bff",
      logoSrc: "../brandbased-logo.svg",
      duration: 2800,
      doneHoldMs: 1400,
      shineLabel: true,
    });
    if (result && typeof result.then === "function") {
      return result;
    }
    return Promise.resolve();
  }

  /** Right card = identity only (Stage 1). Never downgraded when website meta fails. */
  function applyIdentityPreviewState(brandRequest) {
    if (!brandRequest) {
      applyPreviewState("false");
      setRightCardTitle(false, false);
      return;
    }

    const identityVerified = brandRequest.identity_status === "verified";
    const identityFailed =
      brandRequest.identity_status === "rejected" ||
      brandRequest.identity_status === "flagged";

    if (identityFailed) {
      applyPreviewState("failed");
      setRightCardTitle(false, true);
      return;
    }

    if (identityVerified) {
      applyPreviewState("true");
      setRightCardTitle(true, false);
      return;
    }

    if (brandRequest.identity_status === "under_review") {
      applyPreviewState("false");
      setRightCardTitle(false, false);
      return;
    }

    applyPreviewState("false");
    setRightCardTitle(false, false);
  }

  /** Left card = website meta status (Stage 2) only. */
  function applyWebsiteMetaStatus(brandRequest, devFail) {
    const api = window.BBBrandVerification;

    if (devFail) {
      setContinueEnabled(false);
      setMetaStatusMessage(
        "Dev preview: website verification not verified.",
        "failed"
      );
      return;
    }

    if (!brandRequest || !api) {
      setContinueEnabled(false);
      setMetaStatusMessage("", "");
      return;
    }

    const identityVerified = brandRequest.identity_status === "verified";
    const metaVerified = api.isMetaVerified(brandRequest.meta_status);
    const metaFailed = brandRequest.meta_status === "failed";
    const identityFailed =
      brandRequest.identity_status === "rejected" ||
      brandRequest.identity_status === "flagged";

    if (identityFailed) {
      setContinueEnabled(false);
      setMetaStatusMessage(
        "Unable to verify this brand association. Complete logo upload verification first.",
        "failed"
      );
      return;
    }

    if (brandRequest.identity_status === "under_review") {
      setContinueEnabled(false);
      setMetaStatusMessage(
        "Identity verification is under manual review.",
        "review"
      );
      return;
    }

    /* Website failed — message on left only; identity previews stay verified */
    if (metaFailed) {
      setContinueEnabled(false);
      setMetaStatusMessage(
        brandRequest.meta_verification_notes ||
          "Website verification failed. Add the meta tag and runtime script to your site <head>, publish, then tap Verify again.",
        "failed"
      );
      return;
    }

    if (metaVerified) {
      setContinueEnabled(true);
      setMetaStatusMessage(
        "Website verified. Continue to Brand Settings.",
        "success"
      );
      return;
    }

    if (identityVerified) {
      setContinueEnabled(false);
      setMetaStatusMessage(
        "Paste the meta tag and script into your site <head>, publish, then tap Verify.",
        "success"
      );
      return;
    }

    setContinueEnabled(false);
    setMetaStatusMessage(
      "Complete logo identity verification before verifying your website.",
      ""
    );
  }

  function applyMetaOutcome(brandRequest, devFail) {
    applyIdentityPreviewState(brandRequest);
    applyWebsiteMetaStatus(brandRequest, devFail);
  }

  async function runMetaVerification(api, brandRequest) {
    const syncBtn = document.getElementById("bbMvSyncBtn");
    if (syncBtn) syncBtn.disabled = true;

    try {
      const result = await api.verifyBrandMeta(brandRequest.id);
      const verified = !!(result && result.verified) && !isDevFailForced();

      await showVerifyPopup(verified);

      if (isDevFailForced()) {
        applyMetaOutcome(brandRequest, true);
        return;
      }

      applyMetaOutcome(result.brand_request, false);
      if (result.brand) {
        try {
          localStorage.setItem("bbSelectedBrand", JSON.stringify(result.brand));
        } catch (_save) { /* ignore */ }
      }
    } catch (err) {
      console.error(err);
      await showVerifyPopup(false);
      const current = api.loadCurrentBrandRequest() || brandRequest;
      applyIdentityPreviewState(current);
      setContinueEnabled(false);
      setMetaStatusMessage(
        err.message || "Website verification failed. Please try again.",
        "failed"
      );
    } finally {
      if (syncBtn) syncBtn.disabled = false;
    }
  }

  async function init() {
    try {
      const api = window.BBBrandVerification;
      if (!api) {
        setMetaStatusMessage(
          "Verification scripts failed to load. Hard-refresh this page (Ctrl+F5).",
          "failed"
        );
        return;
      }

      if (!localStorage.getItem("auth_token")) {
        window.location.href = loginUrl();
        return;
      }

      let brandRequest = api.loadCurrentBrandRequest();
      if (!brandRequest || !brandRequest.id) {
        window.location.href = logoUploadUrl();
        return;
      }

      if (api.hydrateCurrentBrandRequest) {
        try {
          brandRequest = await api.hydrateCurrentBrandRequest();
        } catch (_hydrate) { /* use cached */ }
      }

      brandRequest = await loadSnippetFromServer(api, brandRequest);
      applyMetaOutcome(brandRequest, isDevFailForced());

      const previewLight = document.getElementById("bbMvPreviewLight");
      const previewDark = document.getElementById("bbMvPreviewDark");
      try {
        const lightSaved = localStorage.getItem(LS_LIGHT_LOGO);
        const darkSaved = localStorage.getItem(LS_DARK_LOGO);
        if (lightSaved) setPreview(previewLight, lightSaved);
        else if (previewLight) syncPreviewMask(previewLight);
        if (darkSaved) setPreview(previewDark, darkSaved);
        else if (previewDark) syncPreviewMask(previewDark);
      } catch (_e) {
        if (previewLight) syncPreviewMask(previewLight);
        if (previewDark) syncPreviewMask(previewDark);
      }

      window.addEventListener("storage", function (e) {
        if (e && e.key && e.key !== LS_DEV_VERIFY_STATE) return;
        applyMetaOutcome(api.loadCurrentBrandRequest(), isDevFailForced());
      });

      const syncBtn = document.getElementById("bbMvSyncBtn");
      if (syncBtn) {
        syncBtn.addEventListener("click", function () {
          brandRequest = api.loadCurrentBrandRequest();
          if (!brandRequest || !brandRequest.id) {
            window.location.href = logoUploadUrl();
            return;
          }
          if (!api.canProceedToMetaVerification(brandRequest.identity_status)) {
            applyMetaOutcome(brandRequest, false);
            setMetaStatusMessage(
              "Complete identity verification on the logo upload step first.",
              "failed"
            );
            return;
          }
          runMetaVerification(api, brandRequest);
        });
      }

      const copyBtn = document.getElementById("bbMvCopyBtn");
      const snippetEl = document.getElementById("bbMvCodeSnippet");
      const toastEl = document.getElementById("bbMvCopyToast");
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
          } catch (_e) { /* ignore */ }
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
          } catch (_e) { /* ignore */ }
          if (!triedAsync) legacyCopy();
          flashToast();
          copyBtn.classList.add("bb-mv-code-copy--bump");
          window.setTimeout(function () {
            copyBtn.classList.remove("bb-mv-code-copy--bump");
          }, 280);
        });
      }
    } catch (_e) {
      /* static HTML still renders */
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
