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

  let saveTimer = 0;
  let applyingSettings = false;
  let settingsListenersBound = false;

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
    const name = brand && brand.brand_name ? String(brand.brand_name).trim() : "";
    if (title) {
      title.textContent = name ? name + " — Brand Settings" : "Brand Settings";
    }
    document.title = name ? name + " — Brand Settings — BrandBased" : "Brand Settings — BrandBased";
  }

  function renderBrandBar(brand) {
    const bar = document.getElementById("bbBsBrandBar");
    if (!bar) return;

    const logoUrl = brand.logo_light_url || brand.logo_dark_url || "";
    const name = escapeHtml(brand.brand_name || "Brand");
    const website = brand.website_url || "";
    const websiteSafe = escapeHtml(website);
    const published = !!brand.is_published;
    const uniqueId = escapeHtml(brand.brand_unique_id || "");

    bar.innerHTML =
      '<div class="bb-bs-brand-bar__identity">' +
      (logoUrl
        ? '<img class="bb-bs-brand-bar__logo" src="' +
          logoUrl.replace(/"/g, "&quot;") +
          '" alt="" decoding="async" />'
        : '<span class="bb-bs-brand-bar__logo-fallback" aria-hidden="true">' +
          escapeHtml((brand.brand_name || "B").charAt(0).toUpperCase()) +
          "</span>") +
      '<div class="bb-bs-brand-bar__meta">' +
      '<p class="bb-bs-brand-bar__name">' +
      name +
      "</p>" +
      (website
        ? '<a class="bb-bs-brand-bar__url" href="' +
          website.replace(/"/g, "&quot;") +
          '" target="_blank" rel="noopener">' +
          websiteSafe +
          "</a>"
        : "") +
      (uniqueId
        ? '<p class="bb-bs-brand-bar__id">ID: ' + uniqueId + "</p>"
        : "") +
      '<div class="bb-bs-brand-bar__badges">' +
      '<span class="bb-bs-pill bb-bs-pill--verified">Verified</span>' +
      '<span class="bb-bs-pill' +
      (published ? " bb-bs-pill--live" : " bb-bs-pill--draft") +
      '">' +
      (published ? "Published" : "Unpublished") +
      "</span>" +
      "</div></div></div>" +
      '<div class="bb-bs-brand-bar__actions">' +
      '<span class="bb-bs-save-status" id="bbBsSaveStatus" aria-live="polite"></span>' +
      '<a class="bb-bs-btn bb-bs-btn--ghost" href="' +
      BRANDS_URL +
      '">← Brands</a>' +
      '<button type="button" class="bb-bs-btn" data-bs-action="publish">Publish</button>' +
      '<button type="button" class="bb-bs-btn" data-bs-action="unpublish">Unpublish</button>' +
      '<button type="button" class="bb-bs-btn bb-bs-btn--danger" data-bs-action="delete">Delete</button>' +
      "</div>";

    bar.hidden = false;
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

  function showNoBrandState() {
    const bar = document.getElementById("bbBsBrandBar");
    const empty = document.getElementById("bbBsNoBrand");
    const layout = document.querySelector(".bb-bs-layout");
    if (bar) bar.hidden = true;
    if (empty) empty.hidden = false;
    if (layout) layout.hidden = true;
    setPageTitle(null);
  }

  async function resolveBrand() {
    const api = window.BBBrandVerification;
    let brand = readJson(LS_SELECTED_BRAND);

    const request = readJson(LS_CURRENT_REQUEST);
    if (api && api.fetchBrands) {
      try {
        const brands = await api.fetchBrands();
        if (brand && brand.id) {
          const match = brands.find(function (b) {
            return b.id === brand.id;
          });
          if (match) return match;
        }
        if (brand && brand.brand_unique_id) {
          const matchU = brands.find(function (b) {
            return b.brand_unique_id === brand.brand_unique_id;
          });
          if (matchU) return matchU;
        }
        if (request && request.brand_unique_id) {
          const matchR = brands.find(function (b) {
            return b.brand_unique_id === request.brand_unique_id;
          });
          if (matchR) return matchR;
        }
        if (brands.length === 1) return brands[0];
      } catch (err) {
        console.error(err);
      }
    }

    return brand && brand.brand_name ? brand : null;
  }

  function showActionPopup(opts) {
    if (typeof window.bbShowSyncPopup !== "function") {
      return Promise.resolve();
    }
    const result = window.bbShowSyncPopup(opts);
    return result && typeof result.then === "function" ? result : Promise.resolve();
  }

  function bindActions(getBrand, reload) {
    if (window.__bbBsActionsBound) return;
    window.__bbBsActionsBound = true;
    const api = window.BBBrandVerification;

    document.addEventListener("click", async function (e) {
      const btn = e.target.closest("#bbBsBrandBar [data-bs-action]");
      if (!btn) return;
      const brand = typeof getBrand === "function" ? getBrand() : getBrand;
      if (!brand || !brand.id) return;
      const logoSrc = brand.logo_light_url || brand.logo_dark_url || "brandbased-logo.svg";
      if (!btn || !api) return;
      const action = btn.getAttribute("data-bs-action");
      const brandName = brand.brand_name || "Brand";

      if (action === "publish") {
        try {
          const popup = showActionPopup({
            label: "Publishing",
            barColor: "#635bff",
            logoSrc: logoSrc,
            shineLabel: true,
            duration: 2800,
            doneHoldMs: 1200,
          });
          const updated = await api.publishBrand(brand.id);
          brand.is_published = updated.is_published;
          saveSelectedBrand(brand);
          await popup;
          await reload();
        } catch (err) {
          alert(err.message || "Unable to publish brand.");
        }
        return;
      }

      if (action === "unpublish") {
        try {
          const popup = showActionPopup({
            label: "Unpublishing...",
            barColor: "#635bff",
            logoSrc: logoSrc,
            shineLabel: true,
            duration: 2800,
            doneHoldMs: 1200,
          });
          const updated = await api.unpublishBrand(brand.id);
          brand.is_published = updated.is_published;
          saveSelectedBrand(brand);
          await popup;
          await reload();
        } catch (err) {
          alert(err.message || "Unable to unpublish brand.");
        }
        return;
      }

      if (action === "delete") {
        const ok = window.confirm(
          "Delete “" + brandName + "”? This removes it from your brands list. History is kept."
        );
        if (!ok) return;
        try {
          const popup = showActionPopup({
            label: "Deleting",
            barColor: "#e74c3c",
            logoSrc: logoSrc,
            shineLabel: true,
            duration: 2800,
            doneHoldMs: 1500,
          });
          await api.deleteBrand(brand.id);
          try {
            localStorage.removeItem(LS_SELECTED_BRAND);
            const raw = localStorage.getItem(LS_CURRENT_REQUEST);
            if (raw) {
              const stored = JSON.parse(raw);
              if (
                stored.brand_unique_id &&
                brand.brand_unique_id &&
                stored.brand_unique_id === brand.brand_unique_id
              ) {
                localStorage.removeItem(LS_CURRENT_REQUEST);
              }
            }
          } catch (_e) { /* ignore */ }
          await popup;
          window.location.href = BRANDS_URL;
        } catch (err) {
          alert(err.message || "Unable to delete brand.");
        }
      }
    });
  }

  let activeBrand = null;

  async function hydrateBrand(brand) {
    activeBrand = brand;
    const empty = document.getElementById("bbBsNoBrand");
    const layout = document.querySelector(".bb-bs-layout");
    if (empty) empty.hidden = true;
    if (layout) layout.hidden = false;

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
      const fresh = await resolveBrand();
      if (!fresh || !fresh.id) {
        showNoBrandState();
        return;
      }
      await hydrateBrand(fresh);
    };

    bindActions(function () {
      return activeBrand;
    }, reload);

    const brand = await resolveBrand();
    if (!brand || !brand.id) {
      showNoBrandState();
      return;
    }

    await hydrateBrand(brand);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
