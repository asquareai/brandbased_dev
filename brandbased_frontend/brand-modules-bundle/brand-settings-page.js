/**
 * Brand Settings — load selected brand, hydrate preview logos, actions + activity history.
 */
(function () {
  if (window.bbBrandSettingsPageInit) return;
  window.bbBrandSettingsPageInit = true;

  const LS_SELECTED_BRAND = "bbSelectedBrand";
  const LS_CURRENT_REQUEST = "bbCurrentBrandVerificationRequest";
  const LS_LIGHT_LOGO = "bbLuLightLogoData";
  const LS_DARK_LOGO = "bbLuDarkLogoData";
  const LS_PLACEMENT = "bbPlacement:panel:v1";
  const LS_REPLACE_THRESHOLD = "bbReplaceThreshold:v1";
  const LS_BRAND_AI = "bbSmartSize:brandAiSmart:v1";
  const BRANDS_URL = "./brands/Brands.html";
  const START_NOW_URL = "./start-now/Start-Now.html";
  const DASHBOARD_START_ROUTE = "start";
  const DASHBOARD_BRANDS_ROUTE = "brands";

  let saveTimer = 0;
  let applyingSettings = false;
  let settingsListenersBound = false;
  let brandLoadingModal = null;
  let brandLoadingProgressTimer = 0;

  function loginUrl() {
    if (window.BB_APP && window.BB_APP.routes && window.BB_APP.routes.loginFromModules) {
      return window.BB_APP.routes.loginFromModules;
    }
    return "../index.html";
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, function (ch) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
    });
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

  async function fetchLogoPayload(url) {
    if (!url) return "";
    const res = await fetch(url, { credentials: "omit" });
    if (!res.ok) throw new Error("Logo fetch failed");
    const type = (res.headers.get("content-type") || "").toLowerCase();
    if (type.includes("svg") || url.toLowerCase().endsWith(".svg")) {
      return await res.text();
    }
    const blob = await res.blob();
    return await new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        resolve(reader.result || "");
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function rememberPreviewLogoUrl(brand) {
    const url = (brand && (brand.logo_light_url || brand.logo_dark_url)) || "";
    window.__bbPreviewLogoUrl = url || "";
    return url;
  }

  function cssUrlValue(url) {
    return 'url("' + String(url || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '")';
  }

  function paintPreviewLogoMarks(brand) {
    const logoUrl = rememberPreviewLogoUrl(brand);
    const label = String((brand && brand.brand_name) || "brand").trim() || "brand";
    const slots = document.querySelectorAll(
      "#bbPreviewHost .brandbased-dynamic-logo-slot, #bbSimulatedContent .brandbased-dynamic-logo-slot"
    );
    slots.forEach(function (slot) {
      slot.textContent = label;
      slot.setAttribute("data-brand", "upload");
      slot.classList.add("brandbased", "bb-upload", "bb-enhanced", "slide-up");
      if (logoUrl) {
        slot.style.setProperty("--bb-logo", cssUrlValue(logoUrl));
        slot.style.setProperty("--bb-ratio", "1");
      }
    });
  }

  async function persistLogosToStorage(brand) {
    const lightUrl = brand.logo_light_url || "";
    const darkUrl = brand.logo_dark_url || "";
    rememberPreviewLogoUrl(brand);
    if (!lightUrl && !darkUrl) return;

    try {
      if (lightUrl) {
        const light = await fetchLogoPayload(lightUrl);
        if (light) {
          localStorage.setItem(LS_LIGHT_LOGO, light);
        } else {
          localStorage.setItem(LS_LIGHT_LOGO, lightUrl);
        }
      }
      if (darkUrl && darkUrl !== lightUrl) {
        const dark = await fetchLogoPayload(darkUrl);
        if (dark) {
          localStorage.setItem(LS_DARK_LOGO, dark);
        } else {
          localStorage.setItem(LS_DARK_LOGO, darkUrl);
        }
      } else if (lightUrl) {
        localStorage.removeItem(LS_DARK_LOGO);
      }
    } catch (err) {
      console.warn("Brand settings: could not cache logos for preview", err);
      try {
        if (lightUrl) localStorage.setItem(LS_LIGHT_LOGO, lightUrl);
        if (darkUrl) localStorage.setItem(LS_DARK_LOGO, darkUrl);
      } catch (_e) { /* ignore */ }
    }
  }

  function rebuildPreviewMarks(brand) {
    paintPreviewLogoMarks(brand);
    notifySmartUiRefresh();
  }

  function notifySmartUiRefresh() {
    try {
      window.dispatchEvent(new CustomEvent("bb-brand-context-updated"));
    } catch (_e) { /* ignore */ }
  }

  function waitForSmartUiReady() {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, 450);
    });
  }

  function setSaveStatus(state, message) {
    const el = document.getElementById("bbBsSaveStatus");
    if (!el) return;
    el.classList.remove(
      "bb-bs-save-status--saving",
      "bb-bs-save-status--saved",
      "bb-bs-save-status--error"
    );
    if (state === "saving") {
      el.classList.add("bb-bs-save-status--saving");
      el.textContent = message || "Saving…";
      return;
    }
    if (state === "saved") {
      el.classList.add("bb-bs-save-status--saved");
      el.textContent = message || "Saved";
      return;
    }
    if (state === "error") {
      el.classList.add("bb-bs-save-status--error");
      el.textContent = message || "Save failed";
      return;
    }
    el.textContent = message || "";
  }

  function collectSettingsFromPage() {
    const placement = { s: "100", w: "100", h: "100", l: "0", r: "0", t: "0", b: "0" };
    const size = document.querySelector(".bb-place-size");
    const w = document.querySelector(".bb-place-w");
    const h = document.querySelector(".bb-place-h");
    const pl = document.querySelector(".bb-place-padl");
    const pr = document.querySelector(".bb-place-padr");
    const pt = document.querySelector(".bb-place-padt");
    const pb = document.querySelector(".bb-place-padb");

    if (size && w && h && pl && pr && pt && pb) {
      placement.s = String(size.value);
      placement.w = String(w.value);
      placement.h = String(h.value);
      placement.l = String(pl.value);
      placement.r = String(pr.value);
      placement.t = String(pt.value);
      placement.b = String(pb.value);
    } else {
      try {
        const stored = JSON.parse(localStorage.getItem(LS_PLACEMENT) || "null");
        if (stored && typeof stored === "object") {
          Object.assign(placement, stored);
        }
      } catch (_e) { /* ignore */ }
    }

    const thr = document.getElementById("bbReplaceThreshold");
    let replace_threshold = 8;
    if (thr && thr.value !== "") {
      replace_threshold = Math.max(1, Math.min(8, Math.round(Number(thr.value) || 8)));
    } else {
      try {
        const raw = localStorage.getItem(LS_REPLACE_THRESHOLD);
        if (raw != null && raw !== "") {
          replace_threshold = Math.max(1, Math.min(8, Math.round(Number(raw) || 8)));
        }
      } catch (_e2) { /* ignore */ }
    }

    let brand_ai_smart = false;
    try {
      brand_ai_smart = localStorage.getItem(LS_BRAND_AI) === "1";
    } catch (_e3) { /* ignore */ }

    return {
      placement: placement,
      replace_threshold: replace_threshold,
      brand_ai_smart: brand_ai_smart,
    };
  }

  function syncReplaceThresholdUi(value) {
    const thr = document.getElementById("bbReplaceThreshold");
    const thrV = document.getElementById("bbReplaceThresholdValue");
    if (!thr) return;
    const v = Math.max(1, Math.min(8, Math.round(Number(value) || 8)));
    thr.value = String(v);
    try {
      localStorage.setItem(LS_REPLACE_THRESHOLD, String(v));
    } catch (_e) { /* ignore */ }
    if (thrV) {
      thrV.textContent = v >= 8 ? "Auto" : String(v);
    }
    thr.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function applyBrandSettingsToPage(settings) {
    if (!settings || typeof settings !== "object") return;
    applyingSettings = true;

    try {
      if (settings.placement && typeof settings.placement === "object") {
        localStorage.setItem(LS_PLACEMENT, JSON.stringify(settings.placement));
        const size = document.querySelector(".bb-place-size");
        const w = document.querySelector(".bb-place-w");
        const h = document.querySelector(".bb-place-h");
        const pl = document.querySelector(".bb-place-padl");
        const pr = document.querySelector(".bb-place-padr");
        const pt = document.querySelector(".bb-place-padt");
        const pb = document.querySelector(".bb-place-padb");
        const p = settings.placement;
        if (size) size.value = p.s != null ? String(p.s) : "100";
        if (w) w.value = p.w != null ? String(p.w) : "100";
        if (h) h.value = p.h != null ? String(p.h) : "100";
        if (pl) pl.value = p.l != null ? String(p.l) : "0";
        if (pr) pr.value = p.r != null ? String(p.r) : "0";
        if (pt) pt.value = p.t != null ? String(p.t) : "0";
        if (pb) pb.value = p.b != null ? String(p.b) : "0";
      }

      if (settings.replace_threshold != null) {
        syncReplaceThresholdUi(settings.replace_threshold);
      }

      if (settings.brand_ai_smart != null) {
        const on = !!settings.brand_ai_smart;
        try {
          localStorage.setItem(LS_BRAND_AI, on ? "1" : "0");
        } catch (_e) { /* ignore */ }
        const btn = document.getElementById("bbPlaceBrandAiToggle");
        if (btn) {
          btn.setAttribute("aria-pressed", on ? "true" : "false");
          btn.textContent = on ? "On" : "Off";
          const adaptive = btn.closest(".bb-adaptive-card");
          if (adaptive) adaptive.classList.toggle("bb-adaptive-on", on);
        }
      }
    } finally {
      applyingSettings = false;
      if (activeBrand) {
        rebuildPreviewMarks(activeBrand);
      } else {
        notifySmartUiRefresh();
      }
    }
  }

  async function loadAndApplyBrandSettings(brand) {
    const api = window.BBBrandVerification;
    let settings = brand && brand.settings ? brand.settings : null;

    if (!settings && api && api.fetchBrandSettings && brand.id) {
      try {
        settings = await api.fetchBrandSettings(brand.id);
      } catch (err) {
        console.warn("Brand settings: using defaults", err);
      }
    }

    if (settings) {
      applyBrandSettingsToPage(settings);
      if (activeBrand) {
        activeBrand.settings = settings;
        saveSelectedBrand(activeBrand);
      }
    }
  }

  function scheduleSettingsSave() {
    if (applyingSettings || !activeBrand || !activeBrand.id) return;
    const api = window.BBBrandVerification;
    if (!api || !api.saveBrandSettings) return;

    if (saveTimer) window.clearTimeout(saveTimer);
    setSaveStatus("saving");

    saveTimer = window.setTimeout(async function () {
      saveTimer = 0;
      const payload = collectSettingsFromPage();
      try {
        const saved = await api.saveBrandSettings(activeBrand.id, payload);
        activeBrand.settings = saved;
        saveSelectedBrand(activeBrand);
        rebuildPreviewMarks(activeBrand);
        setSaveStatus("saved");
        window.setTimeout(function () {
          const el = document.getElementById("bbBsSaveStatus");
          if (el && el.classList.contains("bb-bs-save-status--saved")) {
            setSaveStatus("idle");
          }
        }, 2200);
      } catch (err) {
        console.error(err);
        setSaveStatus("error", err.message || "Save failed");
      }
    }, 700);
  }

  function bindSettingsPersistence() {
    if (settingsListenersBound) return;
    settingsListenersBound = true;

    const panel = document.getElementById("bbPlacePanel");
    if (panel) {
      panel.addEventListener("input", function () {
        scheduleSettingsSave();
      });
      panel.addEventListener("change", function () {
        scheduleSettingsSave();
      });
    }

    const thr = document.getElementById("bbReplaceThreshold");
    if (thr) {
      thr.addEventListener("input", function () {
        scheduleSettingsSave();
      });
    }

    const aiBtn = document.getElementById("bbPlaceBrandAiToggle");
    if (aiBtn) {
      aiBtn.addEventListener("click", function () {
        window.setTimeout(scheduleSettingsSave, 50);
      });
    }

    const resetBtn = document.querySelector(".bb-place-reset");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        window.setTimeout(scheduleSettingsSave, 80);
      });
    }
  }

  function applyAdaptiveLogoThumb(brand) {
    const img = document.querySelector(".bb-adaptive-card .bb-place-logo");
    if (!img) return;
    const url = brand.logo_light_url || brand.logo_dark_url || "";
    if (url) {
      img.src = url;
      img.alt = (brand.brand_name || "Brand") + " logo";
    }
  }

  function setPageTitle(brand) {
    const title = document.getElementById("bbBsPageTitle");
    if (title) title.textContent = "Brand Settings";
    const name = brand && brand.brand_name ? String(brand.brand_name).trim() : "";
    document.title = name ? name + " — Brand Settings — BrandBased" : "Brand Settings — BrandBased";
  }

  function renderBrandBar(brand) {
    const slot = document.getElementById("bbBsHeaderBrand");
    if (!slot) return;

    const logoUrl = brand.logo_light_url || brand.logo_dark_url || "";
    const name = escapeHtml(brand.brand_name || "Brand");
    const uniqueId = escapeHtml(brand.brand_unique_id || "");

    slot.innerHTML =
      (logoUrl
        ? '<img class="bb-bs-header-brand__logo" src="' +
          logoUrl.replace(/"/g, "&quot;") +
          '" alt="" decoding="async" />'
        : '<span class="bb-bs-header-brand__logo-fallback" aria-hidden="true">' +
          escapeHtml((brand.brand_name || "B").charAt(0).toUpperCase()) +
          "</span>") +
      '<div class="bb-bs-header-brand__text">' +
      '<span class="bb-bs-header-brand__name">' +
      name +
      "</span>" +
      (uniqueId
        ? '<span class="bb-bs-header-brand__id">ID: ' + uniqueId + "</span>"
        : "") +
      "</div>";

    slot.hidden = false;
  }

  function formatActivityAction(action) {
    switch (action) {
      case "created":
        return "Brand verified";
      case "published":
        return "Published";
      case "unpublished":
        return "Unpublished";
      case "deleted":
        return "Deleted";
      default:
        return action || "Activity";
    }
  }

  function formatActivityWhen(iso) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch (_e) {
      return String(iso);
    }
  }

  async function renderActivityLog(brand) {
    const panel = document.getElementById("bbBsActivityPanel");
    const list = document.getElementById("bbBsActivityList");
    if (!panel || !list) return;

    const api = window.BBBrandVerification;
    if (!api || !api.fetchBrandActivityLogs || !brand.id) {
      panel.hidden = true;
      return;
    }

    list.innerHTML = '<li class="bb-bs-activity-item bb-bs-activity-item--loading">Loading activity…</li>';
    panel.hidden = false;

    try {
      const logs = await api.fetchBrandActivityLogs({ brandId: brand.id, limit: 25 });
      if (!logs.length) {
        list.innerHTML =
          '<li class="bb-bs-activity-item bb-bs-activity-item--empty">No activity recorded yet.</li>';
        return;
      }
      list.innerHTML = logs
        .map(function (entry) {
          const when = formatActivityWhen(entry.created_at);
          const action = formatActivityAction(entry.action);
          const name = escapeHtml(entry.brand_name || brand.brand_name || "Brand");
          return (
            '<li class="bb-bs-activity-item">' +
            '<span class="bb-bs-activity-action">' +
            escapeHtml(action) +
            "</span>" +
            '<span class="bb-bs-activity-meta">' +
            name +
            (when ? " · " + escapeHtml(when) : "") +
            "</span></li>"
          );
        })
        .join("");
    } catch (err) {
      console.error(err);
      list.innerHTML =
        '<li class="bb-bs-activity-item bb-bs-activity-item--empty">Unable to load activity history.</li>';
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

  function openBrandLoadingModal(label) {
    stopBrandLoadingProgress();
    if (brandLoadingModal && typeof brandLoadingModal.dismiss === "function") {
      brandLoadingModal.dismiss();
      brandLoadingModal = null;
    }
    hideBrandSettingsChrome(true);
    setPageTitle(null);

    if (typeof window.bbOpenSyncProgressModal !== "function") {
      return null;
    }
    brandLoadingModal = window.bbOpenSyncProgressModal({
      label: label || "Loading brand settings…",
      barColor: "#635bff",
      logoSrc: "brandbased-logo.svg",
      progress: 10,
      shineLabel: true,
    });
    startBrandLoadingProgress();
    return brandLoadingModal;
  }

  async function closeBrandLoadingModal(finishOpts) {
    stopBrandLoadingProgress();
    const modal = brandLoadingModal;
    brandLoadingModal = null;
    if (!modal) return;
    if (finishOpts && typeof modal.finish === "function") {
      await modal.finish(finishOpts);
      return;
    }
    if (typeof modal.dismiss === "function") {
      await modal.dismiss();
    }
  }

  function hideBrandSettingsChrome(hidden) {
    const layout = document.querySelector(".bb-bs-layout");
    const head = document.querySelector(".bb-module-head");
    const brandSlot = document.getElementById("bbBsHeaderBrand");
    if (layout) layout.hidden = !!hidden;
    if (head) head.hidden = !!hidden;
    if (brandSlot && hidden) brandSlot.hidden = true;
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

  function navigateDashboardRoute(routeId) {
    if (window.self !== window.top) {
      try {
        window.parent.postMessage({ type: "bb-dash-goto-route", route: routeId }, "*");
        return true;
      } catch (_e) { /* ignore */ }
    }
    return false;
  }

  function navigateDashboardToStart() {
    return navigateDashboardRoute(DASHBOARD_START_ROUTE);
  }

  function navigateDashboardToBrands() {
    return navigateDashboardRoute(DASHBOARD_BRANDS_ROUTE);
  }

  function navigateToStartNow() {
    if (!navigateDashboardToStart()) {
      if (window.self !== window.top) {
        try {
          window.top.location.assign(startNowDashboardUrl());
          return;
        } catch (_e) { /* ignore */ }
      }
      window.location.href = START_NOW_URL;
    }
  }

  function navigateToBrandsPage() {
    if (!navigateDashboardToBrands()) {
      if (window.self !== window.top) {
        try {
          window.top.location.assign(brandsDashboardUrl());
          return;
        } catch (_e) { /* ignore */ }
      }
      window.location.href = BRANDS_URL;
    }
  }

  function hideBrandGate() {
    const gate = document.getElementById("bbBsBrandGate");
    if (gate) gate.hidden = true;
  }

  let brandGateOkHandler = null;

  function showBrandGate(message, destination) {
    hideBrandSettingsChrome(true);
    setPageTitle(null);
    hideBrandGate();

    const gate = document.getElementById("bbBsBrandGate");
    const msg = document.getElementById("bbBsBrandGateMsg");
    const btn = document.getElementById("bbBsBrandGateOk");
    if (msg) msg.textContent = message;
    if (gate) gate.hidden = false;

    brandGateOkHandler = function () {
      if (destination === "brands") navigateToBrandsPage();
      else navigateToStartNow();
    };

    if (btn && btn.getAttribute("data-bb-gate-bound") !== "1") {
      btn.setAttribute("data-bb-gate-bound", "1");
      btn.addEventListener("click", function () {
        if (typeof brandGateOkHandler === "function") brandGateOkHandler();
      });
    }
  }

  async function showBrandRequiredGate(scenario) {
    await closeBrandLoadingModal();
    if (scenario === "none") {
      showBrandGate("Select or create a brand to open Brand Settings.", "start");
      return;
    }
    showBrandGate("Select or add a brand to open Brand Settings.", "brands");
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

  async function resolveBrandContext() {
    const api = window.BBBrandVerification;
    let brands = [];
    const stored = readJson(LS_SELECTED_BRAND);
    const request = readJson(LS_CURRENT_REQUEST);

    if (api && api.fetchBrands) {
      try {
        brands = await api.fetchBrands();
      } catch (err) {
        console.error(err);
      }
    }

    if (!brands.length) {
      return { scenario: "none", brand: null, brands: brands };
    }

    if (brands.length === 1) {
      return { scenario: "single", brand: brands[0], brands: brands };
    }

    const fromStored = matchBrandInList(brands, stored);
    if (fromStored) {
      return { scenario: "selected", brand: fromStored, brands: brands };
    }

    if (request && request.brand_unique_id) {
      const fromRequest = brands.find(function (b) {
        return b.brand_unique_id === request.brand_unique_id;
      });
      if (fromRequest) {
        return { scenario: "selected", brand: fromRequest, brands: brands };
      }
    }

    return { scenario: "pick", brand: null, brands: brands };
  }

  let activeBrand = null;

  async function hydrateBrand(brand) {
    activeBrand = brand;
    hideBrandSettingsChrome(false);

    saveSelectedBrand(brand);
    setPageTitle(brand);
    renderBrandBar(brand);
    applyAdaptiveLogoThumb(brand);
    await persistLogosToStorage(brand);
    paintPreviewLogoMarks(brand);
    await waitForSmartUiReady();
    await loadAndApplyBrandSettings(brand);
    rebuildPreviewMarks(brand);
    bindSettingsPersistence();
    await renderActivityLog(brand);
  }

  async function init() {
    if (!localStorage.getItem("auth_token")) {
      window.location.href = loginUrl();
      return;
    }

    const reload = async function () {
      openBrandLoadingModal("Loading brand settings…");
      const ctx = await resolveBrandContext();
      if (ctx.scenario === "single" || ctx.scenario === "selected") {
        await closeBrandLoadingModal();
        hideBrandGate();
        await hydrateBrand(ctx.brand);
        return;
      }
      await showBrandRequiredGate(ctx.scenario);
    };

    openBrandLoadingModal("Loading brand settings…");
    const ctx = await resolveBrandContext();
    if (ctx.scenario === "single" || ctx.scenario === "selected") {
      await closeBrandLoadingModal();
      hideBrandGate();
      await hydrateBrand(ctx.brand);
      return;
    }
    await showBrandRequiredGate(ctx.scenario);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
