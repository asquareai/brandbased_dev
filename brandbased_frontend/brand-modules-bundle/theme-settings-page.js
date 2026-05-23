/**
 * Theme Styles — require a brand before showing the theme editor.
 *
 * 0 brands  → gate: "To view Theme Settings add a brand" + Go to Brands
 * 1 brand   → auto-select and open Theme Settings
 * 2+ brands → need selection in storage; else gate: "To view Theme Settings select/add a brand"
 */
(function () {
  if (window.bbThemeSettingsPageInit) return;
  window.bbThemeSettingsPageInit = true;

  const LS_SELECTED_BRAND = "bbSelectedBrand";
  const LS_CURRENT_REQUEST = "bbCurrentBrandVerificationRequest";
  const BRANDS_URL = "./brands/Brands.html";
  const DASHBOARD_BRANDS_ROUTE = "brands";

  let brandLoadingModal = null;
  let brandLoadingProgressTimer = 0;

  function loginUrl() {
    if (window.BB_APP && window.BB_APP.routes && window.BB_APP.routes.loginFromModules) {
      return window.BB_APP.routes.loginFromModules;
    }
    return "../index.html";
  }

  function readJson(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_e) {
      return null;
    }
  }

  function saveSelectedBrand(brand) {
    if (!brand) return;
    try {
      localStorage.setItem(LS_SELECTED_BRAND, JSON.stringify(brand));
    } catch (_e) { /* ignore */ }
  }

  function applyBrandContext(brand) {
    if (!brand) return;
    saveSelectedBrand(brand);
    const url = (brand.logo_light_url || brand.logo_dark_url || "").trim();
    if (url) window.__bbPreviewLogoUrl = url;
    try {
      window.dispatchEvent(
        new CustomEvent("bb-brand-context-updated", { detail: { brand: brand } })
      );
    } catch (_e) { /* ignore */ }
    try {
      window.dispatchEvent(
        new CustomEvent("bb-theme-brand-ready", { detail: { brand: brand } })
      );
    } catch (_e2) { /* ignore */ }
  }

  function setThemeChromeVisible(visible) {
    const shell = document.querySelector(".bb-theme-shell");
    if (shell) shell.hidden = !visible;
  }

  function hideThemeLoader() {
    const loader = document.getElementById("bbThemeLoader");
    if (loader) loader.hidden = true;
    document.body.classList.remove("bb-theme-preview-loading");
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

  function openBrandLoadingModal(label) {
    stopBrandLoadingProgress();
    if (brandLoadingModal && typeof brandLoadingModal.dismiss === "function") {
      brandLoadingModal.dismiss();
      brandLoadingModal = null;
    }
    setThemeChromeVisible(false);
    hideThemeGate();

    if (typeof window.bbOpenSyncProgressModal !== "function") {
      return null;
    }
    brandLoadingModal = window.bbOpenSyncProgressModal({
      label: label || "Loading Theme Settings…",
      barColor: "#635bff",
      logoSrc: "brandbased-logo.svg",
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
    if (typeof modal.dismiss === "function") {
      await modal.dismiss();
    }
  }

  function hideThemeGate() {
    const gate = document.getElementById("bbThemeBrandGate");
    if (gate) gate.hidden = true;
  }

  function showThemeGate(message, destination) {
    themeGateDestination = destination === "start" ? "start" : "brands";
    hideThemeLoader();
    setThemeChromeVisible(false);
    const gate = document.getElementById("bbThemeBrandGate");
    const msg = document.getElementById("bbThemeBrandGateMsg");
    if (msg) msg.textContent = message;
    if (gate) gate.hidden = false;
  }

  function brandsDashboardUrl() {
    try {
      const consolePath =
        (window.BB_APP && window.BB_APP.routes && window.BB_APP.routes.console) ||
        "../../brand-console-final/brand-console-dashboard.html";
      const u = new URL(consolePath, window.location.href);
      u.searchParams.set("page", DASHBOARD_BRANDS_ROUTE);
      return u.toString();
    } catch (_e) {
      return "../../brand-console-final/brand-console-dashboard.html?page=brands";
    }
  }

  function navigateToBrands() {
    if (window.self !== window.top) {
      try {
        window.parent.postMessage(
          { type: "bb-dash-goto-route", route: DASHBOARD_BRANDS_ROUTE },
          "*"
        );
        return;
      } catch (_e) { /* ignore */ }
      try {
        window.top.location.assign(brandsDashboardUrl());
        return;
      } catch (_e2) { /* ignore */ }
    }
    window.location.href = BRANDS_URL;
  }

  function matchBrandInList(brands, brand) {
    if (!brand || !brands || !brands.length) return null;
    if (brand.id) {
      const byId = brands.find(function (b) {
        return b.id === brand.id;
      });
      if (byId) return byId;
    }
    if (brand.brand_unique_id) {
      const byUid = brands.find(function (b) {
        return b.brand_unique_id === brand.brand_unique_id;
      });
      if (byUid) return byUid;
    }
    return null;
  }

  async function resolveThemeBrand() {
    const api = window.BBBrandVerification;
    let brands = [];

    if (api && api.fetchBrands) {
      try {
        brands = await api.fetchBrands();
      } catch (err) {
        console.error(err);
      }
    }

    if (!brands.length) {
      return { scenario: "none", brands: brands, brand: null };
    }

    if (brands.length === 1) {
      return { scenario: "single", brands: brands, brand: brands[0] };
    }

    const stored = readJson(LS_SELECTED_BRAND);
    const fromStored = matchBrandInList(brands, stored);
    if (fromStored) {
      return { scenario: "selected", brands: brands, brand: fromStored };
    }

    const request = readJson(LS_CURRENT_REQUEST);
    if (request && request.brand_unique_id) {
      const fromRequest = brands.find(function (b) {
        return b.brand_unique_id === request.brand_unique_id;
      });
      if (fromRequest) {
        return { scenario: "selected", brands: brands, brand: fromRequest };
      }
    }

    return { scenario: "pick", brands: brands, brand: null };
  }

  async function openThemeWithBrand(brand) {
    applyBrandContext(brand);
    await closeBrandLoadingModal();
    hideThemeGate();
    setThemeChromeVisible(true);
    document.body.classList.add("bb-theme-brand-ready");
  }

  let themeGateDestination = "brands";

  function bindGateButton() {
    const btn = document.getElementById("bbThemeBrandGateOk");
    if (!btn || btn.getAttribute("data-bb-theme-gate-bound") === "1") return;
    btn.setAttribute("data-bb-theme-gate-bound", "1");
    btn.addEventListener("click", function () {
      if (themeGateDestination === "start") navigateToStartNow();
      else navigateToBrands();
    });
  }

  function navigateToStartNow() {
    const START_NOW_URL = "./start-now/Start-Now.html";
    const DASHBOARD_START_ROUTE = "start";
    if (window.self !== window.top) {
      try {
        window.parent.postMessage(
          { type: "bb-dash-goto-route", route: DASHBOARD_START_ROUTE },
          "*"
        );
        return;
      } catch (_e) { /* ignore */ }
    }
    window.location.href = START_NOW_URL;
  }

  async function init() {
    if (!localStorage.getItem("auth_token")) {
      window.location.href = loginUrl();
      return;
    }

    bindGateButton();
    setThemeChromeVisible(false);
    openBrandLoadingModal("Loading Theme Settings…");

    const result = await resolveThemeBrand();

    if (result.scenario === "none") {
      await closeBrandLoadingModal();
      showThemeGate("To view Theme Settings add a brand", "start");
      return;
    }

    if (result.scenario === "single" || result.scenario === "selected") {
      await openThemeWithBrand(result.brand);
      return;
    }

    await closeBrandLoadingModal();
    showThemeGate("To view Theme Settings select/add a brand", "brands");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
