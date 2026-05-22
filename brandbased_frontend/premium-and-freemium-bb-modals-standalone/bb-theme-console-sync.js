/**
 * Reads Brand Console Theme Styles / Products persisted state (localStorage +
 * sessionStorage, per active theme slot) and applies it to standalone Premium
 * popups (.popup) and the Freemium modal — matching the preview outputs on
 * Theme Styles / Products pages.
 */
(function (global) {
  const ACTIVE_SLOT_KEY = "bbProducts:activeSlot:v1";
  const KEY_BG = "bbTheme:background:v1";
  const KEY_ACCENT = "bbTheme:accent:v1";
  const KEY_VIDEO = "bbTheme:video:v1";
  const KEY_TYPO = "bbTheme:typography:v1";
  const KEY_BUY_LABEL = "bbTheme:buyNowLabel:v1";
  const KEY_ADS = "bbTheme:adsPreview:v1";
  const KEY_CUSTOM_SESSION = "bbTheme:customBgSession:v1";
  const KEY_ASSET_SVG = "bbAssetLab:svg:v1";
  const DEFAULT_RING = "#000000";
  const DEFAULT_ACCENT = "#1030f4";
  const THEMES_BASE = "../brand-modules-bundle/themes/theme-";

  const ALLOWED_FONT_FAMILIES = new Set([
    "Roboto", "Open Sans", "Lato", "Montserrat", "Poppins", "Inter",
    "Nunito", "Raleway", "Work Sans", "Source Sans 3", "Merriweather",
  ]);
  const ALLOWED_WEIGHTS = new Set([300, 400, 500, 700]);

  let logoBlobUrl = "";

  function normHex6(v) {
    const t = String(v || "").trim().replace(/^#/, "");
    if (!/^[0-9a-fA-F]{6}$/i.test(t)) return "";
    return `#${t.toLowerCase()}`;
  }

  function clampPct(v, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(100, n));
  }

  /** Slider 50–150% → inner logo 0.293×–0.479×. */
  const BRAND_ICON_INNER_MUL_MIN = 0.2925;
  const BRAND_ICON_INNER_MUL_MAX = 0.708906948;

  function clampBrandIconSizePct(v, fallback) {
    const n = Number(v);
    const base = Number.isFinite(n) ? n : fallback;
    return Math.max(50, Math.min(150, Math.round(base)));
  }

  function brandIconInnerMulFromPct(pct) {
    const p = clampBrandIconSizePct(pct, 100);
    const t = (p - 50) / 100;
    return (
      BRAND_ICON_INNER_MUL_MIN +
      t * (BRAND_ICON_INNER_MUL_MAX - BRAND_ICON_INNER_MUL_MIN)
    );
  }

  function brandIconInnerMul(state) {
    return brandIconInnerMulFromPct(state && state.brandIconSizePct);
  }

  function hexToRgba(hex, opacityPct) {
    const h = normHex6(hex) || DEFAULT_ACCENT;
    const ch = (i) => parseInt(h.slice(i, i + 2), 16);
    const a = clampPct(opacityPct, 100) / 100;
    return `rgba(${ch(1)},${ch(3)},${ch(5)},${a})`;
  }

  function isLegacyAccentRingHex(hex6) {
    return /^#1030f4$/i.test(hex6 || "") || /^#1030f5$/i.test(hex6 || "");
  }

  function readActiveSlot() {
    try {
      const n = Number(localStorage.getItem(ACTIVE_SLOT_KEY));
      if (Number.isFinite(n)) return Math.max(0, Math.min(6, Math.floor(n)));
    } catch (_e) {}
    return 0;
  }

  function scopedKey(base, slot) {
    return `${base}:themeSlot:${slot}:v1`;
  }

  /** Latest Theme Styles postMessage (file:// bridge); wins over empty Premium localStorage. */
  let _liveTheme = null;

  function payloadRaw(payload, base, slot) {
    if (!payload) return null;
    const sk = scopedKey(base, slot);
    if (payload[sk] != null && payload[sk] !== "") return String(payload[sk]);
    if (payload[base] != null && payload[base] !== "") return String(payload[base]);
    return null;
  }

  function readRaw(base, slot) {
    const s = slot != null ? slot : readActiveSlot();
    if (_liveTheme && _liveTheme.payload) {
      const fromLive = payloadRaw(_liveTheme.payload, base, s);
      if (fromLive != null) return fromLive;
    }
    try {
      const scoped = localStorage.getItem(scopedKey(base, s));
      if (scoped != null && scoped !== "") return scoped;
    } catch (_e) {}
    try {
      return localStorage.getItem(base);
    } catch (_e) {
      return null;
    }
  }

  function readSessionCustomBg(slot) {
    const keys = [scopedKey(KEY_CUSTOM_SESSION, slot), KEY_CUSTOM_SESSION];
    for (let i = 0; i < keys.length; i++) {
      try {
        const raw = sessionStorage.getItem(keys[i]);
        if (!raw) continue;
        const o = JSON.parse(raw);
        const kind = String(o?.kind || "").trim();
        const dataUrl = String(o?.dataUrl || "").trim();
        if (!dataUrl || dataUrl.indexOf("blob:null") === 0) continue;
        if (kind === "image" || kind === "video") return { kind, dataUrl };
      } catch (_e) {}
    }
    return null;
  }

  function readAccent(slot) {
    let o = null;
    try {
      o = JSON.parse(readRaw(KEY_ACCENT, slot) || "null");
    } catch (_e) {
      o = null;
    }
    const hex = normHex6(o?.hex) || DEFAULT_ACCENT;
    const on = !!(o && o.on === true);
    let alphaPct = Number(o?.alpha);
    if (!Number.isFinite(alphaPct)) alphaPct = Number(o?.alphaPct);
    if (!Number.isFinite(alphaPct)) alphaPct = 100;
    alphaPct = clampPct(alphaPct, 100);
    const hx = hex.replace(/^#/, "");
    const ch = (i) => {
      const n = parseInt(hx.slice(i * 2, i * 2 + 2), 16);
      return Number.isFinite(n) ? Math.max(0, Math.min(255, n)) : [16, 48, 244][i];
    };
    const r = ch(0);
    const g = ch(1);
    const b = ch(2);
    const a = on ? alphaPct / 100 : 0;
    return {
      hex,
      on,
      alphaPct,
      rgba: `rgba(${r},${g},${b},${a})`,
      rgbaSolid: `rgba(${r},${g},${b},1)`,
      solidHex: on ? hex : "#9a9aa3",
    };
  }

  function readThemeBackground(slot) {
    let o = null;
    try {
      o = JSON.parse(readRaw(KEY_BG, slot) || "null");
    } catch (_e) {
      o = null;
    }
    const accent = readAccent(slot);
    const legacyAccent = normHex6(o?.buttonAccentHex);
    const legacyBrand = normHex6(o?.brandIconHex);
    let brandIconFillHex =
      normHex6(o?.brandIconFillHex) || legacyBrand || legacyAccent || accent.hex;
    let brandIconBorderHex = normHex6(o?.brandIconBorderHex) || DEFAULT_RING;
    if (isLegacyAccentRingHex(brandIconBorderHex)) brandIconBorderHex = DEFAULT_RING;

    let video = NaN;
    try {
      const raw = readRaw(KEY_VIDEO, slot);
      if (raw != null && raw !== "") video = Number(raw);
    } catch (_e) {}
    if (!Number.isFinite(video)) video = 1;
    video = Math.max(0, Math.min(7, Math.floor(video)));
    if (video === 0) video = 1;

    return {
      on: !!(o && o.on),
      frosted: o && o.frosted != null ? !!o.frosted : true,
      blend: !!(o && o.blend),
      backdropTint: !!(o && o.backdropTint),
      backdropTintHex: normHex6(o?.backdropTintHex) || "#000000",
      backdropOpacity: clampPct(o?.backdropOpacity, 100),
      video,
      contentColorHex: normHex6(o?.contentColorHex) || normHex6(o?.uiTintHex) || "#000000",
      productTitleColorHex:
        normHex6(o?.productTitleColorHex) || normHex6(o?.contentColorHex) || "#000000",
      brandIconFillHex,
      brandIconBorderHex,
      brandIconFillOpacity: clampPct(o?.brandIconFillOpacity, 100),
      brandIconSizePct: clampBrandIconSizePct(o?.brandIconSizePct, 100),
      buyButtonBgHex: normHex6(o?.buyButtonBgHex) || legacyAccent || accent.hex,
      buyButtonLabelHex: normHex6(o?.buyButtonLabelHex) || "#ffffff",
      exploreIconHex: normHex6(o?.exploreIconHex) || legacyAccent || accent.hex,
      lockLogoHex: normHex6(o?.lockLogoHex) || legacyAccent || accent.hex,
    };
  }

  const KEY_PREVIEW_LINE_HEIGHT = "bbPreview:lineHeight:v1";

  function readPreviewLineHeight() {
    let lh = 1.3;
    try {
      const a = Number(localStorage.getItem(KEY_PREVIEW_LINE_HEIGHT));
      if (Number.isFinite(a)) lh = Math.max(1, Math.min(2.4, a));
    } catch (_e) {}
    return lh;
  }

  function applyStandaloneInTextContext(typo) {
    const lh = readPreviewLineHeight();
    try {
      document.documentElement.style.setProperty("--bb-preview-line-height", String(lh));
    } catch (_e) {}
    const stack = typo?.stack || "'Roboto', Roboto, system-ui, sans-serif";
    const weight = typo?.weight || "400";
    const style = typo?.style || "normal";
    document.querySelectorAll(".bb-premium-wrap, .bb-freemium-wrap").forEach(function (wrap) {
      wrap.style.setProperty("font-family", stack);
      wrap.style.setProperty("font-weight", weight);
      wrap.style.setProperty("font-style", style);
    });
  }

  function readTypography() {
    const slot = readActiveSlot();
    let o = null;
    try {
      o = JSON.parse(readRaw(KEY_TYPO, slot) || "null");
    } catch (_e) {
      o = null;
    }
    let family = String(o?.family || "Roboto").trim();
    if (!ALLOWED_FONT_FAMILIES.has(family)) family = "Roboto";
    let weight = Number(o?.weight);
    if (!ALLOWED_WEIGHTS.has(weight)) weight = 400;
    return {
      stack: `'${family}', Roboto, system-ui, sans-serif`,
      weight: String(weight),
      style: o && o.italic ? "italic" : "normal",
    };
  }

  function readBuyNowLabel() {
    const slot = readActiveSlot();
    try {
      const v = String(readRaw(KEY_BUY_LABEL, slot) || "").trim();
      return v || "Buy Now";
    } catch (_e) {
      return "Buy Now";
    }
  }

  function readAdsEnabled() {
    const slot = readActiveSlot();
    try {
      const o = JSON.parse(readRaw(KEY_ADS, slot) || "null");
      if (o && typeof o === "object" && "enabled" in o) return !!o.enabled;
    } catch (_e) {}
    return true;
  }

  function builtinVideoSrc(videoId) {
    if (videoId < 1 || videoId > 7) return "";
    return `${THEMES_BASE}${videoId}.mp4`;
  }

  function isBuiltinVideoSrc(src) {
    const t = String(src || "");
    return /theme-\d+\.mp4$/i.test(t) || /\/themes\/theme-/i.test(t);
  }

  function applyAccentToRoot(accent) {
    const root = document.documentElement;
    root.style.setProperty("--bb-theme-accent-hex", accent.hex);
    root.style.setProperty("--bb-theme-accent-solid", accent.solidHex);
    root.style.setProperty("--bb-theme-accent", accent.rgba);
  }

  function setUiTintVars(target, state, typo, accent) {
    if (!target) return;
    const fillRgba = hexToRgba(state.brandIconFillHex, state.brandIconFillOpacity);
    const borderCss = state.brandIconBorderHex;
    target.style.setProperty("--bb-theme-popup-brand-icon-bg", fillRgba);
    target.style.setProperty("--bb-theme-popup-brand-icon-border", borderCss);
    target.style.setProperty("--bb-theme-popup-brand-icon", fillRgba);
    target.style.setProperty(
      "--bb-theme-popup-brand-icon-inner-mul",
      String(brandIconInnerMul(state))
    );
    target.style.setProperty("--bb-theme-popup-content-color", state.contentColorHex);
    target.style.setProperty("--bb-theme-popup-product-title-color", state.productTitleColorHex);
    target.style.setProperty("--bb-theme-popup-buy-button-bg", state.buyButtonBgHex);
    target.style.setProperty("--bb-theme-popup-buy-button-label", state.buyButtonLabelHex);
    target.style.setProperty("--bb-theme-popup-explore-icon-color", state.exploreIconHex);
    target.style.setProperty("--bb-theme-lock-logo-color", state.lockLogoHex);
    target.style.setProperty("--bb-theme-accent", accent.rgba);
    target.style.setProperty("--bb-theme-accent-hex", accent.hex);
    target.style.setProperty("--bb-theme-accent-solid", accent.solidHex);
    const backdrop = state.backdropTint
      ? hexToRgba(state.backdropTintHex, state.backdropOpacity)
      : "transparent";
    target.style.setProperty("--bb-theme-backdrop-layer", backdrop);
    if (typo) {
      target.style.setProperty("--bb-theme-popup-font-stack", typo.stack);
      target.style.setProperty("--bb-theme-popup-font-weight", typo.weight);
      target.style.setProperty("--bb-theme-popup-font-style", typo.style);
    }
  }

  function resolveBlendLogoCss(popup) {
    const fallback = 'url("./BB-Full-Logo-Blue.svg")';
    const readLogoVar = (el) => {
      if (!el) return "";
      try {
        const v = window.getComputedStyle(el).getPropertyValue("--bb-logo").trim();
        if (!v || v === "none" || /^initial$/i.test(v)) return "";
        return v;
      } catch (_e) {
        return "";
      }
    };
    const icon =
      popup?.querySelector?.(".title-row .brand-icon") ||
      popup?.querySelector?.(".bb-freemium-badge");
    if (icon?.classList?.contains("bb-upload")) {
      const u = readLogoVar(icon);
      if (u) return u;
    }
    let probe = null;
    try {
      probe = document.createElement("span");
      probe.className = "bb-upload";
      probe.setAttribute("aria-hidden", "true");
      probe.style.cssText =
        "position:absolute!important;left:-9999px!important;width:1px!important;height:1px!important;overflow:hidden!important;visibility:hidden!important;pointer-events:none!important;";
      document.body.appendChild(probe);
      const u = readLogoVar(probe);
      if (u && !/brandbased-logo\.svg/i.test(u)) return u;
    } catch (_e) {}
    finally {
      try {
        probe?.remove();
      } catch (_e) {}
    }
    const u = readLogoVar(icon);
    return u || fallback;
  }

  function hasLuDualLogosInStorage() {
    try {
      return !!(
        localStorage.getItem("bbLuLightLogoData") || localStorage.getItem("bbLuDarkLogoData")
      );
    } catch (_e) {}
    return false;
  }

  function ensureUploadLogoStyle() {
    if (hasLuDualLogosInStorage()) return;
    try {
      const svg = localStorage.getItem(KEY_ASSET_SVG) || "";
      const el = document.getElementById("bb-standalone-upload-logo-style");
      if (!svg || !/<\s*svg\b/i.test(svg)) {
        if (el) el.textContent = "";
        if (logoBlobUrl) {
          try {
            URL.revokeObjectURL(logoBlobUrl);
          } catch (_e) {}
          logoBlobUrl = "";
        }
        return;
      }
      if (logoBlobUrl) {
        try {
          URL.revokeObjectURL(logoBlobUrl);
        } catch (_e) {}
      }
      logoBlobUrl = URL.createObjectURL(
        new Blob([svg], { type: "image/svg+xml;charset=utf-8" })
      );
      let styleEl = el;
      if (!styleEl) {
        styleEl = document.createElement("style");
        styleEl.id = "bb-standalone-upload-logo-style";
        document.head.appendChild(styleEl);
      }
      const safe = logoBlobUrl.replace(/"/g, '\\"');
      styleEl.textContent = `.bb-upload{--bb-logo:url("${safe}");}`;
    } catch (_e) {}
  }

  function ensurePopupGlassBase(popup) {
    if (!popup?.classList?.contains("popup")) return;
    if (popup.querySelector(".bb-popup-glass-base")) return;
    const glass = document.createElement("div");
    glass.className = "bb-popup-glass-base";
    glass.setAttribute("aria-hidden", "true");
    popup.insertBefore(glass, popup.firstChild);
  }

  function ensureSliderCloseUpInProduct(popup) {
    if (!popup?.classList?.contains("popup")) return;
    const productEl = popup.querySelector(".product-element");
    const closeUp = popup.querySelector(".slider-close-up");
    if (!productEl || !closeUp) return;
    popup.querySelector(".bb-popup-zoom-layer")?.remove();
    if (closeUp.parentElement === productEl) return;
    const thumb = productEl.querySelector(".swiper-thumb");
    if (thumb?.nextSibling) productEl.insertBefore(closeUp, thumb.nextSibling);
    else productEl.appendChild(closeUp);
  }

  const BB_POPUP_CORNER_CONTROLS = [
    "lock-icon-bb-logo",
    "popup-mobile-sheet-close",
    "close-icon-desktop",
  ];

  function ensurePopupCornerControls(popup) {
    if (!popup?.classList?.contains("popup")) return;
    const chrome = popup.querySelector(".bb-popup-chrome");
    BB_POPUP_CORNER_CONTROLS.forEach((cls) => {
      const el = popup.querySelector("." + cls);
      if (!el || el.parentElement === popup) return;
      popup.insertBefore(el, chrome || null);
    });
  }

  function ensurePopupChrome(popup) {
    if (!popup?.classList?.contains("popup")) return;
    if (!popup.querySelector(".bb-popup-chrome")) {
      const chrome = document.createElement("div");
      chrome.className = "bb-popup-chrome";
      const toMove = [];
      for (let i = 0; i < popup.children.length; i++) {
        const child = popup.children[i];
        if (!child?.classList) continue;
        if (child.classList.contains("bb-popup-chrome")) continue;
        if (child.classList.contains("bb-popup-zoom-layer") /* legacy */) continue;
        if (child.classList.contains("slider-close-up")) continue;
        if (BB_POPUP_CORNER_CONTROLS.some((c) => child.classList.contains(c))) continue;
        if (
          child.classList.contains("bb-popup-glass-base") ||
          child.classList.contains("bb-popup-theme-tint") ||
          child.classList.contains("bb-popup-theme-stack")
        ) {
          continue;
        }
        toMove.push(child);
      }
      if (toMove.length) {
        toMove.forEach((node) => chrome.appendChild(node));
        const zoomLayer = popup.querySelector(".bb-popup-zoom-layer");
        if (zoomLayer) popup.insertBefore(chrome, zoomLayer);
        else popup.appendChild(chrome);
      }
    }
    ensurePopupCornerControls(popup);
    ensureSliderCloseUpInProduct(popup);
  }

  function ensurePopupThemeTint(popup) {
    if (!popup?.classList?.contains("popup")) return;
    if (popup.querySelector(".bb-popup-theme-tint")) return;
    const tint = document.createElement("div");
    tint.className = "bb-popup-theme-tint";
    tint.setAttribute("aria-hidden", "true");
    const stack = popup.querySelector(".bb-popup-theme-stack");
    const glass = popup.querySelector(".bb-popup-glass-base");
    if (stack) popup.insertBefore(tint, stack);
    else if (glass) popup.insertBefore(tint, glass.nextSibling);
    else popup.insertBefore(tint, popup.firstChild);
  }

  /** Wrap blur / video / logo-blend in a clipped stack so zoom (.slider-close-up) stays unclipped. */
  function ensurePopupThemeStack(popup) {
    if (!popup?.classList?.contains("popup")) return;
    ensurePopupGlassBase(popup);
    ensurePopupThemeTint(popup);
    let stack = popup.querySelector(".bb-popup-theme-stack");
    if (!stack) {
      const blur = popup.querySelector(".blur-bg");
      const video = popup.querySelector(".bb-theme-video-bg");
      if (!blur && !video) return;
      stack = document.createElement("div");
      stack.className = "bb-popup-theme-stack";
      stack.setAttribute("aria-hidden", "true");
      if (blur) stack.appendChild(blur);
      if (video) stack.appendChild(video);
      const tint = popup.querySelector(".bb-popup-theme-tint");
      const glass = popup.querySelector(".bb-popup-glass-base");
      if (tint) popup.insertBefore(stack, tint.nextSibling);
      else if (glass) popup.insertBefore(stack, glass.nextSibling);
      else popup.insertBefore(stack, popup.firstChild);
    }
    if (!stack.querySelector(".bb-theme-logo-blend")) {
      const blend = document.createElement("div");
      blend.className = "bb-theme-logo-blend";
      blend.setAttribute("aria-hidden", "true");
      stack.appendChild(blend);
    }
  }

  function applyBackgroundLayers(shell, state, slot) {
    if (!shell) return;
    const accent = readAccent(slot);
    const isPopup = shell.classList.contains("popup");
    const isFreemium = shell.classList.contains("bb-freemium-modal");

    const custom = readSessionCustomBg(slot);
    const customKind = custom?.kind || "";
    const customUrl = custom?.dataUrl || "";
    const hasCustomImage = customKind === "image" && !!customUrl;
    const hasCustomVideo = customKind === "video" && !!customUrl;

    const videoOn =
      !!state.on && !state.blend && (hasCustomVideo || (!!state.video && !hasCustomImage));
    const accentFillOn =
      !!state.on &&
      !state.blend &&
      !hasCustomImage &&
      !hasCustomVideo &&
      !videoOn;

    /* Logo blend is independent of Theme background on Theme Styles; keep glass/layers active. */
    shell.classList.toggle("bb-theme-bg-on", !!state.on || !!state.blend);
    shell.classList.toggle("bb-theme-frosted", !!state.frosted);
    shell.classList.toggle("bb-theme-blend-logo", !!state.blend);
    shell.classList.toggle("bb-theme-tint-on", !!accent.on);
    shell.classList.toggle("bb-theme-backdrop-tint-on", !!state.backdropTint);
    shell.classList.toggle("bb-theme-video-on", videoOn);
    shell.classList.toggle("bb-theme-accent-fill-on", accentFillOn);
    shell.classList.toggle("bb-theme-custom-upload", hasCustomImage || hasCustomVideo);

    if (isFreemium) {
      shell.classList.toggle("bb-fm-theme-bg-on", !!state.on || !!state.blend);
      shell.classList.toggle("bb-fm-theme-video-on", videoOn && !!state.on && !state.blend);
    }

    const vEl = isPopup
      ? shell.querySelector(".bb-theme-video-bg")
      : shell.querySelector(".bb-freemium-modal-bg");
    const blurEl = isPopup ? shell.querySelector(".blur-bg") : null;
    const fmBlendEl = isFreemium
      ? shell.querySelector(".bb-freemium-modal-blend")
      : null;

    if (vEl) {
      if (state.blend) {
        try {
          vEl.pause();
        } catch (_e) {}
        vEl.removeAttribute("src");
      } else if (hasCustomVideo) {
        if (vEl.getAttribute("src") !== customUrl) {
          vEl.setAttribute("src", customUrl);
          try {
            vEl.load();
          } catch (_e) {}
        }
        try {
          vEl.play().catch(function () {});
        } catch (_e) {}
      } else if (videoOn && state.video >= 1 && state.video <= 7) {
        const src = builtinVideoSrc(state.video);
        if (src && vEl.getAttribute("src") !== src) {
          vEl.setAttribute("src", src);
          try {
            vEl.load();
          } catch (_e) {}
        }
        try {
          vEl.play().catch(function () {});
        } catch (_e) {}
      } else {
        try {
          vEl.pause();
        } catch (_e) {}
        vEl.removeAttribute("src");
      }

      if (accentFillOn && isPopup) {
        if (state.frosted) {
          vEl.style.setProperty("background-color", accent.rgba, "important");
        } else {
          vEl.style.setProperty("background-color", accent.hex, "important");
        }
      } else {
        vEl.style.removeProperty("background-color");
      }
      vEl.style.removeProperty("opacity");
    }

    const applyBlendImageVar = () => {
      try {
        shell.style.setProperty("--bb-theme-blend-bg-image", resolveBlendLogoCss(shell));
      } catch (_e) {
        shell.style.setProperty("--bb-theme-blend-bg-image", 'url("./BB-Full-Logo-Blue.svg")');
      }
    };

    if (state.blend) {
      applyBlendImageVar();
      const blendLayer = shell.querySelector(".bb-theme-logo-blend");
      if (blendLayer) {
        try {
          const img = shell.style.getPropertyValue("--bb-theme-blend-bg-image");
          if (img) blendLayer.style.setProperty("background-image", img);
        } catch (_e) {}
      }
    } else {
      shell.style.removeProperty("--bb-theme-blend-bg-image");
      const blendLayer = shell.querySelector(".bb-theme-logo-blend");
      if (blendLayer) blendLayer.style.removeProperty("background-image");
    }

    if (blurEl) {
      blurEl.style.removeProperty("background-color");
      if (state.blend) {
        blurEl.style.removeProperty("background-image");
        blurEl.style.display = "none";
      } else if (hasCustomImage) {
        blurEl.style.display = "block";
        const u = customUrl.startsWith("blob:")
          ? `url("${customUrl}")`
          : `url("${encodeURI(customUrl)}")`;
        blurEl.style.backgroundImage = u;
      } else if (!hasCustomVideo && !videoOn && !accentFillOn) {
        blurEl.style.removeProperty("background-image");
        blurEl.style.removeProperty("display");
      }
    }

  }

  function applyBrandIcon(shell, state) {
    if (!shell.classList.contains("popup")) return;
    const icon = shell.querySelector(".title-row .brand-icon");
    if (!icon) return;
    const fillRgba = hexToRgba(state.brandIconFillHex, state.brandIconFillOpacity);
    const innerMul = String(brandIconInnerMul(state));
    icon.style.setProperty("background-color", fillRgba, "important");
    icon.style.setProperty(
      "border",
      `1px solid ${state.brandIconBorderHex}`,
      "important"
    );
    icon.style.setProperty("--bb-theme-popup-brand-icon-inner-mul", innerMul);
  }

  function applyFreemiumChrome(state, typo, accent, slot) {
    const modal = document.querySelector(".bb-freemium-modal");
    if (!modal) return;
    setUiTintVars(modal, state, typo, accent);
    applyBackgroundLayers(modal, state, slot);
    const fillRgba = hexToRgba(state.brandIconFillHex, state.brandIconFillOpacity);
    modal.style.setProperty("--bb-fm-accent", accent.rgba);
    modal.style.setProperty(
      "--bb-fm-backdrop-layer",
      state.backdropTint
        ? hexToRgba(state.backdropTintHex, state.backdropOpacity)
        : "transparent"
    );
    modal.style.setProperty("--bb-fm-brand-icon-bg", fillRgba);
    modal.style.setProperty("--bb-fm-brand-icon-border", state.brandIconBorderHex);
    const innerMul = String(brandIconInnerMul(state));
    modal.style.setProperty("--bb-fm-brand-icon-inner-mul", innerMul);
    modal.style.setProperty("--bb-theme-popup-brand-icon-inner-mul", innerMul);
    modal.style.setProperty("--bb-fm-button-bg", state.buyButtonBgHex);
    modal.style.setProperty("--bb-fm-button-label", state.buyButtonLabelHex);
    const badge = modal.querySelector(".bb-freemium-badge");
    if (badge) {
      badge.style.setProperty("--bb-fm-brand-icon-bg", fillRgba);
      badge.style.setProperty("--bb-theme-popup-brand-icon-bg", fillRgba);
      badge.style.setProperty("--bb-fm-brand-icon-border", state.brandIconBorderHex);
      badge.style.setProperty(
        "--bb-theme-popup-brand-icon-border",
        state.brandIconBorderHex
      );
      badge.style.setProperty("--bb-fm-brand-icon-inner-mul", innerMul);
      badge.style.setProperty("--bb-theme-popup-brand-icon-inner-mul", innerMul);
    }
    const explore = modal.querySelector(".bb-freemium-explore");
    if (explore) {
      explore.style.setProperty("background-color", state.buyButtonBgHex, "important");
      explore.style.setProperty("color", state.buyButtonLabelHex, "important");
      explore.style.setProperty(
        "-webkit-text-fill-color",
        state.buyButtonLabelHex,
        "important"
      );
    }
  }

  function applyPopup(popup, state, typo, slot, accent) {
    if (!popup) return;
    ensurePopupThemeStack(popup);
    ensurePopupChrome(popup);
    setUiTintVars(popup, state, typo, accent);
    applyBackgroundLayers(popup, state, slot);
    applyBrandIcon(popup, state);
    popup.classList.add("bb-theme-ui-tint-on");
    applyLockLogo(popup, state.lockLogoHex);
    const buyBtn = popup.querySelector(".buy-now-button");
    if (buyBtn) {
      buyBtn.textContent = readBuyNowLabel();
      buyBtn.style.setProperty("background-color", state.buyButtonBgHex, "important");
      buyBtn.style.setProperty("color", state.buyButtonLabelHex, "important");
      buyBtn.style.setProperty(
        "-webkit-text-fill-color",
        state.buyButtonLabelHex,
        "important"
      );
    }
    const titleEl = popup.querySelector(".product-title");
    if (titleEl) titleEl.style.color = state.productTitleColorHex;
    popup.querySelectorAll(".product-description, .product-description p").forEach(function (el) {
      el.style.color = state.contentColorHex;
    });
    const exploreWrap = popup.querySelector(".explore-icon-when-buy-now-is-used");
    if (exploreWrap) {
      exploreWrap.style.setProperty("--bb-theme-popup-explore-icon-color", state.exploreIconHex);
    }
    try {
      if (typeof global.bbEnsurePopupUploadBrandSurfaces === "function") {
        global.bbEnsurePopupUploadBrandSurfaces(popup);
      }
    } catch (_e) {}
  }

  const LOCK_LOGO_PATH_D =
    "M 14.082157,43.029444 C 11.486276,42.89346 8.7470742,41.989394 6.5481027,40.545644 3.009681,38.221044 0.76669177,34.647238 0.29724018,30.586288 0.22651188,29.980305 0.21739218,28.185467 0.21739218,14.997931 V 0.09673646 H 0.45824335 C 1.0837329,0.09774976 2.2762244,0.20834124 2.7583827,0.30402712 5.5982762,0.87464651 7.7319406,2.6517915 8.2862154,4.9106389 c 0.0762,0.3120656 0.087043,1.2618712 0.1116048,10.3299471 l 0.026751,9.985692 0.3011729,1.467339 c 0.1982217,0.97068 0.2853047,1.49185 0.253558,1.539475 -0.024927,0.03901 -0.8522863,0.602366 -1.8374769,1.25099 -0.9851906,0.648623 -2.5904293,1.704572 -3.5669968,2.347754 -0.9938036,0.653619 -1.7485699,1.183412 -1.7149993,1.201094 0.03354,0.01631 0.1859708,0.04631 0.3401849,0.06404 1.8479138,0.212722 8.518789,1.06138 8.54554,1.087696 0.01956,0.01956 0.629137,1.591164 1.355319,3.4926 1.647888,4.312228 1.541745,4.03965 1.577119,4.037826 0.01773,0 0.910805,-1.601621 1.984426,-3.559751 1.073651,-1.957665 1.972195,-3.570169 1.994872,-3.584233 0.0231,-0.01398 2.058833,-0.04762 4.523613,-0.07448 2.462976,-0.02675 4.488228,-0.05674 4.500479,-0.0689 0.01034,-0.01034 -0.524353,-0.485796 -1.190668,-1.054592 -0.666315,-0.568805 -2.127767,-1.817514 -3.247676,-2.774576 l -2.037492,-1.739957 1.335803,-3.798779 c 0.73526,-2.088755 1.332185,-3.811019 1.327199,-3.828712 -0.01034,-0.02675 -2.002138,0.901726 -7.71278,3.591479 l -0.281667,0.132914 -2.870292,-1.800289 0.01398,-3.800582 c 0.0091,-2.090579 0.02635,-3.812844 0.04266,-3.826908 0.03719,-0.03901 0.944355,-0.173721 1.566227,-0.235856 0.768831,-0.07448 2.237537,-0.06212 3.084382,0.02675 1.942242,0.203663 3.660889,0.713941 5.432593,1.615676 2.257489,1.14666 4.062764,2.735574 5.437578,4.785773 1.188854,1.771704 1.858797,3.508033 2.191726,5.691146 0.117006,0.766997 0.1188,2.680674 0.001,3.446333 -0.361505,2.400375 -1.261426,4.544466 -2.710627,6.450898 -0.462652,0.611425 -1.786224,1.956307 -2.404469,2.445305 -1.973988,1.562609 -4.348058,2.622115 -6.885411,3.073945 -1.077269,0.191413 -2.457525,0.265789 -3.694003,0.20185 z";

  function applyLockLogo(popup, lockHex) {
    const host = popup?.querySelector?.(".lock-icon-bb-logo");
    if (!host) return;
    const hex = normHex6(lockHex) || DEFAULT_ACCENT;
    host.style.color = hex;
    host.style.setProperty("--bb-theme-lock-logo-color", hex);
    let svg = host.querySelector("svg.bb-lock-logo-inline");
    if (!svg) {
      try {
        svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.classList.add("bb-lock-logo-inline");
        svg.setAttribute("viewBox", "0 0 30 43");
        svg.setAttribute("width", "100%");
        svg.setAttribute("height", "100%");
        svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
        svg.setAttribute("aria-hidden", "true");
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", LOCK_LOGO_PATH_D);
        path.setAttribute("fill", "currentColor");
        svg.appendChild(path);
        host.appendChild(svg);
      } catch (_e) {}
    }
    if (svg) {
      svg.querySelectorAll("*").forEach(function (n) {
        try {
          n.setAttribute("fill", hex);
        } catch (_e) {}
        try {
          n.setAttribute("stroke", hex);
        } catch (_e) {}
      });
    }
    const img = host.querySelector("img");
    if (img) img.style.opacity = svg ? "0" : "1";
  }

  function syncAll() {
    const slot = readActiveSlot();
    const state = readThemeBackground(slot);
    const accent = readAccent(slot);
    const typo = readTypography();

    applyAccentToRoot(accent);
    ensureUploadLogoStyle();
    document.body.classList.toggle("bb-theme-ads-off", !readAdsEnabled());

    setUiTintVars(document.documentElement, state, typo, accent);

    document.querySelectorAll(".popup").forEach(function (popup) {
      applyPopup(popup, state, typo, slot, accent);
    });
    applyFreemiumChrome(state, typo, accent, slot);
    applyStandaloneInTextContext(typo);
    try {
      if (typeof global.bbSyncStandaloneMarksToThemeSim === "function") {
        global.bbSyncStandaloneMarksToThemeSim();
      }
      if (typeof global.bbRefreshStandaloneInTextSmartSizing === "function") {
        global.bbRefreshStandaloneInTextSmartSizing();
      }
    } catch (_e) {}
  }

  let syncTimer = 0;
  function scheduleSync() {
    if (syncTimer) window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(function () {
      syncTimer = 0;
      syncAll();
    }, 60);
  }

  const SESSION_PUSH_PREFIX = "__bbSession:";

  function hydrateStorageFromPayload(payload) {
    if (!payload || typeof payload !== "object") return;
    Object.keys(payload).forEach(function (key) {
      const val = payload[key];
      try {
        if (key.indexOf(SESSION_PUSH_PREFIX) === 0) {
          const sessKey = key.slice(SESSION_PUSH_PREFIX.length);
          if (val == null) {
            if (sessionStorage.getItem(sessKey) != null) sessionStorage.removeItem(sessKey);
          } else if (sessionStorage.getItem(sessKey) !== String(val)) {
            sessionStorage.setItem(sessKey, String(val));
          }
          return;
        }
        if (val == null) {
          if (localStorage.getItem(key) != null) localStorage.removeItem(key);
        } else if (localStorage.getItem(key) !== String(val)) {
          localStorage.setItem(key, String(val));
        }
      } catch (_e) {}
    });
  }

  function installMessageBridge() {
    window.addEventListener("message", function (e) {
      const d = e && e.data;
      if (!d || typeof d !== "object" || d.type !== "bb-theme-live") return;
      if (d.payload) {
        _liveTheme = {
          payload: d.payload,
          slot: d.slot != null ? d.slot : readActiveSlot(),
          t: Date.now(),
        };
        if (d.slot != null) {
          try {
            localStorage.setItem(ACTIVE_SLOT_KEY, String(d.slot));
          } catch (_e) {}
        }
        hydrateStorageFromPayload(d.payload);
      }
      scheduleSync();
    });
  }

  function requestThemeFromEditor() {
    const msg = { type: "bb-theme-live-request", t: Date.now() };
    try {
      if (window.opener && !window.opener.closed) window.opener.postMessage(msg, "*");
    } catch (_e) {}
    try {
      if (window.parent && window.parent !== window) window.parent.postMessage(msg, "*");
    } catch (_e) {}
    try {
      const bridge = document.getElementById("bbThemeFileBridge");
      if (bridge && bridge.contentWindow) bridge.contentWindow.postMessage(msg, "*");
    } catch (_e) {}
  }

  function install() {
    syncAll();
    installMessageBridge();
    requestThemeFromEditor();
    window.addEventListener("storage", function (e) {
      if (!e || !e.key) return;
      const k = String(e.key);
      if (
        k.indexOf("bbTheme:") === 0 ||
        k.indexOf(":themeSlot:") !== -1 ||
        k === ACTIVE_SLOT_KEY ||
        k === KEY_ASSET_SVG ||
        k.indexOf("bbAssetLab:") === 0 ||
        k.indexOf("bbPreview:") === 0 ||
        k.indexOf("bbSmartSize:") === 0
      ) {
        scheduleSync();
      }
    });
    try {
      const ch = new BroadcastChannel("bb-theme-products-sync");
      ch.onmessage = function () {
        scheduleSync();
      };
    } catch (_e) {}
    try {
      const obs = new MutationObserver(function (mutations) {
        for (let i = 0; i < mutations.length; i++) {
          const m = mutations[i];
          for (let j = 0; j < m.addedNodes.length; j++) {
            const n = m.addedNodes[j];
            if (n.nodeType !== 1) continue;
            if (
              n.classList &&
              (n.classList.contains("popup") ||
                (n.querySelector && n.querySelector(".popup")))
            ) {
              scheduleSync();
              return;
            }
          }
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
    } catch (_e) {}
    window.addEventListener("bb-theme-console-sync", scheduleSync);
    document.addEventListener("bb-theme-console-sync", scheduleSync);
  }

  global.BBThemeConsoleSync = { sync: syncAll, install: install, readActiveSlot: readActiveSlot };
})(typeof window !== "undefined" ? window : globalThis);
