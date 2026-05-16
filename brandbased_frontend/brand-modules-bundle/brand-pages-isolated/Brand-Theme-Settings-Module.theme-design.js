/**
 * Brand Theme Settings — theme-design JS bundle (reserved).
 * Page logic lives in Brand-Theme-Settings-Module.html inline scripts + bb-theme-gallery-uploads.js + bb-smart-ui.
 */

(() => {
  const ACTIVE_SLOT_KEY = "bbProducts:activeSlot:v1";
  const PRODUCT_SLOTS = 7;
  const INTRO_MS = 2000;
  const SOURCE_ID = `theme-design:${Math.random().toString(16).slice(2)}`;

  // Cross-page realtime sync (Theme Design ↔ Products) on same origin.
  const Sync = (() => {
    try {
      const ch = new BroadcastChannel("bb-theme-products-sync");
      return {
        post: (msg) => {
          try {
            ch.postMessage(msg);
          } catch {}
        },
        on: (fn) => {
          try {
            ch.addEventListener("message", (e) => fn(e?.data));
          } catch {}
        },
      };
    } catch {
      return { post: () => {}, on: () => {} };
    }
  })();

  // Storage-based sync "heartbeat" (works even when BroadcastChannel is flaky or when navigating).
  // Also stores the last event so we can react precisely (prevents UI "blink").
  const SYNC_VERSION_KEY = "bbSync:version:v1";
  const SYNC_EVENT_KEY = "bbSync:lastEvent:v1";
  const bumpSync = (evt) => {
    try {
      const cur = Number(localStorage.getItem(SYNC_VERSION_KEY) || "0") || 0;
      localStorage.setItem(SYNC_VERSION_KEY, String(cur + 1));
    } catch {}
    if (evt && typeof evt === "object") {
      try {
        localStorage.setItem(SYNC_EVENT_KEY, JSON.stringify({ ...evt, src: SOURCE_ID, t: Date.now() }));
      } catch {}
    }
  };

  // Theme Design persists its live preview in these keys (from inline scripts in Brand-Theme-Settings-Module.html).
  // We scope them per theme number, so Theme 4 settings map to Product 4.
  const THEME_KEYS = [
    "bbTheme:accent:v1",
    "bbTheme:recentColours:v1",
    "bbTheme:background:v1",
    "bbTheme:video:v1",
    "bbTheme:customBgPersist:v1",
    "bbTheme:buyNowLabel:v1",
    "bbTheme:typography:v1",
    "bbTheme:adsPreview:v1",
    "bbTheme:adminGallery:v1",
  ];
  const scopedKey = (baseKey, themeIdx) => `${baseKey}:themeSlot:${themeIdx}:v1`;
  let _defaultSnapshot = null;
  let _isHydrating = false;
  let _activeSlot = 0;

  // Slot-isolated theme persistence:
  // The protected Theme Design HTML writes theme settings into base keys like `bbTheme:video:v1`.
  // To make themes 1–7 truly independent (especially Dynamic Themes like videos/custom bg),
  // we virtualize those keys so reads/writes transparently redirect to `...:themeSlot:<n>:v1`.
  const _ls = {
    getItem: localStorage.getItem.bind(localStorage),
    setItem: localStorage.setItem.bind(localStorage),
    removeItem: localStorage.removeItem.bind(localStorage),
  };
  const _ss = {
    getItem: sessionStorage.getItem.bind(sessionStorage),
    setItem: sessionStorage.setItem.bind(sessionStorage),
    removeItem: sessionStorage.removeItem.bind(sessionStorage),
  };
  const isThemeKey = (k) => THEME_KEYS.includes(String(k || ""));
  const installThemeStorageShim = () => {
    if (localStorage.__bbThemeSlotShimInstalled) return;
    localStorage.__bbThemeSlotShimInstalled = true;
    try {
      localStorage.getItem = (k) => {
        if (isThemeKey(k)) return _ls.getItem(scopedKey(k, _activeSlot));
        return _ls.getItem(k);
      };
      localStorage.setItem = (k, v) => {
        if (isThemeKey(k)) return _ls.setItem(scopedKey(k, _activeSlot), String(v));
        return _ls.setItem(k, String(v));
      };
      localStorage.removeItem = (k) => {
        if (isThemeKey(k)) return _ls.removeItem(scopedKey(k, _activeSlot));
        return _ls.removeItem(k);
      };
    } catch {}
  };

  const SESSION_THEME_KEYS = ["bbTheme:customBgSession:v1"];
  const isSessionThemeKey = (k) => SESSION_THEME_KEYS.includes(String(k || ""));
  const scopedSessionKey = (baseKey, themeIdx) => `${baseKey}:themeSlot:${themeIdx}:v1`;
  const isBadBlobUrl = (u) => {
    const s = String(u || "");
    return s.startsWith("blob:null") || s.startsWith("blob:null/");
  };
  const sanitizeCustomBgSessionPayload = (raw) => {
    try {
      if (!raw) return null;
      const o = JSON.parse(raw);
      const kind = String(o?.kind || "").trim();
      const dataUrl = String(o?.dataUrl || "").trim();
      if (!dataUrl || isBadBlobUrl(dataUrl)) return null;
      if (kind !== "image" && kind !== "video") return null;
      return JSON.stringify({ kind, dataUrl });
    } catch {
      return null;
    }
  };
  const installThemeSessionShim = () => {
    if (sessionStorage.__bbThemeSlotShimInstalled) return;
    sessionStorage.__bbThemeSlotShimInstalled = true;
    try {
      sessionStorage.getItem = (k) => {
        if (isSessionThemeKey(k)) {
          const scoped = scopedSessionKey(k, _activeSlot);
          const raw = _ss.getItem(scoped);
          const clean = sanitizeCustomBgSessionPayload(raw);
          if (!clean && raw) {
            try {
              _ss.removeItem(scoped);
            } catch {}
          }
          return clean;
        }
        return _ss.getItem(k);
      };
      sessionStorage.setItem = (k, v) => {
        if (isSessionThemeKey(k)) {
          const scoped = scopedSessionKey(k, _activeSlot);
          const clean = sanitizeCustomBgSessionPayload(String(v));
          if (!clean) return _ss.removeItem(scoped);
          return _ss.setItem(scoped, clean);
        }
        return _ss.setItem(k, String(v));
      };
      sessionStorage.removeItem = (k) => {
        if (isSessionThemeKey(k)) return _ss.removeItem(scopedSessionKey(k, _activeSlot));
        return _ss.removeItem(k);
      };
    } catch {}
  };

  // Initialize active slot as early as possible (this file runs as a deferred script).
  try {
    _activeSlot = clampSlot(_ls.getItem(ACTIVE_SLOT_KEY));
  } catch {
    _activeSlot = 0;
  }
  installThemeStorageShim();
  installThemeSessionShim();

  const clampSlot = (n) => {
    const i = Number(n);
    if (!Number.isFinite(i)) return 0;
    return Math.max(0, Math.min(PRODUCT_SLOTS - 1, i));
  };

  const readActiveSlot = () => {
    return _activeSlot;
  };

  const writeActiveSlot = (i) => {
    const next = clampSlot(i);
    _activeSlot = next;
    try {
      localStorage.setItem(ACTIVE_SLOT_KEY, String(next));
    } catch {}
    Sync.post({ type: "activeSlotChanged", idx: next, src: SOURCE_ID });
    bumpSync({ type: "activeSlotChanged", idx: next });
  };

  const getRaw = (k) => {
    try {
      // Read via the shim for base theme keys; for scoped keys it's a normal lookup.
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  };
  const setRaw = (k, v) => {
    try {
      if (v == null) localStorage.removeItem(k);
      else localStorage.setItem(k, String(v));
    } catch {}
  };

  const saveThemeToSlot = (idx) => {
    THEME_KEYS.forEach((k) => {
      setRaw(scopedKey(k, idx), getRaw(k));
    });
    Sync.post({ type: "themeSlotSaved", idx, src: SOURCE_ID });
    bumpSync({ type: "themeSlotSaved", idx });
  };

  const hasThemeSlotSnapshot = (idx) => {
    // A slot is considered initialized once it has any of the scoped keys.
    return THEME_KEYS.some((k) => getRaw(scopedKey(k, idx)) != null);
  };

  const initThemeSlotFromDefaults = (idx) => {
    if (!_defaultSnapshot) return;
    THEME_KEYS.forEach((k) => {
      const v = _defaultSnapshot[k];
      // Important: write explicit null removals too (keeps slots from "bleeding" old base keys)
      setRaw(scopedKey(k, idx), v);
    });
  };

  const applySlotThemeToBase = (idx) => {
    // Always apply a full snapshot (slot value if present; otherwise the default baseline).
    // This prevents slot switching from inheriting the previous slot's Dynamic Theme selection.
    THEME_KEYS.forEach((k) => {
      const scoped = getRaw(scopedKey(k, idx));
      if (scoped != null) {
        setRaw(k, scoped);
        return;
      }
      // Fall back to baseline (and remove if baseline is null).
      const def = _defaultSnapshot ? _defaultSnapshot[k] : null;
      setRaw(k, def);
    });
  };

  const setVal = (id, value, evtType) => {
    const el = document.getElementById(id);
    if (!el) return;
    try {
      if (el.type === "checkbox") el.checked = !!value;
      else el.value = String(value ?? "");
      // Trigger the same listeners the page already has.
      el.dispatchEvent(new Event(evtType || "input", { bubbles: true }));
      if (evtType !== "change") el.dispatchEvent(new Event("change", { bubbles: true }));
    } catch {}
  };

  const hydrateUiFromBaseTheme = () => {
    _isHydrating = true;
    // Read the live keys (which we just swapped) and reflect them into the left-panel controls.
    // This prevents Theme 1 UI values from "bleeding" into other theme slots.
    try {
      const a = JSON.parse(getRaw("bbTheme:accent:v1") || "null");
      if (a && typeof a === "object") {
        if (a.hex) {
          setVal("bbThemeColourPicker", a.hex, "input");
          const hex = String(a.hex || "").replace("#", "");
          setVal("bbThemeColourHex", hex, "input");
        }
        if ("on" in a) setVal("bbThemeAccentOn", !!a.on, "change");
        if ("alpha" in a) setVal("bbThemeAccentAlpha", a.alpha, "input");
        if ("alphaPct" in a) setVal("bbThemeAccentAlpha", a.alphaPct, "input");
      }
    } catch {}

    try {
      const bg = JSON.parse(getRaw("bbTheme:background:v1") || "null");
      if (bg && typeof bg === "object") {
        // Stored shape comes from Brand-Theme-Settings-Module.html `write(...)`:
        // { on, blend, backdropTint, backdropOpacity, ... }
        if ("on" in bg) setVal("bbThemeBackgroundOn", !!bg.on, "change");
        if ("backdropTint" in bg) setVal("bbBackdropTint", !!bg.backdropTint, "change");
        if (bg.backdropTintHex) setVal("bbThemeBackdropTintColour", bg.backdropTintHex, "input");
        if ("backdropOpacity" in bg) setVal("bbThemeBackdropOpacity", bg.backdropOpacity, "input");
        if ("blend" in bg) setVal("bbBlendMode", !!bg.blend, "change");
        if (bg.contentColorHex) setVal("bbThemeContentColour", bg.contentColorHex, "input");
        if (bg.productTitleColorHex) setVal("bbThemeProductTitleColour", bg.productTitleColorHex, "input");
        if (bg.brandIconFillHex) setVal("bbThemeBrandIconFillColour", bg.brandIconFillHex, "input");
        if (bg.brandIconBorderHex) setVal("bbThemeBrandIconOutlineColour", bg.brandIconBorderHex, "input");
        if ("brandIconFillOpacity" in bg) setVal("bbThemeBrandIconFillOpacity", bg.brandIconFillOpacity, "input");
        if (bg.lockLogoHex) setVal("bbThemeLockLogoColour", bg.lockLogoHex, "input");
        if (bg.exploreIconHex) setVal("bbThemeExploreIconColour", bg.exploreIconHex, "input");
        if (bg.buyButtonBgHex) setVal("bbThemeBuyButtonColour", bg.buyButtonBgHex, "input");
        if (bg.buyButtonLabelHex) setVal("bbThemeBuyButtonLabelColour", bg.buyButtonLabelHex, "input");
      }
    } catch {}

    try {
      const ty = JSON.parse(getRaw("bbTheme:typography:v1") || "null");
      if (ty && typeof ty === "object") {
        if (ty.family) setVal("bbThemePopupFontFamily", ty.family, "change");
        if (ty.weight) setVal("bbThemePopupFontWeight", ty.weight, "change");
        if ("italic" in ty) setVal("bbThemePopupFontItalic", !!ty.italic, "change");
      }
    } catch {}

    try {
      const ads = JSON.parse(getRaw("bbTheme:adsPreview:v1") || "null");
      if (ads && typeof ads === "object" && "enabled" in ads) {
        setVal("bbThemeAdsEnabled", !!ads.enabled, "change");
      }
    } catch {}

    // Buy button label (not part of the original theme state; we persist it per theme slot).
    try {
      const v = String(getRaw("bbTheme:buyNowLabel:v1") || "").trim();
      setVal("bbThemeBuyNowLabel", v || "Buy Now", "input");
    } catch {}

    // Let the page's own listeners settle before we allow autosave again.
    window.setTimeout(() => {
      _isHydrating = false;
    }, 180);
  };

  const switchThemeSlot = (nextIdx) => {
    const prev = clampSlot(readActiveSlot());
    const next = clampSlot(nextIdx);
    if (next === prev) return;
    // Prevent autosave during the switch (avoids Theme 1 being overwritten by Theme 2 edits).
    _isHydrating = true;
    // Save current theme settings into the previous slot, then load the new slot into the live keys.
    saveThemeToSlot(prev);
    if (!hasThemeSlotSnapshot(next)) initThemeSlotFromDefaults(next);
    writeActiveSlot(next);
    // Avoid dynamic bg DOM state "sticking" across slots (custom upload / video).
    try {
      const popup = document.querySelector("#bbThemePopupMount .popup") || document.querySelector(".popup");
      if (popup) {
        popup.classList.remove("bb-theme-custom-upload");
        popup.classList.remove("bb-theme-video-on");
        popup.classList.remove("bb-theme-bg-on");
        const vEl = popup.querySelector(".bb-theme-video-bg");
        if (vEl) {
          try { vEl.pause?.(); } catch {}
          try { vEl.removeAttribute("src"); vEl.load?.(); } catch {}
        }
        const blur = popup.querySelector(".blur-bg");
        if (blur) {
          blur.style.removeProperty("background-image");
          blur.style.removeProperty("background-color");
        }
      }
    } catch {}
    applySlotThemeToBase(next);
    hydrateUiFromBaseTheme();
    animateFlip();
    syncPopupGalleryFromSlotWhenReady();
    syncPopupProductFieldsFromSlot();
    syncUi();
    bumpSync({ type: "themeSlotApplied", idx: next });
  };

  const ensureControls = () => {
    const stage =
      document.querySelector(".bb-preview-stage") ||
      document.querySelector(".bb-bts-right--preview") ||
      document.body;
    if (!stage) return null;
    if (stage.__bbProductsPreviewControls) return stage.__bbProductsPreviewControls;

    const controls = document.createElement("div");
    controls.className =
      "bb-products-preview-controls bb-products-preview-controls--theme bb-products-preview-controls--intro";

    const pager = document.createElement("div");
    pager.className = "bb-products-modal-pager bb-products-modal-pager--below-stack";
    pager.setAttribute("aria-label", "Product pager (1 to 7)");

    for (let i = 0; i < PRODUCT_SLOTS; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "bb-products-modal-dot";
      b.textContent = String(i + 1);
      b.setAttribute("data-slot", String(i));
      b.setAttribute("aria-label", `Product ${i + 1}`);
      b.addEventListener("click", () => {
        switchThemeSlot(i);
      });
      pager.appendChild(b);
    }

    const pill = document.createElement("p");
    pill.className = "bb-products-preview-pill";
    pill.setAttribute("role", "status");
    pill.setAttribute("aria-live", "polite");

    controls.appendChild(pager);
    controls.appendChild(pill);
    stage.appendChild(controls);
    stage.__bbProductsPreviewControls = controls;
    return controls;
  };

  const ensureLeftPill = () => {
    const card = document.querySelector(".bb-bts-left .bb-bts-card");
    if (!card) return null;
    if (card.__bbThemeLeftPill) return card.__bbThemeLeftPill;
    const pill = document.createElement("p");
    pill.className = "bb-theme-slot-pill";
    pill.setAttribute("role", "status");
    pill.setAttribute("aria-live", "polite");
    card.appendChild(pill);
    card.__bbThemeLeftPill = pill;
    return pill;
  };

  const pulse = (pillEl) => {
    if (!pillEl) return;
    try {
      window.clearTimeout(pillEl.__bbThemeTickClear);
    } catch {}
    try {
      pillEl.classList.remove("bb-products-preview-pill--tick");
      void pillEl.offsetWidth;
      pillEl.classList.add("bb-products-preview-pill--tick");
      pillEl.__bbThemeTickClear = window.setTimeout(() => {
        try {
          pillEl.classList.remove("bb-products-preview-pill--tick");
        } catch {}
      }, 900);
    } catch {}
  };

  let _lastIdx = -1;
  const syncUi = () => {
    const controls = ensureControls();
    if (!controls) return;
    const idx = readActiveSlot();
    controls.querySelectorAll("button[data-slot]").forEach((b) => {
      const i = clampSlot(b.getAttribute("data-slot"));
      b.classList.toggle("bb-products-modal-dot--active", i === idx);
    });
    const pill = controls.querySelector(".bb-products-preview-pill");
    if (pill) pill.textContent = `You're previewing Theme ${idx + 1}`;

    const left = ensureLeftPill();
    if (left) left.textContent = `Theme ${idx + 1}`;

    if (idx !== _lastIdx) {
      _lastIdx = idx;
      pulse(pill);
    }
  };

  const getPopup = () =>
    document.querySelector("#bbThemePopupMount .popup") || document.querySelector(".popup");

  const showZoomToast = () => {
    const popup = getPopup();
    if (!popup) return;
    const host = popup.querySelector(".product-element") || popup;
    let toast = host.querySelector(".bb-theme-preview-zoom-toast");
    if (!toast) {
      toast = document.createElement("p");
      toast.className = "bb-theme-preview-zoom-toast";
      toast.textContent = "Zoom gallery opens on your live popup";
      host.appendChild(toast);
    }
    toast.classList.add("bb-theme-preview-zoom-toast--show");
    window.clearTimeout(toast.__bbHideT);
    toast.__bbHideT = window.setTimeout(() => {
      toast.classList.remove("bb-theme-preview-zoom-toast--show");
    }, 2600);
  };

  const bindZoomToastOnce = () => {
    const popup = getPopup();
    if (!popup || popup.__bbThemeZoomToastBound) return;
    popup.__bbThemeZoomToastBound = true;

    const onClick = (e) => {
      const t = e?.target;
      if (!(t instanceof Element)) return;
      if (t.closest("img,video,.swiper-slide")) showZoomToast();
    };

    // Bubble from either carousel.
    try {
      popup.querySelector(".swiper-thumb")?.addEventListener("click", onClick);
    } catch {}
    try {
      popup.querySelector(".slider-close-up-swiper")?.addEventListener("click", onClick);
    } catch {}
  };

  // Read persisted product media (saved on Products page) and inject into the preview popup gallery.
  const MediaStore = (() => {
    const DB_NAME = "bb-products-media-v1";
    const STORE = "media";
    const URL_CACHE = new Map(); // id -> objectUrl

    const open = () =>
      new Promise((resolve, reject) => {
        try {
          const req = indexedDB.open(DB_NAME, 1);
          req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) {
              db.createObjectStore(STORE, { keyPath: "id" });
            }
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        } catch (e) {
          reject(e);
        }
      });

    const get = async (id) => {
      const db = await open();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        tx.onerror = () => reject(tx.error);
        const req = tx.objectStore(STORE).get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    };

    const getObjectUrl = async (id) => {
      if (!id) return null;
      if (URL_CACHE.has(id)) return URL_CACHE.get(id);
      const rec = await get(id);
      if (!rec?.blob) return null;
      const url = URL.createObjectURL(rec.blob);
      URL_CACHE.set(id, url);
      return url;
    };

    return { getObjectUrl };
  })();

  const MAX_VARIANT_GROUPS_PV = 3;
  const MAX_PREVIEW_QTY_PV = 99;
  const fmtMoneySymPv = (ccy, amt) => {
    const c = String(ccy || "").trim().toUpperCase();
    const n = String(amt || "").trim();
    if (!n) return "";
    const sym =
      c === "USD"
        ? "US$"
        : c === "AUD"
          ? "A$"
          : c === "EUR"
            ? "€"
            : c === "GBP"
              ? "£"
              : c === "CA" || c === "CAD"
                ? "CA$"
                : `${c} `;
    return `${sym}${n}`;
  };
  const normalizeVariantGroupsPv = (rows) => {
    if (!Array.isArray(rows)) return [];
    return rows.slice(0, MAX_VARIANT_GROUPS_PV).map((r) => {
      const name = String(r?.name || "").trim();
      const options = Array.isArray(r?.options)
        ? r.options
            .map((o) => ({
              label: String(o?.label || "").trim(),
              price: String(o?.price != null ? o.price : "").trim(),
            }))
            .filter((o) => o.label)
        : [];
      return { name, options };
    });
  };
  const migrateVariantsFromObjPv = (o) => {
    if (!o || typeof o !== "object") return [];
    if ("variants" in o && Array.isArray(o.variants)) return normalizeVariantGroupsPv(o.variants);
    const vn = String(o.variantName || "").trim();
    const parts = String(o.variantOptions || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    if (vn && parts.length)
      return normalizeVariantGroupsPv([
        { name: vn, options: parts.map((label) => ({ label, price: "" })) },
      ]);
    return [];
  };
  const readEffectivePriceFromSelectorsPv = (popup) => {
    try {
      const selects = [
        ...(popup?.querySelectorAll?.(
          ".selectors-row select:not(.bb-products-fixed-qty-select)"
        ) || []),
      ];
      let lastTier = "";
      for (let i = 0; i < selects.length; i++) {
        const sel = selects[i];
        if (!sel || sel.classList.contains("bb-products-variant-select--hidden")) continue;
        const idx = sel.selectedIndex;
        if (idx < 0) continue;
        const opt = sel.options[idx];
        if (!opt || opt.disabled) continue;
        const raw = String(opt.getAttribute("data-bb-variant-price") ?? "").trim();
        if (raw === "") continue;
        const n = Number.parseFloat(raw.replace(",", "."));
        if (Number.isFinite(n)) lastTier = raw;
      }
      return lastTier;
    } catch {}
    return "";
  };
  const coerceVariantDraftPv = (d) => ({
    label: String(d?.label ?? ""),
    price: String(d?.price != null ? d.price : ""),
  });

  /** Same merge as Products page: drafts from “Add value / Price” rows appear in docked preview. */
  const mergeVariantsWithDraftsPv = (variants, drafts) => {
    const raw = normalizeVariantGroupsPv(Array.isArray(variants) ? variants : []);
    const darr = Array.isArray(drafts) ? drafts : [];
    const out = [];
    for (let gi = 0; gi < Math.min(MAX_VARIANT_GROUPS_PV, raw.length); gi++) {
      const g = raw[gi];
      const name = String(g?.name || "").trim();
      const baseOpts = Array.isArray(g?.options)
        ? g.options
            .map((o) => ({
              label: String(o?.label || "").trim(),
              price: String(o?.price != null ? o.price : "").trim(),
            }))
            .filter((o) => o.label)
        : [];
      const d = coerceVariantDraftPv(darr[gi] || {});
      const dl = String(d.label || "").trim();
      const dp = String(d.price || "").trim();
      const opts = [...baseOpts];
      if (dl && !opts.some((o) => o.label === dl)) opts.push({ label: dl, price: dp });
      out.push({ name, options: opts });
    }
    return out.filter(
      (g) =>
        g.name &&
        Array.isArray(g.options) &&
        g.options.some((o) => String(o?.label || "").trim())
    );
  };

  const variantRowsForProductPv = (s) =>
    mergeVariantsWithDraftsPv(s?.variants, s?.variantAddDrafts);

  const SLOT_KEY = (i) => `bbProducts:slot:${i}:v1`;
  const normalizeVariantSelectionsPv = (v) => {
    const a = Array.isArray(v) ? v.map((x) => String(x ?? "")) : [];
    while (a.length < 3) a.push("");
    return a.slice(0, 3);
  };
  const persistSlotVariantSelectionsPv = (idx, variantSelections) => {
    try {
      const raw = localStorage.getItem(SLOT_KEY(idx));
      if (!raw) return;
      const o = JSON.parse(raw);
      if (!o || typeof o !== "object") return;
      o.variantSelections = normalizeVariantSelectionsPv(variantSelections);
      localStorage.setItem(SLOT_KEY(idx), JSON.stringify(o));
      bumpSync({ type: "productSlotUpdated", idx });
    } catch {}
  };
  const persistSlotPreviewQtyPv = (idx, previewQty) => {
    try {
      const raw = localStorage.getItem(SLOT_KEY(idx));
      if (!raw) return;
      const o = JSON.parse(raw);
      if (!o || typeof o !== "object") return;
      o.previewQty = String(previewQty || "");
      localStorage.setItem(SLOT_KEY(idx), JSON.stringify(o));
      bumpSync({ type: "productSlotUpdated", idx });
    } catch {}
  };
  const persistSlotQtyUnlockedPv = (idx, qtyUnlocked) => {
    try {
      const raw = localStorage.getItem(SLOT_KEY(idx));
      if (!raw) return;
      const o = JSON.parse(raw);
      if (!o || typeof o !== "object") return;
      o.qtyUnlocked = !!qtyUnlocked;
      localStorage.setItem(SLOT_KEY(idx), JSON.stringify(o));
      bumpSync({ type: "productSlotUpdated", idx });
    } catch {}
  };
  const readSlot = (i) => {
    try {
      const raw = localStorage.getItem(SLOT_KEY(i));
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (!o || typeof o !== "object") return null;
      return {
        name: String(o.name || ""),
        desc: String(o.desc || ""),
        price: String(o.price || ""),
        currency: String(o.currency || "USD"),
        inv: String(o.inv || ""),
        invUnlimited: !!o.invUnlimited,
        ship: String(o.ship || ""),
        region: String(o.region || ""),
        variants: migrateVariantsFromObjPv(o),
        variantSelections: normalizeVariantSelectionsPv(o.variantSelections),
        previewQty: String(o.previewQty != null ? o.previewQty : "1"),
        qtyUnlocked: !!o.qtyUnlocked,
        allowQtyChoice: o.allowQtyChoice !== false,
        showAvailScarcity: !!o.showAvailScarcity,
        variantAddDrafts: Array.isArray(o.variantAddDrafts)
          ? o.variantAddDrafts.map((d) => coerceVariantDraftPv(d))
          : [],
        media: Array.isArray(o.media) ? o.media : [],
      };
    } catch {
      return null;
    }
  };
  const readSlotMedia = (i) => {
    try {
      const media = readSlot(i)?.media || [];
      return media
        .map((m) => {
          const kind = m?.kind === "video" ? "video" : "image";
          const id = typeof m?.id === "string" ? m.id : "";
          const url = typeof m?.url === "string" ? m.url : "";
          if (id) return { kind, id, url: "" };
          if (url) return { kind, id: "", url };
          return null;
        })
        .filter(Boolean);
    } catch {
      return [];
    }
  };

  const renderDescriptionToPopupPv = (popup, rawText) => {
    const host = popup?.querySelector?.(".product-description");
    if (!host) return;
    const v = String(rawText || "");
    const trimmed = v.trim();
    if (!trimmed) {
      host.textContent = "Every product has a story… (add a description on the left to preview it here)";
      return;
    }
    const paras = v
      .split(/\n\s*\n+/g)
      .map((p) => p.replace(/\s+$/g, "").trim())
      .filter(Boolean);
    if (paras.length <= 1) {
      host.textContent = trimmed;
      return;
    }
    host.innerHTML = "";
    paras.forEach((t) => {
      const p = document.createElement("p");
      p.textContent = t;
      host.appendChild(p);
    });
  };

  const syncPopupGalleryFromSlot = async () => {
    const popup = getPopup();
    if (!popup) return;
    const idx = readActiveSlot();
    const list = readSlotMedia(idx);
    const hydrated = [];
    for (const m of list) {
      if (m.url) hydrated.push(m);
      else if (m.id) {
        try {
          const url = await MediaStore.getObjectUrl(m.id);
          if (url) hydrated.push({ kind: m.kind, url });
        } catch {}
      }
    }
    const finalList = hydrated.length ? hydrated : [{ kind: "image", url: "BB-Product-Image-Placeholder.svg" }];
    const thumbWrap = popup.querySelector(".swiper-thumb .swiper-wrapper");
    const closeWrap = popup.querySelector(".slider-close-up-swiper .swiper-wrapper");
    const fill = (wrap) => {
      if (!wrap) return;
      wrap.innerHTML = "";
      finalList.forEach((m) => {
        const slide = document.createElement("div");
        slide.className = "swiper-slide";
        if (m.kind === "video") {
          const v = document.createElement("video");
          v.src = m.url;
          v.muted = true;
          v.loop = true;
          v.playsInline = true;
          v.autoplay = true;
          v.preload = "metadata";
          slide.appendChild(v);
        } else {
          const img = document.createElement("img");
          img.src = m.url;
          img.alt = "";
          img.decoding = "async";
          slide.appendChild(img);
        }
        wrap.appendChild(slide);
      });
    };
    fill(thumbWrap);
    fill(closeWrap);
    try {
      popup.querySelector(".swiper-thumb")?.swiper?.updateSlides?.();
      popup.querySelector(".swiper-thumb")?.swiper?.update?.();
      popup.querySelector(".slider-close-up-swiper")?.swiper?.updateSlides?.();
      popup.querySelector(".slider-close-up-swiper")?.swiper?.update?.();
    } catch {}
  };

  const syncPopupGalleryFromSlotWhenReady = () => {
    let tries = 0;
    const id = window.setInterval(() => {
      tries += 1;
      const popup = getPopup();
      const ok =
        !!popup &&
        !!popup.querySelector(".swiper-thumb .swiper-wrapper") &&
        !!popup.querySelector(".slider-close-up-swiper .swiper-wrapper");
      if (ok) {
        window.clearInterval(id);
        syncPopupGalleryFromSlot();
        bindZoomToastOnce();
        return;
      }
      if (tries > 60) window.clearInterval(id);
    }, 250);
  };

  const syncPopupProductFieldsFromSlot = () => {
    const popup = getPopup();
    if (!popup) return;
    const idx = readActiveSlot();

    try {
      const variantNodes = [
        ...popup.querySelectorAll(".selectors-row select:not(.bb-products-fixed-qty-select)"),
      ];
      const vs = ["", "", ""];
      for (let kk = 0; kk < 3; kk++) {
        const node = variantNodes[kk];
        if (!node || node.classList.contains("bb-products-variant-select--hidden")) vs[kk] = "";
        else vs[kk] = String(node.value || "");
      }
      persistSlotVariantSelectionsPv(idx, vs);
      const qtySnap = popup.querySelector(".bb-products-fixed-qty-select");
      if (qtySnap && !qtySnap.disabled) {
        const v = String(qtySnap.value || "").trim();
        if (v) persistSlotPreviewQtyPv(idx, v);
      }
    } catch {}

    const s = readSlot(idx);
    if (!s) return;

    const titleEl = popup.querySelector(".product-title");
    if (titleEl) titleEl.textContent = s.name.trim() || "Product Display Name";

    renderDescriptionToPopupPv(popup, s.desc);

    const s1 = popup.querySelector(".selectors-row select:nth-child(1)");
    const s2 = popup.querySelector(".selectors-row select:nth-child(2)");
    const s3 = popup.querySelector(".selectors-row select:nth-child(3)");
    const selects = [s1, s2, s3].filter(Boolean);

    const currency = (s.currency || "USD").trim() || "USD";
    const rows = variantRowsForProductPv(s);
    try {
      popup.__bbVariantCount = rows.length;
    } catch {}

    for (let k = 0; k < 3; k++) {
      const sel = selects[k];
      if (!sel) continue;
      sel.classList.add("bb-products-variant-select");
      const hidden = k >= rows.length;
      sel.classList.toggle("bb-products-variant-select--hidden", hidden);
      try {
        if (hidden) sel.setAttribute("aria-hidden", "true");
        else sel.removeAttribute("aria-hidden");
      } catch {}
      if (hidden) {
        sel.innerHTML = "";
        const ph = document.createElement("option");
        ph.value = "";
        ph.textContent = "";
        sel.appendChild(ph);
        continue;
      }
      const g = rows[k];
      sel.innerHTML = "";
      const ph = document.createElement("option");
      ph.value = "";
      ph.textContent = g.name.trim() ? `Select ${g.name.trim()}` : "Select…";
      ph.disabled = true;
      ph.selected = true;
      sel.appendChild(ph);
      for (const o of g.options) {
        const lab = String(o.label || "").trim();
        if (!lab) continue;
        const opt = document.createElement("option");
        const pStr = String(o.price || "").trim();
        opt.value = lab;
        opt.textContent = pStr !== "" ? `${lab} · ${fmtMoneySymPv(currency, pStr)}` : lab;
        if (pStr !== "") opt.setAttribute("data-bb-variant-price", pStr);
        sel.appendChild(opt);
      }
      const vsSaved = normalizeVariantSelectionsPv(s.variantSelections);
      const want = String(vsSaved[k] || "").trim();
      if (want && [...sel.options].some((o) => o.value === want && !o.disabled)) {
        sel.value = want;
      } else {
        sel.selectedIndex = 0;
      }
    }

    const persistPreviewVariantPicks = () => {
      const selNodes = [
        ...popup.querySelectorAll(".selectors-row select:not(.bb-products-fixed-qty-select)"),
      ];
      const vs = ["", "", ""];
      for (let kk = 0; kk < 3; kk++) {
        const node = selNodes[kk];
        if (!node || node.classList.contains("bb-products-variant-select--hidden")) vs[kk] = "";
        else vs[kk] = String(node.value || "");
      }
      persistSlotVariantSelectionsPv(idx, vs);
      const qn = popup.querySelector(".bb-products-fixed-qty-select");
      if (qn && !qn.disabled) {
        const v = String(qn.value || "").trim();
        if (v) persistSlotPreviewQtyPv(idx, v);
      }
    };

    const refreshThemeBuyInline = () => {
      try {
        const buyBtn = popup.querySelector(".buy-now-button");
        if (!buyBtn) return;
        const sd = readSlot(readActiveSlot());
        if (!sd) return;
        const unlimited = !!sd.invUnlimited;
        const invRaw = String(sd.inv || "").trim();
        const invNum = invRaw === "" ? NaN : Number.parseInt(invRaw, 10);
        const soldOut = !unlimited && (!invRaw || !Number.isFinite(invNum) || invNum <= 0);
        const showAvailInline =
          !!sd.showAvailScarcity &&
          !unlimited &&
          Number.isFinite(invNum) &&
          invNum > 0 &&
          !soldOut;

        try {
          buyBtn.closest(".buy-now-row")?.querySelectorAll(".bb-products-scarcity-pill").forEach((n) => n.remove());
        } catch {}
        try {
          buyBtn.closest(".buy-now-row")?.classList.remove("bb-products-buy-now-row--stacked");
        } catch {}

        let labelEl = buyBtn.querySelector(".bb-products-buy-now-label");
        let buyPriceBit = buyBtn.querySelector(".bb-products-buy-now-price");
        let availBit = buyBtn.querySelector(".bb-products-buy-now-avail");
        if (!labelEl) {
          labelEl = document.createElement("span");
          labelEl.className = "bb-products-buy-now-label";
          const txt = String(buyBtn.textContent || "").trim() || "Buy Now";
          labelEl.textContent = txt;
          labelEl.setAttribute("data-bb-default-buy-label", txt);
          buyBtn.textContent = "";
          buyBtn.appendChild(labelEl);
        }
        if (!buyPriceBit) {
          buyPriceBit = document.createElement("span");
          buyPriceBit.className = "bb-products-buy-now-price";
          buyBtn.appendChild(buyPriceBit);
        }
        if (!availBit) {
          availBit = document.createElement("span");
          availBit.className = "bb-products-buy-now-avail";
          buyBtn.appendChild(availBit);
        }

        if (soldOut) {
          labelEl.textContent = "SOLD OUT";
          buyPriceBit.textContent = "";
          buyPriceBit.style.display = "none";
          availBit.textContent = "";
          availBit.style.display = "none";
          buyBtn.classList.add("bb-products-buy-now--sold-out");
          buyBtn.setAttribute("aria-disabled", "true");
        } else {
          buyBtn.classList.remove("bb-products-buy-now--sold-out");
          buyBtn.removeAttribute("aria-disabled");
          if (labelEl.textContent === "SOLD OUT") {
            const def =
              labelEl.getAttribute("data-bb-default-buy-label") || "Buy Now";
            labelEl.textContent = def;
          }
          const cur = (sd.currency || "USD").trim() || "USD";
          const base = sd.price.trim();
          const tier = readEffectivePriceFromSelectorsPv(popup);
          const amt = tier !== "" ? String(tier).trim() : base;
          const pretty = amt ? fmtMoneySymPv(cur, amt) : "";
          buyPriceBit.textContent = pretty ? `• ${pretty}` : "";
          buyPriceBit.style.display = pretty ? "inline" : "none";
          buyPriceBit.style.font = "inherit";
          buyPriceBit.style.fontWeight = "inherit";
          buyPriceBit.style.fontSize = "inherit";
          buyPriceBit.style.letterSpacing = "inherit";
          buyPriceBit.style.textTransform = "inherit";
          buyPriceBit.style.opacity = "1";
          buyPriceBit.style.whiteSpace = "nowrap";
          if (showAvailInline) {
            availBit.textContent = ` · ${invNum} available`;
            availBit.style.display = "inline";
          } else {
            availBit.textContent = "";
            availBit.style.display = "none";
          }
          availBit.style.font = "inherit";
          availBit.style.opacity = "0.82";
          availBit.style.fontWeight = "600";
          availBit.style.whiteSpace = "nowrap";
        }
        buyBtn.style.display = "inline-flex";
        buyBtn.style.alignItems = "center";
        buyBtn.style.justifyContent = "center";
        buyBtn.style.gap = "8px";
      } catch {}
    };

    const rowForQty = popup.querySelector(".selectors-row");
    let qtySel = rowForQty?.querySelector(".bb-products-fixed-qty-select");
    if (rowForQty && !qtySel) {
      qtySel = document.createElement("select");
      qtySel.className = "bb-products-fixed-qty-select";
      qtySel.setAttribute("aria-label", "Quantity");
      rowForQty.appendChild(qtySel);
    }
    if (qtySel && rowForQty) {
      const rs = readSlot(idx);
      const unlimited = !!(rs?.invUnlimited);
      const invRaw = String(rs?.inv || "").trim();
      const invNum = invRaw === "" ? NaN : Number.parseInt(invRaw, 10);
      const soldOut = !unlimited && (!invRaw || !Number.isFinite(invNum) || invNum <= 0);
      if (rs?.allowQtyChoice === false) {
        qtySel.classList.add("bb-products-fixed-qty-select--hidden");
        try {
          qtySel.setAttribute("aria-hidden", "true");
        } catch {}
        qtySel.innerHTML = "";
        qtySel.disabled = true;
      } else {
      let maxQ = MAX_PREVIEW_QTY_PV;
      if (!unlimited) {
        if (!Number.isFinite(invNum) || invNum <= 0) maxQ = 0;
        else maxQ = Math.min(invNum, MAX_PREVIEW_QTY_PV);
      }
      qtySel.innerHTML = "";
      const ph = document.createElement("option");
      ph.value = "";
      ph.disabled = true;
      ph.selected = false;
      if (soldOut || maxQ === 0) {
        qtySel.classList.add("bb-products-fixed-qty-select--hidden");
        try {
          qtySel.setAttribute("aria-hidden", "true");
        } catch {}
        qtySel.innerHTML = "";
        qtySel.disabled = true;
        persistSlotPreviewQtyPv(idx, "");
      } else {
        // If customer quantity choice is enabled, show QTY even when there are no variants.
        qtySel.classList.remove("bb-products-fixed-qty-select--hidden");
        try {
          qtySel.removeAttribute("aria-hidden");
        } catch {}
        const hasVariantsForLabel = Number(popup?.__bbVariantCount || 0) > 0;
        ph.textContent = hasVariantsForLabel ? "Qty" : "Select Qty";
        qtySel.appendChild(ph);
        const saved = String(rs?.previewQty || "1").trim();
        let want = Number.parseInt(saved, 10);
        if (!Number.isFinite(want) || want < 1) want = 1;
        if (want > maxQ) want = maxQ;
        for (let q = 1; q <= maxQ; q++) {
          const opt = document.createElement("option");
          opt.value = String(q);
          opt.textContent = `Qty ${q}`;
          qtySel.appendChild(opt);
        }
        qtySel.disabled = false;
        qtySel.value = String(want);
        if (![...qtySel.options].some((o) => o.value === qtySel.value && !o.disabled)) {
          qtySel.selectedIndex = qtySel.options.length > 1 ? 1 : 0;
        }
        persistSlotPreviewQtyPv(idx, String(qtySel.value || "").trim() || String(want));
      }
      }
      if (!qtySel.__bbQtyPersistListen) {
        qtySel.__bbQtyPersistListen = true;
        qtySel.addEventListener("change", () => {
          persistPreviewVariantPicks();
          refreshThemeBuyInline();
        });
      }
    }

    // Unlock QTY if there are no variants and Buy Now is clicked.
    try {
      const buyBtn = popup.querySelector(".buy-now-button");
      if (buyBtn && !buyBtn.__bbQtyUnlockListen) {
        buyBtn.__bbQtyUnlockListen = true;
        buyBtn.addEventListener("click", () => {
          const vCount = Number(popup?.__bbVariantCount || 0) || 0;
          if (vCount > 0) return;
          persistSlotQtyUnlockedPv(idx, true);
          syncPopupProductFieldsFromSlot();
        });
      }
    } catch {}

    const rowElPv = popup.querySelector(".selectors-row");
    if (rowElPv) {
      rowElPv.classList.remove(
        "bb-products-selectors--hidden",
        "bb-products-selectors--v1",
        "bb-products-selectors--v2",
        "bb-products-selectors--v3",
        "bb-products-selectors--cols-1",
        "bb-products-selectors--cols-2",
        "bb-products-selectors--cols-3",
        "bb-products-selectors--cols-4",
        "bb-products-selectors-row--empty"
      );
      const variantColsPv = Math.min(3, rows.length);
      const qtySelNowPv = popup.querySelector(".bb-products-fixed-qty-select");
      const qtyHiddenPv =
        !!qtySelNowPv?.classList.contains("bb-products-fixed-qty-select--hidden");
      const qtyVisiblePv = !!qtySelNowPv && !qtyHiddenPv;
      const visibleCountPv = variantColsPv + (qtyVisiblePv ? 1 : 0);
      if (visibleCountPv === 0) rowElPv.classList.add("bb-products-selectors-row--empty");
      else
        rowElPv.classList.add(
          `bb-products-selectors--cols-${Math.min(4, visibleCountPv)}`
        );
    }

    refreshThemeBuyInline();

    try {
      popup.__bbPersistVariantPicks = persistPreviewVariantPicks;
      popup.__bbRefreshBuyPrice = refreshThemeBuyInline;
    } catch {}

    const row = popup.querySelector(".selectors-row");
    if (row && !row.__bbThemeVariantPriceListen) {
      row.__bbThemeVariantPriceListen = true;
      row.addEventListener("change", () => {
        persistPreviewVariantPicks();
        refreshThemeBuyInline();
      });
      row.addEventListener("input", refreshThemeBuyInline);
    }
  };

  const ensurePopupFlipWrap = () => {
    const mount = document.getElementById("bbThemePopupMount");
    const popup = getPopup();
    if (!mount || !popup) return null;
    let wrap = mount.querySelector(".bb-products-popup-flip-wrap");
    if (wrap && wrap.contains(popup)) return wrap;
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "bb-products-popup-flip-wrap";
      mount.appendChild(wrap);
    }
    try {
      wrap.appendChild(popup);
    } catch {}
    return wrap;
  };

  const isPreviewNarrow = () => {
    try {
      return window.matchMedia("(max-width: 840px)").matches;
    } catch {
      return typeof window.innerWidth === "number" && window.innerWidth <= 840;
    }
  };

  const animateFlip = () => {
    if (isPreviewNarrow()) return;
    const wrap = ensurePopupFlipWrap();
    const mount = document.getElementById("bbThemePopupMount");
    if (wrap) {
      wrap.classList.remove("bb-products-popup-flip");
      try {
        void wrap.offsetWidth;
      } catch {}
      wrap.classList.add("bb-products-popup-flip");
    }
    try {
      mount?.classList.add("bb-products-popup-flip-active");
    } catch {}
    const FLIP_MS = 350;
    window.setTimeout(() => {
      try {
        wrap?.classList.remove("bb-products-popup-flip");
      } catch {}
      try {
        mount?.classList.remove("bb-products-popup-flip-active");
      } catch {}
    }, FLIP_MS + 50);
  };

  document.addEventListener("DOMContentLoaded", () => {
    const mountBuyPrice = document.getElementById("bbThemePopupMount");
    if (mountBuyPrice && !mountBuyPrice.__bbThemeBuyPriceDelegated) {
      mountBuyPrice.__bbThemeBuyPriceDelegated = true;
      mountBuyPrice.addEventListener(
        "change",
        (e) => {
          const t = e.target;
          if (!t || typeof t.closest !== "function") return;
          if (!t.closest(".selectors-row")) return;
          const p = document.querySelector("#bbThemePopupMount .popup");
          if (!p || !p.contains(t)) return;
          if (typeof p.__bbPersistVariantPicks === "function") p.__bbPersistVariantPicks();
          if (typeof p.__bbRefreshBuyPrice === "function") p.__bbRefreshBuyPrice();
        },
        true
      );
    }

    // Match Products: wait 2s, then slide-up intro animation reveals the theme dots/pill.
    window.setTimeout(() => {
      // Default baseline for all theme slots unless the user has customized that theme.
      // Hardcoded "out of the box" baseline for all untouched theme slots.
      // (Provided by user) Tint OFF, Theme Styles OFF, Blend OFF, typography Roboto regular, Ads preview OFF.
      _defaultSnapshot = {
        "bbTheme:accent:v1": JSON.stringify({ hex: "1030f5", on: false, alpha: 100 }),
        "bbTheme:background:v1": JSON.stringify({
          on: false,
          frosted: true,
          blend: false,
          backdropTint: false,
          backdropTintHex: "#000000",
          backdropOpacity: 100,
          uiTintOn: true,
          productTitleColorHex: "#000000",
          contentColorHex: "#000000",
          exploreIconHex: "#000000",
          // "Brand icon" (BrandBased mark / corner icon styling)
          brandIconFillHex: "#1030f5",
          brandIconBorderHex: "#1030f5",
          brandIconFillOpacity: 100,
          brandIconBorderOpacity: 100,
          // Popup corner lock/logo + buy button
          lockLogoHex: "#1030f5",
          buyButtonBgHex: "#1030f5",
          buyButtonLabelHex: "#ffffff",
        }),
        // While Theme Styles are OFF, the specific theme video id is irrelevant.
        "bbTheme:video:v1": "1",
        // Leave custom background empty by default.
        "bbTheme:customBgPersist:v1": null,
        "bbTheme:typography:v1": JSON.stringify({ family: "Roboto", weight: 400, italic: false }),
        "bbTheme:adsPreview:v1": JSON.stringify({ enabled: false }),
        // Admin gallery: leave unset until user chooses videos.
        "bbTheme:adminGallery:v1": null,
      };

      // Seed active slot memory from storage.
      try {
        _activeSlot = clampSlot(localStorage.getItem(ACTIVE_SLOT_KEY));
      } catch {
        _activeSlot = 0;
      }
      // Ensure there is at least one persisted snapshot for the initial theme.
      const idx = readActiveSlot();
      if (!hasThemeSlotSnapshot(idx)) initThemeSlotFromDefaults(idx);

      // Also initialize any other never-touched theme slots so switching starts clean.
      for (let i = 0; i < PRODUCT_SLOTS; i++) {
        if (!hasThemeSlotSnapshot(i)) initThemeSlotFromDefaults(i);
      }

      applySlotThemeToBase(idx);
      hydrateUiFromBaseTheme();
      saveThemeToSlot(idx);
      syncPopupGalleryFromSlotWhenReady();
      syncPopupProductFieldsFromSlot();
      syncUi();
    }, INTRO_MS);
  });

  window.addEventListener("storage", (e) => {
    if (e.key === ACTIVE_SLOT_KEY) {
      const idx = readActiveSlot();
      applySlotThemeToBase(idx);
      animateFlip();
      syncUi();
      return;
    }
    // When the inline Theme Design scripts change live settings, mirror them into the active theme slot.
    const idx = readActiveSlot();
    if (THEME_KEYS.includes(String(e.key || ""))) saveThemeToSlot(idx);
  });

  // Some UI updates may not emit a `storage` event (same-tab changes); capture them and persist.
  const schedulePersistActiveTheme = () => {
    if (_isHydrating) return;
    window.clearTimeout(schedulePersistActiveTheme.__t);
    schedulePersistActiveTheme.__t = window.setTimeout(() => {
      if (_isHydrating) return;
      const idx = readActiveSlot();
      saveThemeToSlot(idx);
    }, 120);
  };
  schedulePersistActiveTheme.__t = 0;
  document.addEventListener("input", schedulePersistActiveTheme, true);
  document.addEventListener("change", schedulePersistActiveTheme, true);
  // Persist Buy Now label per theme slot.
  document.getElementById("bbThemeBuyNowLabel")?.addEventListener("input", (e) => {
    if (_isHydrating) return;
    const t = e?.target;
    const v = t && "value" in t ? String(t.value || "") : "";
    try {
      localStorage.setItem("bbTheme:buyNowLabel:v1", v);
    } catch {}
    schedulePersistActiveTheme();
  });
  // Custom bg file picker doesn't always trigger meaningful input/change on the same elements;
  // persist after selecting a file.
  document.getElementById("bbThemeBgUpload")?.addEventListener("change", () => {
    window.setTimeout(schedulePersistActiveTheme, 150);
    window.setTimeout(schedulePersistActiveTheme, 700);
  });
  // Dynamic Theme selection (video chips / custom bg tile) uses click handlers and same-tab storage writes.
  // Ensure we persist the active theme slot after these interactions too.
  document.addEventListener(
    "click",
    (e) => {
      if (_isHydrating) return;
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest("#bbThemeVideoRow .bb-theme-video-chip")) {
        // Video/custom theme writes can be async; persist a few times after click.
        window.setTimeout(schedulePersistActiveTheme, 80);
        window.setTimeout(schedulePersistActiveTheme, 350);
        window.setTimeout(schedulePersistActiveTheme, 900);
      }
      if (t.closest("#bbThemeCustomBgPreviewWrap")) {
        window.setTimeout(schedulePersistActiveTheme, 120);
        window.setTimeout(schedulePersistActiveTheme, 600);
      }
    },
    true
  );

  // Realtime: if Products updates a product slot (media), update the popup gallery on this page.
  Sync.on((msg) => {
    if (!msg || typeof msg !== "object") return;
    if (msg.src && msg.src === SOURCE_ID) return;
    if (msg.type === "activeSlotChanged") {
      const i = Number(msg.idx);
      if (Number.isFinite(i)) {
        // Follow the shared active slot.
        if (clampSlot(i) !== readActiveSlot()) writeActiveSlot(i);
        applySlotThemeToBase(clampSlot(i));
        hydrateUiFromBaseTheme();
        syncPopupGalleryFromSlotWhenReady();
        syncUi();
      }
      return;
    }
    if (msg.type === "productSlotUpdated") {
      const i = Number(msg.idx);
      if (!Number.isFinite(i)) return;
      if (clampSlot(i) !== readActiveSlot()) return;
      syncPopupGalleryFromSlotWhenReady();
      syncPopupProductFieldsFromSlot();
      return;
    }
  });

  // Polling fallback: react to sync version changes (event-driven; avoid heavy re-hydrates).
  let _lastSyncV = -1;
  window.setInterval(() => {
    let v = -1;
    try {
      v = Number(localStorage.getItem(SYNC_VERSION_KEY) || "0");
    } catch {}
    if (!Number.isFinite(v) || v === _lastSyncV) return;
    _lastSyncV = v;
    try {
      const rawEvt = localStorage.getItem(SYNC_EVENT_KEY) || "";
      const evt = rawEvt ? JSON.parse(rawEvt) : null;
      if (!evt || typeof evt !== "object") return;
      if (evt.src && evt.src === SOURCE_ID) return;
      if (evt.type === "activeSlotChanged") {
        const i = clampSlot(evt.idx);
        if (i !== readActiveSlot()) writeActiveSlot(i);
        applySlotThemeToBase(i);
        hydrateUiFromBaseTheme();
        syncPopupGalleryFromSlotWhenReady();
        syncUi();
        return;
      }
      if (evt.type === "productSlotUpdated") {
        const i = clampSlot(evt.idx);
        if (i === readActiveSlot()) syncPopupGalleryFromSlotWhenReady();
        return;
      }
      // Do NOT re-apply theme keys on "themeSlotSaved" (that causes flashing while user edits).
      // Slot changes are handled above; other pages can force an activeSlotChanged when needed.
    } catch {}
  }, 350);
})();
