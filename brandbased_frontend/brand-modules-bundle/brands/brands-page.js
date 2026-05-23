/**
 * Brands page — light JS.
 *
 * One-shot init only. No recurring timers, no animation loops in JS.
 *  - Sync button triggers the shared sync popup.
 *  - Add brand button bounces the dashed circle for instant feedback
 *    and then opens the same small glass popover used for Publish /
 *    Unpublish (fixed position, no full-screen blur) with "Freemium"
 *    and "Premium" — mirroring
 *    the Start FREE / Go Premium CTAs on the Start Now page.
 *      • Freemium → ../freemium/Freemium-Logo-upload-and-Crop-module.html
 *      • Premium  → ../logo-upload/Logo-upload-and-Crop-module.html
 *        …unless the dev "Freemium dashboard simulation" toggle is on
 *        (localStorage["bbDevDashSimulateFreemium"] === "1"), in which
 *        case we postMessage("bb-dev-show-upgrade") to the parent
 *        dashboard so it pops the Unlock-Premium gate in-place instead
 *        of letting the freemium user into the premium onboarding flow.
 *  - Each brand card has a small "Publish/Unpublish" affordance under
 *    the URL pill that opens a glass popover with Publish, Unpublish,
 *    and Delete Brand actions. Publish + Unpublish reuse the shared
 *    sync popup so they flow naturally from "Publishing" -> "Published"
 *    and "Unpublishing..." -> "Unpublished".
 */
(function () {
  if (window.bbBrandsInit) return;
  window.bbBrandsInit = true;

  // Swallow any stray runtime error so the page chrome stays up.
  window.addEventListener("error", function () { /* noop */ });
  window.addEventListener("unhandledrejection", function () { /* noop */ });

  /* Single, page-level popover element reused for every card. Avoids
     overflow clipping issues from the card's `display: flex` column. */
  let popover = null;
  let activeTrigger = null;

  /* Second popover — Freemium / Premium tier choice on "Add brand".
     Same visual language as `.bb-brands-action-popover` (no backdrop). */
  let tierPopover = null;
  let tierTrigger = null;

  const LS_CURRENT_REQUEST = "bbCurrentBrandVerificationRequest";
  const LS_SELECTED_BRAND = "bbSelectedBrand";
  const BRAND_OPEN_TARGET = "../Brand-Settings-Module.html";
  const START_NOW_URL = "../start-now/Start-Now.html";
  const DASHBOARD_START_ROUTE = "start";

  let brandLoadingModal = null;
  let brandLoadingProgressTimer = 0;

  function planPillHtml(brand) {
    const tier =
      brand && brand.created_under_plan === "premium" ? "premium" : "freemium";
    const label = tier === "premium" ? "Premium" : "Freemium";
    const aria = tier === "premium" ? "Premium plan" : "Freemium plan";
    let star =
      '<svg class="bb-brands-plan-pill__star" viewBox="0 0 122.88 116.864" aria-hidden="true" focusable="false">' +
      '<polygon fill="#ffffff" fill-rule="evenodd" clip-rule="evenodd" points="61.44,0 78.351,41.326 122.88,44.638 88.803,73.491 99.412,116.864 61.44,93.371 23.468,116.864 34.078,73.491 0,44.638 44.529,41.326 61.44,0" />' +
      "</svg>";
    if (tier !== "premium") {
      star =
        '<span class="bb-brands-plan-pill__dot" aria-hidden="true"></span>';
    }
    return (
      '<span class="bb-brands-plan-pill bb-brands-plan-pill--' +
      tier +
      '" aria-label="' +
      aria +
      '">' +
      star +
      '<span class="bb-brands-plan-pill__label">' +
      label +
      "</span></span>"
    );
  }

  const PUBLISH_TRIGGER_SVG =
    '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">' +
    '<path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />' +
    "</svg>";

  const LS_SELECTED_TIER = "bbBrandsSelectedTier";

  const TIER_MENU_TICK_SVG =
    '<svg class="bb-brands-tier-item__tick" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">' +
    '<path d="M3.5 8.2 6.4 11 12.5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />' +
    "</svg>";

  function readSelectedBrandTier() {
    try {
      const stored = sessionStorage.getItem(LS_SELECTED_TIER);
      if (stored === "premium" || stored === "freemium") return stored;
    } catch (_e) { /* ignore */ }
    return "freemium";
  }

  function writeSelectedBrandTier(tier) {
    try {
      sessionStorage.setItem(LS_SELECTED_TIER, tier);
    } catch (_e) { /* ignore */ }
  }

  function tierMenuItem(label, tier) {
    return (
      '<button type="button" class="bb-brands-tier-item" data-tier="' +
      tier +
      '" role="menuitemradio" aria-checked="false">' +
      '<span class="bb-brands-tier-item__tick-slot" aria-hidden="true">' +
      TIER_MENU_TICK_SVG +
      "</span>" +
      '<span class="bb-brands-tier-item__label">' +
      escapeHtml(label) +
      "</span>" +
      "</button>"
    );
  }

  function updateTierPopoverSelection(popEl, selectedTier) {
    if (!popEl) return;
    popEl.querySelectorAll(".bb-brands-tier-item").forEach(function (btn) {
      const tier = btn.getAttribute("data-tier");
      const isSelected = tier === selectedTier;
      btn.classList.toggle("bb-brands-tier-item--selected", isSelected);
      btn.setAttribute("aria-checked", isSelected ? "true" : "false");
    });
  }

  function loginUrl() {
    if (window.BB_APP && window.BB_APP.routes && window.BB_APP.routes.loginFromModules) {
      return window.BB_APP.routes.loginFromModules;
    }
    return "../../index.html";
  }

  function getBrandFromTrigger(trigger) {
    const card = trigger && trigger.closest ? trigger.closest(".bb-brands-card") : null;
    return card && card.__bbBrand ? card.__bbBrand : null;
  }

  function getBrandName(triggerOrBrand) {
    if (triggerOrBrand && triggerOrBrand.brand_name) {
      return String(triggerOrBrand.brand_name).trim();
    }
    const card =
      triggerOrBrand && triggerOrBrand.closest
        ? triggerOrBrand.closest(".bb-brands-card")
        : null;
    if (!card) return "Brand";
    if (card.__bbBrand && card.__bbBrand.brand_name) {
      return String(card.__bbBrand.brand_name).trim();
    }
    const nameEl = card.querySelector(".bb-brands-name");
    return nameEl && nameEl.textContent ? nameEl.textContent.trim() : "Brand";
  }

  function clearStoredBrandIfDeleted(brand) {
    if (!brand) return;
    try {
      const raw = localStorage.getItem(LS_CURRENT_REQUEST);
      if (!raw) return;
      const stored = JSON.parse(raw);
      const matchesRequest =
        stored.id && brand.brand_verification_request_id &&
        stored.id === brand.brand_verification_request_id;
      const matchesUnique =
        stored.brand_unique_id && brand.brand_unique_id &&
        stored.brand_unique_id === brand.brand_unique_id;
      if (matchesRequest || matchesUnique) {
        localStorage.removeItem(LS_CURRENT_REQUEST);
      }
    } catch (_e) { /* ignore */ }
  }

  function showActionPopup(opts) {
    if (typeof window.bbShowSyncPopup !== "function") {
      return Promise.resolve();
    }
    const result = window.bbShowSyncPopup(opts);
    if (result && typeof result.then === "function") {
      return result;
    }
    return Promise.resolve();
  }

  function brandInitial(name) {
    const text = String(name || "").trim();
    return text ? text.charAt(0).toUpperCase() : "B";
  }

  function persistBrandContext(brand) {
    if (!brand) return;
    const payload = {
      id: brand.brand_verification_request_id || null,
      brand_unique_id: brand.brand_unique_id,
      brand_name: brand.brand_name,
      website_url: brand.website_url,
      logo_light_url: brand.logo_light_url,
      logo_dark_url: brand.logo_dark_url,
      identity_status: "verified",
      meta_status: "verified",
      final_status: "verified",
    };
    try {
      localStorage.setItem(LS_SELECTED_BRAND, JSON.stringify(brand));
      if (payload.id) {
        localStorage.setItem(LS_CURRENT_REQUEST, JSON.stringify(payload));
      }
      if (brand.brand_name) {
        localStorage.setItem("bbLuBrandName", brand.brand_name);
      }
      if (brand.website_url) {
        localStorage.setItem("bbLuBrandUrl", brand.website_url);
      }
    } catch (_e) { /* ignore */ }
  }

  function createBrandCard(brand) {
    const li = document.createElement("li");
    const isPublished =
      brand.is_published === true || brand.is_published === 1;
    li.className =
      "bb-brands-card" + (isPublished ? "" : " bb-brands-card--unpublished");
    const logoUrl = brand.logo_light_url || brand.logo_dark_url || "";
    const brandName = escapeHtml(brand.brand_name || "Brand");
    const websiteUrl = brand.website_url || "#";
    const websiteLabel = escapeHtml(brand.website_url || "");
    const initial = escapeHtml(brandInitial(brand.brand_name));
    const safeLogo = escapeAttr(logoUrl);

    li.innerHTML =
      '<div class="bb-brands-circle-wrap">' +
      '<div class="bb-brands-circle">' +
      (logoUrl
        ? '<img class="bb-brands-logo" src="' +
          safeLogo +
          '" alt="" decoding="async" onerror="this.style.display=\'none\'; this.nextElementSibling.style.display=\'inline-flex\';" />'
        : "") +
      '<span class="bb-brands-fallback" aria-hidden="true"' +
      (logoUrl ? ' style="display: none;"' : ' style="display: inline-flex;"') +
      ">" +
      initial +
      "</span>" +
      "</div>" +
      planPillHtml(brand) +
      '<img class="bb-brands-badge bb-brands-badge--unverified" src="./not-verified.svg" alt="" aria-label="Brand not verified" decoding="async" />' +
      "</div>" +
      '<p class="bb-brands-name">' +
      brandName +
      "</p>" +
      '<a class="bb-brands-url" href="' +
      escapeAttr(websiteUrl) +
      '" target="_blank" rel="noopener">' +
      websiteLabel +
      "</a>" +
      '<div class="bb-brands-publish-menu">' +
      '<button type="button" class="bb-brands-publish-trigger" aria-haspopup="menu" aria-expanded="false" aria-label="Brand actions for ' +
      brandName +
      '">' +
      PUBLISH_TRIGGER_SVG +
      "</button></div>";

    li.__bbBrand = brand;
    return li;
  }

  function clearDynamicBrandCards(grid) {
    grid.querySelectorAll(
      ".bb-brands-card:not(.bb-brands-card--add):not(.bb-brands-card--placeholder)"
    ).forEach(function (node) {
      node.remove();
    });
  }

  function setBrandsStatus(mode, message) {
    const loadingEl = document.getElementById("bbBrandsLoading");
    const emptyEl = document.getElementById("bbBrandsEmpty");
    const showLoading = mode === "loading";
    const showEmpty = mode === "empty" || mode === "error";

    if (loadingEl) loadingEl.hidden = !showLoading;
    if (emptyEl) {
      emptyEl.hidden = !showEmpty;
      const msg = emptyEl.querySelector(".bb-brands-name");
      if (msg) {
        if (message) {
          msg.textContent = message;
        } else if (mode === "empty") {
          msg.textContent =
            "No verified brands yet. Tap Add brand to start.";
        }
      }
    }
  }

  function stopBrandLoadingProgress() {
    if (brandLoadingProgressTimer) {
      window.clearInterval(brandLoadingProgressTimer);
      brandLoadingProgressTimer = 0;
    }
  }

  function startBrandLoadingProgress() {
    stopBrandLoadingProgress();
    if (!brandLoadingModal || typeof brandLoadingModal.update !== "function") return;
    let progress = 10;
    brandLoadingModal.update({ progress: progress });
    brandLoadingProgressTimer = window.setInterval(function () {
      if (!brandLoadingModal) {
        stopBrandLoadingProgress();
        return;
      }
      progress = Math.min(88, progress + 5);
      brandLoadingModal.update({ progress: progress });
    }, 420);
  }

  function openBrandLoadingModal() {
    stopBrandLoadingProgress();
    if (brandLoadingModal && typeof brandLoadingModal.dismiss === "function") {
      brandLoadingModal.dismiss();
      brandLoadingModal = null;
    }
    setBrandsMountVisible(false);
    hideBrandsGate();
    if (typeof window.bbOpenSyncProgressModal !== "function") return null;
    brandLoadingModal = window.bbOpenSyncProgressModal({
      label: "Loading brands…",
      barColor: "#635bff",
      logoSrc: "../brandbased-logo.svg",
      progress: 10,
      shineLabel: true,
    });
    startBrandLoadingProgress();
    return brandLoadingModal;
  }

  async function closeBrandLoadingModal() {
    stopBrandLoadingProgress();
    const modal = brandLoadingModal;
    brandLoadingModal = null;
    if (!modal) return;
    if (typeof modal.dismiss === "function") await modal.dismiss();
  }

  function setBrandsMountVisible(visible) {
    const mount = document.getElementById("bbBrandsMount");
    if (mount) mount.hidden = !visible;
  }

  function hideBrandsGate() {
    const gate = document.getElementById("bbBrandsBrandGate");
    if (gate) gate.hidden = true;
  }

  function startNowDashboardUrl() {
    try {
      const consolePath =
        (window.BB_APP && window.BB_APP.routes && window.BB_APP.routes.console) ||
        "../../brand-console-final/brand-console-dashboard.html";
      const u = new URL(consolePath, window.location.href);
      u.searchParams.set("page", DASHBOARD_START_ROUTE);
      return u.toString();
    } catch (_e) {
      return "../../brand-console-final/brand-console-dashboard.html?page=start";
    }
  }

  function navigateToStartNow() {
    if (window.self !== window.top) {
      try {
        window.parent.postMessage(
          { type: "bb-dash-goto-route", route: DASHBOARD_START_ROUTE },
          "*"
        );
        return;
      } catch (_e) { /* ignore */ }
      try {
        window.top.location.assign(startNowDashboardUrl());
        return;
      } catch (_e2) { /* ignore */ }
    }
    window.location.href = START_NOW_URL;
  }

  function showBrandsGate(message) {
    setBrandsMountVisible(false);
    const gate = document.getElementById("bbBrandsBrandGate");
    const msg = document.getElementById("bbBrandsBrandGateMsg");
    const btn = document.getElementById("bbBrandsBrandGateOk");
    if (msg) msg.textContent = message;
    if (gate) gate.hidden = false;
    if (btn && btn.getAttribute("data-bb-gate-bound") !== "1") {
      btn.setAttribute("data-bb-gate-bound", "1");
      btn.addEventListener("click", navigateToStartNow);
    }
  }

  async function loadAndRenderBrands() {
    const grid = document.getElementById("bbBrandsGrid");
    if (!grid) return { hasBrands: false };

    const addCard = grid.querySelector(".bb-brands-card--add");
    const api = window.BBBrandVerification;

    if (!localStorage.getItem("auth_token")) {
      window.location.href = loginUrl();
      return { hasBrands: false };
    }

    if (!api || !api.fetchBrands) {
      setBrandsStatus("error", "Unable to load brands. Please refresh.");
      setBrandsMountVisible(true);
      return { hasBrands: false, error: true };
    }

    setBrandsStatus("loading");

    try {
      const brands = await api.fetchBrands();
      clearDynamicBrandCards(grid);

      brands.forEach(function (brand) {
        const card = createBrandCard(brand);
        if (addCard) {
          grid.insertBefore(card, addCard);
        } else {
          grid.appendChild(card);
        }
      });

      if (brands.length > 0) {
        setBrandsStatus("idle");
        return { hasBrands: true };
      }
      setBrandsStatus("idle");
      return { hasBrands: false };
    } catch (err) {
      console.error(err);
      clearDynamicBrandCards(grid);
      setBrandsStatus("error", err.message || "Unable to load brands.");
      setBrandsMountVisible(true);
      return { hasBrands: false, error: true };
    }
  }

  function ensurePopover() {
    if (popover) return popover;
    popover = document.createElement("div");
    popover.className = "bb-brands-action-popover";
    popover.setAttribute("role", "menu");
    popover.innerHTML = [
      '<button type="button" class="bb-brands-action-item" data-action="publish" role="menuitem">Publish</button>',
      '<button type="button" class="bb-brands-action-item" data-action="unpublish" role="menuitem">Unpublish</button>',
      '<div class="bb-brands-action-divider" aria-hidden="true"></div>',
      '<button type="button" class="bb-brands-action-item bb-brands-action-item--delete" data-action="delete" role="menuitem">Delete Brand</button>',
    ].join("");
    document.body.appendChild(popover);

    popover.addEventListener("click", function (e) {
      const item = e.target.closest(".bb-brands-action-item");
      if (!item || !activeTrigger) return;
      const action = item.getAttribute("data-action");
      const brand = getBrandFromTrigger(activeTrigger);
      closePopover();
      runAction(action, brand);
    });
    return popover;
  }

  function positionFixedPopover(popEl, trigger) {
    if (!popEl || !trigger) return;
    const rect = trigger.getBoundingClientRect();
    requestAnimationFrame(function () {
      const pop = popEl.getBoundingClientRect();
      const gap = 8;
      let left = rect.left + rect.width / 2 - pop.width / 2;
      let top = rect.bottom + gap;
      const maxLeft = window.innerWidth - pop.width - 8;
      if (left < 8) left = 8;
      if (left > maxLeft) left = maxLeft;
      if (top + pop.height > window.innerHeight - 8) {
        top = rect.top - pop.height - gap;
      }
      popEl.style.left = left + "px";
      popEl.style.top = top + "px";
    });
  }

  function positionPopover(trigger) {
    positionFixedPopover(popover, trigger);
  }

  function openPopover(trigger) {
    closeTierPopover();
    ensurePopover();
    if (activeTrigger && activeTrigger !== trigger) {
      activeTrigger.setAttribute("aria-expanded", "false");
    }
    activeTrigger = trigger;
    trigger.setAttribute("aria-expanded", "true");

    popover.classList.add("bb-brands-action-popover--open");
    positionPopover(trigger);
  }

  function closePopover() {
    if (!popover) return;
    popover.classList.remove("bb-brands-action-popover--open");
    if (activeTrigger) {
      activeTrigger.setAttribute("aria-expanded", "false");
      activeTrigger = null;
    }
  }

  function ensureTierPopover() {
    if (tierPopover) return tierPopover;
    tierPopover = document.createElement("div");
    tierPopover.className = "bb-brands-action-popover bb-brands-tier-popover";
    tierPopover.setAttribute("role", "menu");
    tierPopover.setAttribute("aria-label", "Brand tier");
    tierPopover.innerHTML = [
      tierMenuItem("Freemium", "freemium"),
      tierMenuItem("Premium", "premium"),
    ].join("");
    document.body.appendChild(tierPopover);

    tierPopover.addEventListener("click", function (e) {
      const item = e.target.closest(".bb-brands-tier-item");
      if (!item || !tierTrigger) return;
      const tier = item.getAttribute("data-tier");
      writeSelectedBrandTier(tier);
      closeTierPopover();
      if (tier === "freemium") {
        if (window.BBAccountPlan) {
          BBAccountPlan.navigateStartFree({ fromModules: true });
        } else {
          window.location.href =
            "../freemium/Freemium-Logo-upload-and-Crop-module.html?fresh=1";
        }
        return;
      }
      if (tier === "premium") {
        if (devFreemiumSimOn() && requestParentUpgradeGate()) return;
        if (window.BBAccountPlan) {
          BBAccountPlan.navigateGoPremium({ fromModules: true });
        } else {
          window.location.href =
            "../logo-upload/Logo-upload-and-Crop-module.html?fresh=1";
        }
      }
    });
    return tierPopover;
  }

  function openTierPopover(trigger) {
    closePopover();
    ensureTierPopover();
    if (tierTrigger && tierTrigger !== trigger) {
      tierTrigger.setAttribute("aria-expanded", "false");
    }
    tierTrigger = trigger;
    trigger.setAttribute("aria-expanded", "true");

    updateTierPopoverSelection(tierPopover, readSelectedBrandTier());

    tierPopover.classList.add("bb-brands-action-popover--open");
    positionFixedPopover(tierPopover, trigger);
  }

  function closeTierPopover() {
    if (!tierPopover) return;
    tierPopover.classList.remove("bb-brands-action-popover--open");
    if (tierTrigger) {
      tierTrigger.setAttribute("aria-expanded", "false");
      tierTrigger = null;
    }
  }

  async function runAction(action, brand) {
    const api = window.BBBrandVerification;
    if (!brand || !brand.id) {
      alert("Brand not found. Please refresh the page.");
      return;
    }
    if (!api) {
      alert("Unable to update brand. Please refresh the page.");
      return;
    }

    const brandName = brand.brand_name || "Brand";

    if (action === "publish") {
      try {
        const popupPromise = showActionPopup({
          label: "Publishing",
          barColor: "#635bff",
          logoSrc: "../brandbased-logo.svg",
          shineLabel: true,
          duration: 2800,
          doneHoldMs: 1200,
        });
        await api.publishBrand(brand.id);
        await popupPromise;
        await loadAndRenderBrands();
        decorateBrandCardsForA11y();
      } catch (err) {
        console.error(err);
        alert(err.message || "Unable to publish brand.");
      }
      return;
    }

    if (action === "unpublish") {
      try {
        const popupPromise = showActionPopup({
          label: "Unpublishing...",
          barColor: "#635bff",
          logoSrc: "../brandbased-logo.svg",
          shineLabel: true,
          duration: 2800,
          doneHoldMs: 1200,
        });
        await api.unpublishBrand(brand.id);
        await popupPromise;
        await loadAndRenderBrands();
        decorateBrandCardsForA11y();
      } catch (err) {
        console.error(err);
        alert(err.message || "Unable to unpublish brand.");
      }
      return;
    }

    if (action === "delete") {
      const confirmed = await showDeleteConfirm(brandName);
      if (!confirmed) return;

      try {
        const popupPromise = showActionPopup({
          label: "Deleting",
          barColor: "#e74c3c",
          logoSrc: "../brandbased-logo.svg",
          shineLabel: true,
          duration: 2800,
          doneHoldMs: 1500,
        });
        await api.deleteBrand(brand.id);
        clearStoredBrandIfDeleted(brand);
        await popupPromise;
        await loadAndRenderBrands();
        decorateBrandCardsForA11y();
      } catch (err) {
        console.error(err);
        alert(err.message || "Unable to delete brand.");
      }
    }
  }

  /* Shared glass-dialog primitive — used only for the destructive
     Delete-Brand confirm (full-screen dim + blur backdrop).
     `opts` shape:
       { ariaLabel, bodyHtml, buttons: [{ value, label, kind, autoFocus }],
         defaultValue (returned on Esc / backdrop / Enter-outside-button),
         enterValue   (returned on Enter when focus isn't on a specific btn) }
     Resolves with the chosen `value`. */
  function showGlassDialog(opts) {
    return new Promise(function (resolve) {
      const ariaLabel = opts.ariaLabel || "Dialog";
      const bodyHtml  = opts.bodyHtml || "";
      const buttons   = Array.isArray(opts.buttons) ? opts.buttons : [];
      const defaultValue = "defaultValue" in opts ? opts.defaultValue : null;
      const enterValue   = "enterValue" in opts ? opts.enterValue : defaultValue;

      const backdrop = document.createElement("div");
      backdrop.className = "bb-brands-confirm-backdrop";
      backdrop.setAttribute("role", "dialog");
      backdrop.setAttribute("aria-modal", "true");
      backdrop.setAttribute("aria-label", ariaLabel);

      const btnHtml = buttons.map(function (b) {
        const kind = b.kind || "default";
        let extraClass = "";
        if (kind === "danger")  extraClass = " bb-brands-confirm-btn--danger";
        if (kind === "cancel")  extraClass = " bb-brands-confirm-btn--cancel";
        if (kind === "primary") extraClass = " bb-brands-confirm-btn--primary";
        return (
          '<button type="button" class="bb-brands-confirm-btn' + extraClass + '"' +
          ' data-confirm="' + escapeAttr(String(b.value)) + '">' +
          escapeHtml(String(b.label)) +
          '</button>'
        );
      }).join("");

      backdrop.innerHTML = [
        '<div class="bb-brands-confirm-dialog">',
        bodyHtml,
        '  <div class="bb-brands-confirm-actions">',
        btnHtml,
        '  </div>',
        '</div>',
      ].join("");
      document.body.appendChild(backdrop);

      requestAnimationFrame(function () {
        backdrop.classList.add("bb-brands-confirm-backdrop--open");
      });

      /* Focus the autoFocus button, falling back to the last button. */
      const focusSpec = buttons.find(function (b) { return b.autoFocus; }) || buttons[buttons.length - 1];
      if (focusSpec) {
        const focusEl = backdrop.querySelector(
          '[data-confirm="' + cssEscape(String(focusSpec.value)) + '"]'
        );
        if (focusEl) focusEl.focus();
      }

      function close(result) {
        backdrop.classList.remove("bb-brands-confirm-backdrop--open");
        window.setTimeout(function () {
          try { backdrop.remove(); } catch {}
          resolve(result);
        }, 220);
        document.removeEventListener("keydown", onKey);
      }

      function onKey(e) {
        if (e.key === "Escape") close(defaultValue);
        if (e.key === "Enter") {
          const t = e.target;
          if (t && t.closest && t.closest(".bb-brands-confirm-dialog")) return;
          close(enterValue);
        }
      }

      backdrop.addEventListener("click", function (e) {
        const btn = e.target.closest("[data-confirm]");
        if (btn) {
          close(btn.getAttribute("data-confirm"));
          return;
        }
        if (e.target === backdrop) close(defaultValue);
      });

      document.addEventListener("keydown", onKey);
    });
  }

  /* Destructive Delete-Brand confirm — returns Promise<boolean>.
     Prefers the dashboard-level confirm popup (bbShowConfirmPopup)
     so the backdrop blur covers chrome + iframe together, matching
     the Sync / Publish / Verify popups. Falls back to the local
     glass dialog when the page is opened standalone (no parent
     dashboard listening). */
  function showDeleteConfirm(brand) {
    if (typeof window.bbShowConfirmPopup === "function") {
      return window.bbShowConfirmPopup({
        title: "Delete " + brand + "?",
        body: "Deleting this brand will remove it from all BrandBased surfaces. Are you sure?",
        confirmLabel: "Yes, delete",
        cancelLabel:  "Cancel",
        danger: true,
      });
    }
    return showGlassDialog({
      ariaLabel: "Delete " + brand,
      bodyHtml: (
        '  <h2 class="bb-brands-confirm-title">Delete ' + escapeHtml(brand) + '?</h2>' +
        '  <p class="bb-brands-confirm-body">Deleting this brand will remove it from all BrandBased surfaces. Are you sure?</p>'
      ),
      buttons: [
        { value: "cancel", label: "Cancel",      kind: "cancel" },
        { value: "yes",    label: "Yes, delete", kind: "danger", autoFocus: true },
      ],
      defaultValue: "cancel",
      enterValue:   "yes",
    }).then(function (val) { return val === "yes"; });
  }

  /* Returns true if the dev "Freemium dashboard simulation" flag is
     currently set, which is the trigger for swapping the Premium add
     flow with the Unlock-Premium gate. Same key the dashboard's
     bb-dev-freemium-gate.js reads. */
  function devFreemiumSimOn() {
    try {
      return localStorage.getItem("bbDevDashSimulateFreemium") === "1";
    } catch (_e) {
      return false;
    }
  }

  /* Ask the parent dashboard to force-show the Unlock-Premium gate
     (the same one used when a freemium user tries to load a premium
     route). Safe to call when not embedded — it's a no-op. */
  function requestParentUpgradeGate() {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "bb-dev-show-upgrade" }, "*");
        return true;
      }
    } catch (_e) { /* fall through */ }
    return false;
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  /* Minimal CSS.escape polyfill — only the characters we actually
     emit into data-confirm attributes ("freemium", "premium",
     "cancel", "yes"), but keep it safe for arbitrary values. */
  function cssEscape(value) {
    if (typeof window.CSS !== "undefined" && typeof window.CSS.escape === "function") {
      return window.CSS.escape(value);
    }
    return String(value).replace(/[^a-zA-Z0-9_-]/g, function (ch) {
      return "\\" + ch;
    });
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[ch];
    });
  }

  function isInteractiveCardTarget(el) {
    if (!el || !el.closest) return false;
    return !!(
      el.closest(".bb-brands-url") ||
      el.closest(".bb-brands-publish-menu") ||
      el.closest(".bb-brands-publish-trigger") ||
      el.closest(".bb-brands-action-popover") ||
      el.closest(".bb-brands-confirm-backdrop") ||
      el.closest(".bb-brands-card--add") ||
      el.closest(".bb-brands-card--placeholder")
    );
  }

  function navigateToBrand(card) {
    const circle = card.querySelector(".bb-brands-circle");
    if (circle) {
      circle.classList.remove("bb-brands-circle--bump");
      void circle.offsetWidth;
      circle.classList.add("bb-brands-circle--bump");
    }
    if (card.__bbBrand) {
      persistBrandContext(card.__bbBrand);
    }
    window.setTimeout(function () {
      window.location.href = BRAND_OPEN_TARGET;
    }, 160);
  }

  function bindGridInteractions() {
    const grid = document.getElementById("bbBrandsGrid");
    if (!grid || grid.__bbGridBound) return;
    grid.__bbGridBound = true;

    grid.addEventListener("click", function (e) {
      const publishTrigger = e.target.closest(".bb-brands-publish-trigger");
      if (publishTrigger && grid.contains(publishTrigger)) {
        e.stopPropagation();
        const isOpen = publishTrigger.getAttribute("aria-expanded") === "true";
        if (isOpen) closePopover();
        else openPopover(publishTrigger);
        return;
      }

      const card = e.target.closest(
        ".bb-brands-card:not(.bb-brands-card--add):not(.bb-brands-card--placeholder)"
      );
      if (!card || !grid.contains(card)) return;
      if (isInteractiveCardTarget(e.target)) return;
      if (popover && popover.contains(e.target)) return;
      if (tierPopover && tierPopover.contains(e.target)) return;
      e.preventDefault();
      navigateToBrand(card);
    });

    grid.addEventListener("keydown", function (e) {
      const card = e.target.closest(
        ".bb-brands-card:not(.bb-brands-card--add):not(.bb-brands-card--placeholder)"
      );
      if (!card || !grid.contains(card)) return;
      if (isInteractiveCardTarget(e.target)) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        navigateToBrand(card);
      }
    });

    document.addEventListener("click", function (e) {
      if (tierPopover && tierPopover.classList.contains("bb-brands-action-popover--open")) {
        if (tierPopover.contains(e.target)) return;
        if (e.target.closest && e.target.closest("#bbBrandsAddBtn")) return;
        closeTierPopover();
      }
      if (!popover || !popover.classList.contains("bb-brands-action-popover--open")) return;
      if (popover.contains(e.target)) return;
      if (e.target.closest && e.target.closest(".bb-brands-publish-trigger")) return;
      closePopover();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (tierPopover && tierPopover.classList.contains("bb-brands-action-popover--open")) {
        closeTierPopover();
        return;
      }
      if (popover && popover.classList.contains("bb-brands-action-popover--open")) {
        closePopover();
      }
    });

    window.addEventListener("scroll", function () {
      if (activeTrigger) positionPopover(activeTrigger);
      if (tierTrigger && tierPopover) positionFixedPopover(tierPopover, tierTrigger);
    }, { passive: true });
    window.addEventListener("resize", function () {
      if (activeTrigger) positionPopover(activeTrigger);
      if (tierTrigger && tierPopover) positionFixedPopover(tierPopover, tierTrigger);
    });
  }

  function decorateBrandCardsForA11y() {
    const grid = document.getElementById("bbBrandsGrid");
    if (!grid) return;
    grid.querySelectorAll(
      ".bb-brands-card:not(.bb-brands-card--add):not(.bb-brands-card--placeholder)"
    ).forEach(function (card) {
      card.setAttribute("role", "link");
      card.setAttribute("tabindex", "0");
      const name = getBrandName(card.querySelector(".bb-brands-publish-trigger") || card);
      card.setAttribute("aria-label", "Open " + name);
    });
  }

  /* ------------------------------------------------------------------
     Dev-preview flags — sync body classes from localStorage so dev
     toggles in `dev/export-settings.html` light up the matching
     previews on this page live.
       - `bbDevShowPlanTier` ("1") → body.bb-brands-show-plan
           reveals the "Premium" pill on each brand card.
       - `bbDevVerifyState` ("fail") → body.bb-brands-verify-failed
           reveals the unverified badge on every brand card. Pass /
           unset hides it.
     ------------------------------------------------------------------ */
  const LS_PLAN_TIER   = "bbDevShowPlanTier";
  const LS_VERIFY_STATE = "bbDevVerifyState";

  function applyPlanTierClass() {
    let on = false;
    try { on = localStorage.getItem(LS_PLAN_TIER) === "1"; } catch (_e) {}
    if (document.body) document.body.classList.toggle("bb-brands-show-plan", on);
  }

  function applyVerifyStateClass() {
    let failed = false;
    try { failed = localStorage.getItem(LS_VERIFY_STATE) === "fail"; } catch (_e) {}
    if (document.body) document.body.classList.toggle("bb-brands-verify-failed", failed);
  }

  function bindDevPreviewFlags() {
    applyPlanTierClass();
    applyVerifyStateClass();
    window.addEventListener("storage", function (e) {
      if (!e || e.key === null) {
        applyPlanTierClass();
        applyVerifyStateClass();
        return;
      }
      if (e.key === LS_PLAN_TIER) applyPlanTierClass();
      if (e.key === LS_VERIFY_STATE) applyVerifyStateClass();
    });
    /* Re-apply when this tab regains focus, in case the dev page
       changed the flag while we were in the background. */
    window.addEventListener("focus", function () {
      applyPlanTierClass();
      applyVerifyStateClass();
    });
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) {
        applyPlanTierClass();
        applyVerifyStateClass();
      }
    });
  }

  async function init() {
    try {
      bindDevPreviewFlags();
      bindGridInteractions();
      const syncBtn = document.getElementById("bbBrandsSyncBtn");
      if (syncBtn) {
        syncBtn.addEventListener("click", async function () {
          try {
            if (typeof window.bbShowSyncPopup === "function") {
              await window.bbShowSyncPopup();
            }
            await loadAndRenderBrands();
            decorateBrandCardsForA11y();
          } catch (_syncErr) { /* ignore */ }
        });
      }

      const addBtn = document.getElementById("bbBrandsAddBtn");
      if (addBtn) {
        addBtn.setAttribute("aria-haspopup", "menu");
        addBtn.setAttribute("aria-expanded", "false");

        addBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          const circle = addBtn.querySelector(".bb-brands-circle--add");
          if (circle) {
            circle.classList.remove("bb-brands-circle--add-bump");
            void circle.offsetWidth;
            circle.classList.add("bb-brands-circle--add-bump");
          }
          const isOpen = addBtn.getAttribute("aria-expanded") === "true";
          if (isOpen) {
            closeTierPopover();
          } else {
            window.setTimeout(function () {
              openTierPopover(addBtn);
            }, 120);
          }
        });
      }

      openBrandLoadingModal();
      const result = await loadAndRenderBrands();
      await closeBrandLoadingModal();

      if (result && result.hasBrands) {
        hideBrandsGate();
        setBrandsMountVisible(true);
        decorateBrandCardsForA11y();
      } else if (!result || !result.error) {
        showBrandsGate("Select or create a brand to view your brands.");
      }
    } catch (_e) {
      /* page still renders fine via CSS */
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
