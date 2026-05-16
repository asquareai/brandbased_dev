    let brandbasedEnhancementEnabled = true;

  /** Per-mark click controllers so stripBrandEnhancements can detach listeners cleanly. */
  const bbBrandClickControllers = new WeakMap();

  /** Maps data-brand → CSS token class .bb-{slug} (CDN URLs live in stylesheet). */
  function bbBrandClass(brand) {
    if (!brand) return "";
    const slug = String(brand).trim().toLowerCase();
    if (!/^[a-z0-9_-]+$/.test(slug)) return "";
    return `bb-${slug}`;
  }

document.addEventListener("DOMContentLoaded", () => {
  (() => {

  // =============================
  // BrandBased Smart Logo Sizing Engine (prototype)
  // =============================
  const BB_SMART_SIZE_API = "http://localhost:8001/api/bb/smart-size";
  // Bump version to invalidate any cached defaults
  const BB_SMART_SIZE_CACHE_PREFIX = "bbSmartSize:v32:";
  const BB_AI_SIZE_CLASS = "BB-AI-Size";
  const BB_DEV_OPENAI_KEY = "bbSmartSize:devOpenaiKey:v1";
  const BB_BRAND_AI_SMART_KEY = "bbSmartSize:brandAiSmart:v1";
  /** Custom placement (upload marks); must exist before any `enhanceBrandMarks` can run from Asset Lab. */
  const BB_PLACEMENT_PROPS = [
    "--bb-size-mul",
    "--bb-place-w-mul",
    "--bb-place-h-mul",
    "--bb-place-pad-l",
    "--bb-place-pad-r",
    "--bb-place-pad-t",
    "--bb-place-pad-b",
  ];
  const bbSmartInFlight = new Map();
  const bbSmartMemoryCache = new Map();
  /** Shown in Custom placement when Brand AI is on — reflects last API / cache. */
  let bbLastSmartSizeMeta = { source: "", brand: "", fromCache: false, at: 0 };
  let _bbDidStaleKeyAutoRefresh = false;
  let bbForceSmartFetch = false;
  const BB_SMART_RULES_KEY = "bbSmartSize:rules:v1";
  const BB_SMART_USER_OFFSET_Y_PX_KEY = "bbSmartSize:userOffsetYpx:v1";
  const BB_SMART_USER_OFFSET_Y_EM_KEY = "bbSmartSize:userOffsetYem:v1";
  const BB_REPLACE_THRESHOLD_KEY = "bbReplaceThreshold:v1";
  const BB_PREVIEW_LINE_HEIGHT_KEY = "bbPreview:lineHeight:v1";
  const BB_PREVIEW_HPAD_KEY = "bbPreview:hpad:v1";
  const BB_SMART_DYNAMIC_STYLE_ID = "bb-smart-dynamic-styles";
  const bbSmartDynInserted = new Set();
  function bbNumberFromCssPx(v) {
    const s = String(v || "").trim();
    if (!s) return null;
    const n = Number(s.replace("px", ""));
    return Number.isFinite(n) ? n : null;
  }

  function bbGetSmartRules() {
    try {
      return (localStorage.getItem(BB_SMART_RULES_KEY) || "").trim();
    } catch {
      return "";
    }
  }

  function bbGetReplaceThreshold() {
    try {
      const raw = localStorage.getItem(BB_REPLACE_THRESHOLD_KEY);
      // Default: Auto (unlimited)
      if (raw == null || raw === "") return 9999;
      const n = Number(raw);
      if (!Number.isFinite(n)) return 9999;
      // 0..7 exact counts; 8+ means “Auto (unlimited)”
      const v = Math.max(0, Math.min(50, Math.round(n)));
      if (v >= 8) return 9999;
      return v;
    } catch {
      return 9999;
    }
  }
  function bbSetReplaceThreshold(n) {
    // Store 0..7 exact; 8 means “Auto (unlimited)”
    const v = Math.max(1, Math.min(8, Math.round(Number(n) || 0)));
    try {
      localStorage.setItem(BB_REPLACE_THRESHOLD_KEY, String(v));
    } catch {}
    return v;
  }

  function bbApplyPreviewVars() {
    const host = document.getElementById("bbSimulatedContent");
    if (!host) return;
    let lh = 1.3;
    let hp = 1.1;
    try {
      const a = Number(localStorage.getItem(BB_PREVIEW_LINE_HEIGHT_KEY));
      const b = Number(localStorage.getItem(BB_PREVIEW_HPAD_KEY));
      if (Number.isFinite(a)) lh = Math.max(1, Math.min(2.4, a));
      if (Number.isFinite(b)) hp = Math.max(0, Math.min(3.5, b));
    } catch {}
    host.style.setProperty("--bb-preview-line-height", String(lh));
    host.style.setProperty("--bb-preview-hpad", String(hp));
  }

  function bbInitBrandSettingsUi() {
    const lh = document.getElementById("bbLineHeight");
    const hp = document.getElementById("bbHorizPad");
    const thr = document.getElementById("bbReplaceThreshold");
    const thrV = document.getElementById("bbReplaceThresholdValue");
    const lhV = document.getElementById("bbLineHeightValue");
    const hpV = document.getElementById("bbHorizPadValue");

    // Restore persisted preview vars
    try {
      const a = localStorage.getItem(BB_PREVIEW_LINE_HEIGHT_KEY);
      const b = localStorage.getItem(BB_PREVIEW_HPAD_KEY);
      if (lh && a != null && a !== "") lh.value = String(a);
      if (hp && b != null && b !== "") hp.value = String(b);
    } catch {}
    // Brand Settings page: default threshold is always “Auto” (do not persist last value)
    // so the demo opens in the expected state every time.
    if (thr) {
      try {
        thr.value = "8";
        localStorage.setItem(BB_REPLACE_THRESHOLD_KEY, "8");
      } catch {}
    }

    const syncPreview = () => {
      const lhN = lh ? Number(lh.value) : null;
      const hpN = hp ? Number(hp.value) : null;
      if (lhV && lhN != null && Number.isFinite(lhN)) lhV.textContent = lhN.toFixed(1);
      if (hpV && hpN != null && Number.isFinite(hpN)) hpV.textContent = hpN.toFixed(1);
      try {
        if (lh && Number.isFinite(lhN)) localStorage.setItem(BB_PREVIEW_LINE_HEIGHT_KEY, String(lhN));
        if (hp && Number.isFinite(hpN)) localStorage.setItem(BB_PREVIEW_HPAD_KEY, String(hpN));
      } catch {}
      bbApplyPreviewVars();
    };

    const syncThreshold = () => {
      if (!thr) return;
      const v = bbSetReplaceThreshold(thr.value);
      if (thrV) thrV.textContent = v >= 8 ? "Auto" : String(v);
      // Re-run enhancement so the limit applies immediately.
      try {
        stripBrandEnhancements();
      } catch {}
      try {
        enhanceBrandMarks();
      } catch {}
    };

    if (lh) lh.addEventListener("input", syncPreview);
    if (hp) hp.addEventListener("input", syncPreview);
    if (thr) thr.addEventListener("input", syncThreshold);

    syncPreview();
    if (thr) syncThreshold();
    else {
      // If no UI present, still apply persisted vars (if any).
      bbApplyPreviewVars();
    }

    // Align "Customise Your Brand Modal" bottom with the left panel bottom
    // (matches the "new-layout" layout intent on Brand Settings page).
    try {
      const layout = document.querySelector(".bb-bs-layout");
      if (layout) {
        const cols = layout.querySelectorAll(":scope > div");
        const leftCol = cols && cols[0];
        const rightCol = cols && cols[1];
        const leftCard = leftCol?.querySelector(".bb-bs-card");
        if (leftCard && rightCol) {
          const applyMinHeight = () => {
            const h = leftCard.getBoundingClientRect().height;
            if (Number.isFinite(h) && h > 0) rightCol.style.minHeight = `${Math.round(h)}px`;
          };
          applyMinHeight();
          window.addEventListener("resize", applyMinHeight, { passive: true });
          window.addEventListener("orientationchange", applyMinHeight, { passive: true });
        }
      }
    } catch {}
  }

  function bbExtractUserOffsetYpx(rulesText) {
    const t = String(rulesText || "").toLowerCase();
    // Accept phrases like: "padding-bottom 20px", "20px padding bottom", "padding bottom: 20px"
    const m =
      t.match(/padding[\s-]*bottom[^0-9]*([0-9]{1,3})\s*px/) ||
      t.match(/([0-9]{1,3})\s*px[^a-z0-9]*padding[\s-]*bottom/) ||
      // Also allow missing "px": "padding-bottom 20"
      t.match(/padding[\s-]*bottom[^0-9]*([0-9]{1,3})\b/);
    if (!m) {
      // If user asks for padding-bottom but doesn't specify a number, apply a safe default.
      if (t.includes("padding-bottom") || t.includes("padding bottom")) return 12;
      return 0;
    }
    const px = Number(m[1]);
    if (!Number.isFinite(px)) return 0;
    return Math.max(0, Math.min(60, px)); // safety cap
  }

  function bbGetUserOffsetYpx() {
    try {
      const raw = localStorage.getItem(BB_SMART_USER_OFFSET_Y_PX_KEY);
      const n = Number(raw);
      return Number.isFinite(n) ? n : 0;
    } catch {
      return 0;
    }
  }

  function bbExtractUserOffsetYem(rulesText) {
    const t = String(rulesText || "").toLowerCase();
    // Accept: "offset-y: -0.06em" / "offsetY -0.06em" / "offset y -0.06em"
    const m =
      t.match(/offset[\s-]*y[^-0-9]*(-?[0-9]*\.?[0-9]+)\s*em/) ||
      t.match(/offsety[^-0-9]*(-?[0-9]*\.?[0-9]+)\s*em/);
    if (!m) return 0;
    const em = Number(m[1]);
    if (!Number.isFinite(em)) return 0;
    return Math.max(-0.2, Math.min(0.2, em)); // safety cap
  }

  /**
   * Layout hint parsed from the same "model guidance" string (not sent to the LLM as margin rules).
   * Phrases: "padding left 20px", "padding-left: 20px", "add padding right 20", etc.
   * Returns { l, r } with number px or null if that side is not specified.
   */
  function bbExtractGuidancePadLRpx(rulesText) {
    const t = String(rulesText || "");
    const out = { l: null, r: null };
    const cap = (n) => Math.max(0, Math.min(60, n));
    const mL = t.match(
      /(?:^|[\n;]|\s)(?:add\s+)?padding[-\s]left\s*[:：]?\s*([0-9]{1,3})(?:\s*px)?\b/i
    );
    const mR = t.match(
      /(?:^|[\n;]|\s)(?:add\s+)?padding[-\s]right\s*[:：]?\s*([0-9]{1,3})(?:\s*px)?\b/i
    );
    if (mL) {
      const n = Number(mL[1]);
      if (Number.isFinite(n)) out.l = cap(n);
    }
    if (mR) {
      const n = Number(mR[1]);
      if (Number.isFinite(n)) out.r = cap(n);
    }
    /* Shorthand: "padding 50px" / "padding: 50px" → same L+R (when sides not set above) */
    if (out.l == null && out.r == null) {
      let g =
        t.match(/\bpadding\s+([0-9]{1,3})\s*px\b/i) ||
        t.match(/\bpadding\s*:\s*([0-9]{1,3})\s*px\b/i);
      if (g) {
        const n = cap(Number(g[1]));
        out.l = n;
        out.r = n;
      }
    }
    return out;
  }

  function bbGetUserOffsetYem() {
    try {
      const raw = localStorage.getItem(BB_SMART_USER_OFFSET_Y_EM_KEY);
      const n = Number(raw);
      return Number.isFinite(n) ? n : 0;
    } catch {
      return 0;
    }
  }

  function bbApplyUserRulesToEl(el) {
    // Model-guidance offsets only apply while Brand AI is on; sliders/manual placement own the mark when off.
    const useGuidance = bbIsBrandAiSmartOn();
    const px = useGuidance ? bbGetUserOffsetYpx() : 0;
    const em = useGuidance ? bbGetUserOffsetYem() : 0;
    // Keep spans clean: no inline CSS vars; store for dynamic class rule injection.
    el.__bbUserOffsetYpx = `${px}px`;
    el.__bbUserOffsetYem = `${em}em`;
  }

  let _bbGuidanceDebounce = null;
  function bbSyncGuidanceTextareas(rules) {
    const t = String(rules ?? "");
    const a = document.getElementById("bbPlaceGuidanceInput");
    const b = document.querySelector(".bb-smart-rules-input");
    if (a && document.activeElement !== a) a.value = t;
    if (b && document.activeElement !== b) b.value = t;
  }
  function bbCommitGuidanceToStorageAndRefresh(rulesText) {
    const rules = String(rulesText || "").trim();
    try {
      localStorage.setItem(BB_SMART_RULES_KEY, rules);
    } catch {}
    const parsedPx = bbExtractUserOffsetYpx(rules);
    const parsedEm = bbExtractUserOffsetYem(rules);
    try {
      localStorage.setItem(BB_SMART_USER_OFFSET_Y_PX_KEY, String(parsedPx));
    } catch {}
    try {
      localStorage.setItem(BB_SMART_USER_OFFSET_Y_EM_KEY, String(parsedEm));
    } catch {}
    document.querySelectorAll(".brandbased-dynamic-logo-slot").forEach((el) => {
      bbApplyUserRulesToEl(el);
    });
    bbSmartMemoryCache.clear();
    bbClearSmartSizeCaches();
    bbRefreshAllSmartSizing();
    try {
      bbApplyGuidanceLrPadFromText();
    } catch {}
  }
  function bbScheduleGuidanceCommit(rulesText, floatStatus) {
    clearTimeout(_bbGuidanceDebounce);
    if (floatStatus) {
      try {
        floatStatus.textContent = "Syncing after edit…";
      } catch {}
    }
    const placeSt = document.getElementById("bbPlaceGuidanceStatus");
    if (placeSt) placeSt.textContent = "Syncing…";
    _bbGuidanceDebounce = setTimeout(() => {
      try {
        bbCommitGuidanceToStorageAndRefresh(rulesText);
        bbSyncGuidanceTextareas(rulesText);
        if (placeSt) {
          const r0 = String(rulesText || "").trim();
          placeSt.textContent = r0 ? "Live (saved)" : "";
        }
        if (floatStatus) {
          floatStatus.textContent = `Parsed padding-bottom: ${bbGetUserOffsetYpx()}px, offset-y: ${bbGetUserOffsetYem()}em`;
        }
      } catch (e) {
        if (placeSt) placeSt.textContent = "Save error";
        if (floatStatus) floatStatus.textContent = String((e && e.message) || e || "Error");
      }
    }, 520);
  }

  function bbInitSmartRulesUi() {
    const btn = document.querySelector(".bb-smart-rules-btn");
    const panel = document.querySelector(".bb-smart-rules-panel");
    const input = document.querySelector(".bb-smart-rules-input");
    const save = document.querySelector(".bb-smart-rules-save");
    const clear = document.querySelector(".bb-smart-rules-clear");
    const status = document.querySelector(".bb-smart-rules-status");
    /* Team Console page can omit the floating toggle; Premium demo includes btn+panel */
    if (!input || !save || !clear) return;

    input.value = bbGetSmartRules();
    if (status) status.textContent = `Parsed padding-bottom: ${bbGetUserOffsetYpx()}px, offset-y: ${bbGetUserOffsetYem()}em`;
    // Vision UI removed in simplified mode.

    if (btn && panel) {
      btn.addEventListener("click", () => {
        panel.classList.toggle("open");
        if (panel.classList.contains("open")) input.focus();
      });
    }

    const syncPlacement = (rulesText) => {
      const pInput = document.getElementById("bbPlaceGuidanceInput");
      const pStatus = document.getElementById("bbPlaceGuidanceStatus");
      if (pInput && typeof rulesText === "string") pInput.value = rulesText;
      if (pStatus) pStatus.textContent = rulesText ? "Saved" : "";
    };

    input.addEventListener("input", () => {
      bbScheduleGuidanceCommit(String(input.value || ""), status);
    });

    save.addEventListener("click", () => {
      clearTimeout(_bbGuidanceDebounce);
      const rules = String(input.value || "");
      const rulesTrim = rules.trim();
      try {
        syncPlacement(rulesTrim);
      } catch {}
      bbCommitGuidanceToStorageAndRefresh(rules);
      if (status) {
        status.textContent = `Parsed padding-bottom: ${bbGetUserOffsetYpx()}px, offset-y: ${bbGetUserOffsetYem()}em`;
      }
      const placeSt = document.getElementById("bbPlaceGuidanceStatus");
      if (placeSt) placeSt.textContent = rulesTrim ? "Saved" : "";
      /* Floating rules UI closes on save; Team Console keeps the inline panel visible (no toggle btn). */
      if (panel && btn) panel.classList.remove("open");
    });

    clear.addEventListener("click", () => {
      clearTimeout(_bbGuidanceDebounce);
      input.value = "";
      try {
        syncPlacement("");
      } catch {}
      try {
        localStorage.removeItem(BB_SMART_RULES_KEY);
        localStorage.removeItem(BB_SMART_USER_OFFSET_Y_PX_KEY);
        localStorage.removeItem(BB_SMART_USER_OFFSET_Y_EM_KEY);
      } catch {}
      if (status) status.textContent = "Parsed padding-bottom: 0px, offset-y: 0em";
      const placeSt = document.getElementById("bbPlaceGuidanceStatus");
      if (placeSt) placeSt.textContent = "";
      document.querySelectorAll(".brandbased-dynamic-logo-slot").forEach((el) => {
        el.style.removeProperty("--bb-user-offset-y-px");
        el.style.removeProperty("--bb-user-offset-y-em");
      });
      bbCommitGuidanceToStorageAndRefresh("");
    });
  }

  // Vision removed in simplified mode.
  function bbIsVisionEnabled() {
    return false;
  }

  // (Vision screenshot capture removed in simplified mode)

  bbInitSmartRulesUi();

  // =============================
  // Asset Lab (upload SVG → live preview)
  // =============================
  const BB_ASSET_LAB_STORAGE_KEY = "bbAssetLab:svg:v1";
  const BB_ASSET_LAB_STYLE_ID = "bb-asset-lab-style";
  const BB_ASSET_LAB_FILENAME_KEY = "bbAssetLab:filename:v1";
  /** Set when “Save” has succeeded for the current upload (enables Apply). */
  const BB_ASSET_LAB_CROP_SAVED_KEY = "bbAssetLab:cropSaved:v1";
  /** Saved Custom Size & Placement slider values (upload marks only). */
  const BB_PLACEMENT_KEY = "bbPlacement:panel:v1";
  const BB_SAVE_CROPPED_API = "http://localhost:8001/api/bb/save-cropped";
  let bbAssetLabBlobUrl = "";
  let bbAssetLabSvgText = "";
  let bbAssetLabTrimViewBox = "";

  function bbParseSvgLengthAttr(v) {
    if (v == null) return null;
    const t = String(v).trim();
    if (!t || t.endsWith("%")) return null;
    const n = parseFloat(t.replace(/(px|pt|em|ex|mm|cm|in)$/i, "").trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function bbGetRootSvgElement(doc) {
    if (!doc) return null;
    try {
      const de = doc.documentElement;
      if (de && String(de.nodeName || "").toLowerCase() === "svg") return de;
    } catch {}
    return doc.querySelector && doc.querySelector("svg");
  }

  function bbViewBoxOrSyntheticFromElement(de) {
    if (!de || String(de.nodeName || "").toLowerCase() !== "svg") return null;
    const raw = (de.getAttribute("viewBox") || "").replace(/,/g, " ").trim();
    if (raw) {
      const parts = raw.split(/\s+/).filter(Boolean);
      if (parts.length === 4) {
        const x = Number(parts[0]);
        const y = Number(parts[1]);
        const w = Number(parts[2]);
        const h = Number(parts[3]);
        if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
          return { x, y, w, h };
        }
      }
    }
    const w = bbParseSvgLengthAttr(de.getAttribute("width"));
    const h = bbParseSvgLengthAttr(de.getAttribute("height"));
    if (w && h) return { x: 0, y: 0, w, h };
    try {
      if (de.width && de.width.baseVal && de.height && de.height.baseVal) {
        const wb = de.width.baseVal.value;
        const hb = de.height.baseVal.value;
        if (Number.isFinite(wb) && Number.isFinite(hb) && wb > 0 && hb > 0) {
          return { x: 0, y: 0, w: wb, h: hb };
        }
      }
    } catch {}
    return null;
  }

  /**
   * Fallback when DOM parse is inconclusive: read *only* the first <svg…> start tag
   * (not the first viewBox= anywhere, which is often a nested <svg>).
   */
  function bbGetRootViewBoxObjectFromString(s0) {
    const s = String(s0 || "");
    const m = s.match(/<\s*svg\b[^>]*?>/i);
    if (!m) return null;
    const tag = m[0];
    const mvb = tag.match(
      /\bviewBox\s*=\s*["']\s*([-0-9.eE+-]+)(?:[,\s]+)([-0-9.eE+-]+)(?:[,\s]+)([-0-9.eE+-]+)(?:[,\s]+)([-0-9.eE+-]+)\s*["']/i
    );
    if (mvb) {
      const x = Number(mvb[1]);
      const y = Number(mvb[2]);
      const w = Number(mvb[3]);
      const h = Number(mvb[4]);
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
        return { x, y, w, h };
      }
    }
    const mw = tag.match(/\bwidth\s*=\s*["']([^"']*)["']/i);
    const mh = tag.match(/\bheight\s*=\s*["']([^"']*)["']/i);
    const w2 = bbParseSvgLengthAttr(mw && mw[1]);
    const h2 = bbParseSvgLengthAttr(mh && mh[1]);
    if (w2 && h2) return { x: 0, y: 0, w: w2, h: h2 };
    return null;
  }

  function bbParseToDoc(svgText) {
    const s = String(svgText || "");
    try {
      const p = new DOMParser();
      const doc1 = p.parseFromString(s, "image/svg+xml");
      if (doc1) {
        const pe = doc1.getElementsByTagName("parsererror");
        if (pe && pe.length) {
          /* parse failed, try html path below */
        } else if (bbGetRootSvgElement(doc1)) {
          return doc1;
        }
      }
    } catch {}
    // Some “SVG” exports are actually HTML-wrapped; HTML parsing is more tolerant.
    try {
      const p = new DOMParser();
      return p.parseFromString(s, "text/html");
    } catch {
      return null;
    }
  }

  function bbGetRootViewBoxObject(svgText) {
    const s0 = String(svgText || "");
    try {
      const doc = bbParseToDoc(s0);
      const de = doc && bbGetRootSvgElement(doc);
      if (de) {
        const fromEl = bbViewBoxOrSyntheticFromElement(de);
        if (fromEl) return fromEl;
      }
    } catch {}
    return bbGetRootViewBoxObjectFromString(s0);
  }

  function bbFmtVb4(vb) {
    const fmt = (n) => String(Number(n).toFixed(6)).replace(/\.?0+$/, "");
    return `${fmt(vb.x)} ${fmt(vb.y)} ${fmt(vb.w)} ${fmt(vb.h)}`;
  }

  function bbVbCloseEnough(a, b, tol) {
    if (!a || !b) return false;
    return (
      Math.abs(a.x - b.x) <= tol &&
      Math.abs(a.y - b.y) <= tol &&
      Math.abs(a.w - b.w) <= tol &&
      Math.abs(a.h - b.h) <= tol
    );
  }

  // Last-resort: patch the FIRST <svg ...> start tag. Some SVGs are messy enough that DOM round-trips
  // can fail to change what you think is the "root" viewBox.
  function bbPatchFirstSvgStartTagViewBox(svgText, vb) {
    const s0 = String(svgText || "");
    const attr = `viewBox="${bbFmtVb4(vb)}"`;
    return s0.replace(/<\s*svg\b[^>]*>/i, (tag) => {
      let t = tag;
      if (/\bviewBox\s*=\s*["'][^"']*["']/i.test(t)) {
        t = t.replace(/\bviewBox\s*=\s*["'][^"']*["']/i, attr);
      } else {
        t = t.replace(/<\s*svg\b/i, (m) => `${m} ${attr}`);
      }
      if (/\boverflow\s*=\s*["'][^"']*["']/i.test(t)) {
        t = t.replace(/\boverflow\s*=\s*["'][^"']*["']/i, 'overflow="hidden"');
      } else {
        t = t.replace(/>\s*$/i, ' overflow="hidden">');
      }
      return t;
    });
  }

  function bbSetRootViewBoxHard(svgText, vb) {
    // Try DOM (best), then patch first <svg> tag.
    const domTry = (() => {
      try {
        const doc = bbParseToDoc(svgText);
        const de = doc && bbGetRootSvgElement(doc);
        if (de && String(de.nodeName || "").toLowerCase() === "svg") {
          de.setAttribute("viewBox", bbFmtVb4(vb));
          // Ensure the visible canvas matches the viewBox (some exports set overflow:visible and look "uncropped").
          de.setAttribute("overflow", "hidden");
          // Always serialize the <svg> node (not a whole HTML document).
          return new XMLSerializer().serializeToString(de);
        }
      } catch {}
      return "";
    })();

    if (domTry) {
      const v1 = bbGetRootViewBoxObject(domTry);
      if (bbVbCloseEnough(v1, vb, 0.75)) return domTry;
    }

    const patched = bbPatchFirstSvgStartTagViewBox(svgText, vb);
    const v2 = bbGetRootViewBoxObject(patched);
    if (bbVbCloseEnough(v2, vb, 0.75)) return patched;

    // If both fail, return the most likely "best" attempt (patched) so the user at least has something to inspect.
    return patched || String(svgText || "");
  }

  function bbParseViewBoxRatio(svgText) {
    const vb = bbGetRootViewBoxObject(svgText);
    if (vb && Number.isFinite(vb.w) && Number.isFinite(vb.h) && vb.h !== 0) {
      return vb.w / vb.h;
    }
    return null;
  }

  /**
   * Match the cropper Konva path: many brand SVGs keep width/height/% or inline styles on the root.
   * In <img> and background-image, that often makes the renderer ignore the updated viewBox.
   * Force explicit pixel width/height derived from the *current* root viewBox before any blob URL.
   */
  function bbSvgForKonvaRaster(svgText) {
    const vb = bbGetRootViewBoxObject(svgText);
    if (!vb) return String(svgText || "");
    const base = 1200;
    const wpx = base;
    const hpx = Math.max(1, Math.round((base * vb.h) / vb.w));
    try {
      const doc = bbParseToDoc(svgText);
      const de = doc && bbGetRootSvgElement(doc);
      if (de && String(de.nodeName || "").toLowerCase() === "svg") {
        de.setAttribute("width", String(wpx));
        de.setAttribute("height", String(hpx));
        const st = de.getAttribute("style");
        if (st) {
          const cleaned = String(st)
            .replace(/(^|;)\s*width\s*:\s*[^;]+;?/gi, "$1")
            .replace(/(^|;)\s*height\s*:\s*[^;]+;?/gi, "$1")
            .replace(/;{2,}/g, ";")
            .replace(/^\s*;\s*|\s*;\s*$/g, "")
            .trim();
          if (cleaned) de.setAttribute("style", cleaned);
          else de.removeAttribute("style");
        }
        return new XMLSerializer().serializeToString(de);
      }
    } catch {}
    return String(svgText || "");
  }

  function bbGetAssetLabStyleEl() {
    let el = document.getElementById(BB_ASSET_LAB_STYLE_ID);
    if (!el) {
      el = document.createElement("style");
      el.id = BB_ASSET_LAB_STYLE_ID;
      document.head.appendChild(el);
    }
    return el;
  }

  function bbApplyUploadedSvgToCss(svgText, preparedAlready) {
    // Default: run bbSvgForKonvaRaster() so preview + --bb-logo match what the cropper shows.
    // Pass preparedAlready === true when svgText is already raster-ready (e.g. after Save).
    const s0 = String(svgText || "");
    const prepared =
      preparedAlready === true
        ? s0
        : s0 && /<\s*svg\b/i.test(s0)
          ? bbSvgForKonvaRaster(s0) || s0
          : s0;
    const ratio = bbParseViewBoxRatio(prepared) || 1;
    try {
      if (bbAssetLabBlobUrl) URL.revokeObjectURL(bbAssetLabBlobUrl);
    } catch {}
    const blob = new Blob([prepared], { type: "image/svg+xml;charset=utf-8" });
    bbAssetLabBlobUrl = URL.createObjectURL(blob);

    const styleEl = bbGetAssetLabStyleEl();
    styleEl.textContent = `.bb-upload{--bb-logo:url("${bbAssetLabBlobUrl}");--bb-ratio:${ratio};}`;

    // Brand Settings: keep the threshold “logo chip” in sync with the active uploaded blob URL.
    try {
      const chip = document.querySelector(".bb-threshold-chip");
      if (chip && bbAssetLabBlobUrl) {
        chip.style.setProperty("--bb-chip-logo", `url("${bbAssetLabBlobUrl}")`);
      }
    } catch {}
    return { ratio };
  }

  function bbInitAssetLabUi() {
    const uploadBtn = document.getElementById("bbUploadBtn");
    const input = document.getElementById("bbUploadInput");
    const status = document.getElementById("bbUploadStatus");
    // Legacy Asset Lab elements removed (panel/preview/apply). Keep variables null-safe for old logic.
    const panel = null;
    const applyBtn = null;
    const clearBtn = null;
    const cropBtn = null;
    const previewImg = null;
    const previewName = null;
    const previewRatio = null;
    const previewViewBox = null;

    // Custom crop: Konva state; "Save" must read the base viewBox from the current SVG text (not a stale value).
    let cropVb = null;
    let doApplyCropSliders = null; // set when cropper opens (slider + crop rect)

    if (uploadBtn) {
      uploadBtn.addEventListener("click", () => {
        if (!input) return;
        try {
          input.click();
        } catch {}
      });
    }

    function setStatus(t) {
      if (!status) return;
      status.textContent = t;
    }

    function updateApplyButtonVisibility() {
      const hasSvg = !!(
        (bbAssetLabSvgText && String(bbAssetLabSvgText).trim()) ||
        (typeof localStorage !== "undefined" && (localStorage.getItem(BB_ASSET_LAB_STORAGE_KEY) || "").trim())
      );
      const saved = typeof localStorage !== "undefined" && localStorage.getItem(BB_ASSET_LAB_CROP_SAVED_KEY) === "1";
      if (!applyBtn) return;
      if (saved && hasSvg) {
        applyBtn.removeAttribute("hidden");
      } else {
        applyBtn.setAttribute("hidden", "");
      }
    }

    function bbRatioToFraction(ratio) {
      const x = Number(ratio);
      if (!Number.isFinite(x) || x <= 0) return null;
      // Continued-fraction approximation with a small denominator.
      const maxDen = 30;
      let h1 = 1, h0 = 0, k1 = 0, k0 = 1;
      let b = x;
      for (let i = 0; i < 20; i++) {
        const a = Math.floor(b);
        const h2 = a * h1 + h0;
        const k2 = a * k1 + k0;
        if (k2 > maxDen) break;
        h0 = h1; h1 = h2;
        k0 = k1; k1 = k2;
        const frac = b - a;
        if (frac < 1e-10) break;
        b = 1 / frac;
      }
      if (k1 === 0) return null;
      const n = Math.max(1, Math.round(h1));
      const d = Math.max(1, Math.round(k1));
      // Reduce a bit
      const gcd = (a, b) => (b ? gcd(b, a % b) : a);
      const g = gcd(n, d);
      return { n: Math.round(n / g), d: Math.round(d / g) };
    }

    function setPreview({ name, ratio, url, viewBox }) {
      try {
        if (previewName) previewName.textContent = name || "None";
        if (previewRatio) {
          if (typeof ratio === "number") {
            const f = bbRatioToFraction(ratio);
            const fracLabel = f ? `${f.n}:${f.d}` : "";
            previewRatio.textContent = `${fracLabel}${fracLabel ? " " : ""}(${ratio.toFixed(3)})`;
          } else {
            previewRatio.textContent = "–";
          }
        }
        if (previewViewBox) previewViewBox.textContent = viewBox ? String(viewBox) : "–";
        if (previewImg) {
          if (url) {
            previewImg.removeAttribute("src");
            previewImg.src = url;
            previewImg.style.visibility = "visible";
          } else {
            previewImg.removeAttribute("src");
            previewImg.style.visibility = "hidden";
          }
        }
      } catch {}
    }

    function clear() {
      try {
        localStorage.removeItem(BB_ASSET_LAB_STORAGE_KEY);
        localStorage.removeItem(BB_ASSET_LAB_CROP_SAVED_KEY);
      } catch {}
      bbGetAssetLabStyleEl().textContent = "";
      try {
        if (bbAssetLabBlobUrl) URL.revokeObjectURL(bbAssetLabBlobUrl);
      } catch {}
      bbAssetLabBlobUrl = "";
      bbAssetLabSvgText = "";
      bbAssetLabTrimViewBox = "";
      if (input) input.value = "";
      setStatus("Cleared. Upload an SVG to test.");
      setPreview({ name: "None", ratio: null, url: "", viewBox: "" });
      cropVb = null;
      updateApplyButtonVisibility();
      enhanceBrandMarks();
    }

    if (clearBtn) clearBtn.addEventListener("click", clear);

    if (input) input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const name = (file.name || "").toLowerCase();
      if (name.endsWith(".eps")) {
        setStatus("EPS isn’t supported in-browser. Convert to SVG first, then upload the SVG.");
        return;
      }
      if (!name.endsWith(".svg") && file.type !== "image/svg+xml") {
        setStatus("Please upload an SVG file.");
        return;
      }
      const text = await file.text();
      if (!/<\s*svg\b/i.test(text)) {
        setStatus("That file doesn’t look like an SVG.");
        return;
      }
      const svgForUse = text;
      const applied = bbApplyUploadedSvgToCss(svgForUse);
      const ratio = applied.ratio || bbParseViewBoxRatio(svgForUse) || 1;
      const rvb = bbGetRootViewBoxObject(svgForUse);
      const vb = rvb ? `${rvb.x} ${rvb.y} ${rvb.w} ${rvb.h}` : "(none)";
      bbAssetLabSvgText = svgForUse;
      bbAssetLabTrimViewBox = vb;
      try {
        localStorage.setItem(BB_ASSET_LAB_STORAGE_KEY, svgForUse);
        localStorage.setItem(BB_ASSET_LAB_FILENAME_KEY, file.name || "upload.svg");
        localStorage.removeItem(BB_ASSET_LAB_CROP_SAVED_KEY);
      } catch {}
      setStatus("Loaded. Opening cropper…");
      setPreview({ name: file.name || "uploaded.svg", ratio, url: bbAssetLabBlobUrl, viewBox: vb });
      cropVb = null;
      updateApplyButtonVisibility();
      try {
        bbOpenCropper();
      } catch {}
    });

    // ---------- Custom crop (Konva) ----------
    const overlay = document.querySelector(".bb-crop-overlay");
    const closeBtn = document.querySelector(".bb-crop-close");
    const resetBtn = document.querySelector(".bb-crop-reset");
    const saveBtn = document.querySelector(".bb-crop-save");
    const stageHost = document.getElementById("bbCropStage");
    const leftSlider = document.querySelector(".bb-crop-left");
    const rightSlider = document.querySelector(".bb-crop-right");
    const topSlider = document.querySelector(".bb-crop-top");
    const bottomSlider = document.querySelector(".bb-crop-bottom");
    const scaleSlider = document.querySelector(".bb-crop-scale");
    let cropStage = null;
    let cropLayer = null;
    let cropImageNode = null;
    let cropRect = null;
    let cropTransformer = null;
    let cropImgW = 1;
    let cropImgH = 1;
    let cropImgBounds = null; // {x,y,w,h}
    /** Initial fit size (100% on Logo size) — used to reset and scale. */
    let cropBaseFittedW = 0;
    let cropBaseFittedH = 0;
    /** Fixed in stage space while the image is panned; updated when sliders change. */
    let fixedCropBox = null; // { x, y, width, height }
    function bbGetCropSliderFracs() {
      // Match the <input> defaults in the manual crop panel (6/6/10/10).
      const l = Number(leftSlider && leftSlider.value !== "" ? leftSlider.value : 6) / 100;
      const r = Number(rightSlider && rightSlider.value !== "" ? rightSlider.value : 6) / 100;
      const t = Number(topSlider && topSlider.value !== "" ? topSlider.value : 10) / 100;
      const b = Number(bottomSlider && bottomSlider.value !== "" ? bottomSlider.value : 10) / 100;
      // clip-path insets are invalid if the removed portions sum to 100%+
      const clampPair = (a, b0) => {
        const s = a + b0;
        if (s < 0.999) return { a, b: b0 };
        const k = 0.999 / Math.max(s, 0.000001);
        return { a: a * k, b: b0 * k };
      };
      const lr = clampPair(l, r);
      const tb = clampPair(t, b);
      return { l: lr.a, r: lr.b, t: tb.a, b: tb.b };
    }

    function bbVbForCropFracs(baseVb, fracs) {
      if (!baseVb) return null;
      const l = fracs.l;
      const r = fracs.r;
      const t = fracs.t;
      const b = fracs.b;
      return {
        x: baseVb.x + baseVb.w * l,
        y: baseVb.y + baseVb.h * t,
        w: Math.max(0.000001, baseVb.w * Math.max(0, 1 - l - r)),
        h: Math.max(0.000001, baseVb.h * Math.max(0, 1 - t - b)),
      };
    }

    function bbFmtVbNumber(n) {
      return String(Number(n).toFixed(6)).replace(/\.?0+$/, "");
    }

    function bbOpenCropper() {
      if (!overlay || !stageHost) return;
      if (!window.Konva) {
        setStatus('Konva failed to load. If you’re on a strict network, try replacing the Konva script with a local file or another CDN.');
        return;
      }
      const svgText = bbAssetLabSvgText || (localStorage.getItem(BB_ASSET_LAB_STORAGE_KEY) || "");
      if (!svgText) {
        setStatus("Upload an SVG first.");
        return;
      }
      cropVb = bbGetRootViewBoxObject(svgText);
      if (!cropVb) {
        setStatus("This SVG has no viewBox. Add one, then try again.");
        return;
      }

      overlay.classList.add("open");
      const hostRect = stageHost.getBoundingClientRect();
      const W = Math.max(320, Math.floor(hostRect.width));
      const H = Math.max(260, Math.floor(hostRect.height));
      stageHost.innerHTML = "";

      cropStage = new Konva.Stage({ container: "bbCropStage", width: W, height: H });
      cropLayer = new Konva.Layer();
      cropStage.add(cropLayer);

      // Render SVG as image using blob URL
      const rasterText = bbSvgForKonvaRaster(svgText);
      const blob = new Blob([rasterText], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        cropImgW = img.naturalWidth || img.width || 1;
        cropImgH = img.naturalHeight || img.height || 1;
        const scale = Math.min(W / cropImgW, H / cropImgH);
        const drawW = cropImgW * scale;
        const drawH = cropImgH * scale;
        const x = (W - drawW) / 2;
        const y = (H - drawH) / 2;
        cropBaseFittedW = drawW;
        cropBaseFittedH = drawH;
        cropImgBounds = { x, y, w: drawW, h: drawH };
        if (scaleSlider) scaleSlider.value = "100";

        cropImageNode = new Konva.Image({
          image: img,
          x,
          y,
          width: drawW,
          height: drawH,
          draggable: true,
        });
        cropLayer.add(cropImageNode);

        cropRect = new Konva.Rect({
          x: x + drawW * 0.06,
          y: y + drawH * 0.10,
          width: drawW * 0.88,
          height: drawH * 0.80,
          stroke: "#0070ff",
          strokeWidth: 2,
          dash: [6, 6],
          draggable: false,
          listening: false,
        });
        cropLayer.add(cropRect);

        // Sliders: move/resize the selection rect and lock its stage position. Dragging the image only updates sliders.
        function applySlidersToRect() {
          if (!cropImgBounds || !cropRect) return;
          const l = Number(leftSlider && leftSlider.value ? leftSlider.value : 6) / 100;
          const r = Number(rightSlider && rightSlider.value ? rightSlider.value : 6) / 100;
          const t = Number(topSlider && topSlider.value ? topSlider.value : 10) / 100;
          const b = Number(bottomSlider && bottomSlider.value ? bottomSlider.value : 10) / 100;
          const x0 = cropImgBounds.x + cropImgBounds.w * l;
          const y0 = cropImgBounds.y + cropImgBounds.h * t;
          const x1 = cropImgBounds.x + cropImgBounds.w * (1 - r);
          const y1 = cropImgBounds.y + cropImgBounds.h * (1 - b);
          const w = Math.max(10, x1 - x0);
          const h = Math.max(10, y1 - y0);
          cropRect.position({ x: x0, y: y0 });
          cropRect.size({ width: w, height: h });
          fixedCropBox = { x: cropRect.x(), y: cropRect.y(), width: cropRect.width(), height: cropRect.height() };
          cropLayer && cropLayer.draw();
        }

        function syncSlidersFromFixedBox() {
          if (!fixedCropBox || !cropImageNode || !cropRect) return;
          const ix = cropImageNode.x();
          const iy = cropImageNode.y();
          const pw = cropImageNode.width();
          const ph = cropImageNode.height();
          const Rx = fixedCropBox.x;
          const Ry = fixedCropBox.y;
          const Rw = fixedCropBox.width;
          const Rh = fixedCropBox.height;
          let l = (Rx - ix) / pw;
          let r = (ix + pw - Rx - Rw) / pw;
          let t = (Ry - iy) / ph;
          let b = (iy + ph - Ry - Rh) / ph;
          l = Math.max(0, Math.min(0.45, l));
          r = Math.max(0, Math.min(0.45, r));
          t = Math.max(0, Math.min(0.45, t));
          b = Math.max(0, Math.min(0.45, b));
          if (l + r > 0.999) {
            const k = 0.999 / (l + r);
            l *= k;
            r *= k;
          }
          if (t + b > 0.999) {
            const k = 0.999 / (t + b);
            t *= k;
            b *= k;
          }
          if (leftSlider) leftSlider.value = String(Math.round(l * 100));
          if (rightSlider) rightSlider.value = String(Math.round(r * 100));
          if (topSlider) topSlider.value = String(Math.round(t * 100));
          if (bottomSlider) bottomSlider.value = String(Math.round(b * 100));
          cropImgBounds = { x: ix, y: iy, w: pw, h: ph };
          cropRect.position({ x: Rx, y: Ry });
          cropRect.size({ width: Rw, height: Rh });
          cropLayer && cropLayer.draw();
        }

        doApplyCropSliders = applySlidersToRect;
        const syncImagePan = () => {
          if (!cropImageNode) return;
          syncSlidersFromFixedBox();
        };

        function applyLogoScale() {
          if (!cropImageNode || !cropBaseFittedW || !cropBaseFittedH) return;
          const pct = Math.max(0.5, Math.min(2, Number(scaleSlider && scaleSlider.value ? scaleSlider.value : 100) / 100));
          const newW = Math.max(8, cropBaseFittedW * pct);
          const newH = Math.max(8, cropBaseFittedH * pct);
          const ix = cropImageNode.x();
          const iy = cropImageNode.y();
          const ow = cropImageNode.width();
          const oh = cropImageNode.height();
          const cx = ix + ow / 2;
          const cy = iy + oh / 2;
          const nix = cx - newW / 2;
          const niy = cy - newH / 2;
          cropImageNode.size({ width: newW, height: newH });
          cropImageNode.position({ x: nix, y: niy });
          cropImgBounds = { x: nix, y: niy, w: newW, h: newH };
          if (fixedCropBox) syncSlidersFromFixedBox();
          else if (doApplyCropSliders) doApplyCropSliders();
        }

        if (scaleSlider) scaleSlider.addEventListener("input", applyLogoScale);
        cropImageNode.on("dragmove", syncImagePan);
        cropImageNode.on("dragend", syncImagePan);
        cropImageNode.on("mouseenter", () => {
          if (cropStage) cropStage.container().style.cursor = "move";
        });
        cropImageNode.on("mouseleave", () => {
          if (cropStage) cropStage.container().style.cursor = "default";
        });

        const sliderEls = [leftSlider, rightSlider, topSlider, bottomSlider].filter(Boolean);
        sliderEls.forEach((el) => el.addEventListener("input", applySlidersToRect));
        applySlidersToRect();

        cropLayer.draw();
        URL.revokeObjectURL(url);
      };
      img.onerror = () => {
        setStatus("Could not render this SVG for cropping.");
        URL.revokeObjectURL(url);
      };
      img.src = url;
    }

    function bbCloseCropper() {
      if (overlay) overlay.classList.remove("open");
      try { cropStage && cropStage.destroy(); } catch {}
      cropStage = cropLayer = cropImageNode = cropRect = cropTransformer = null;
      cropImgBounds = null;
      cropVb = null;
      doApplyCropSliders = null;
      fixedCropBox = null;
      cropBaseFittedW = 0;
      cropBaseFittedH = 0;
    }

    function bbResetCropper() {
      if (leftSlider) leftSlider.value = "6";
      if (rightSlider) rightSlider.value = "6";
      if (topSlider) topSlider.value = "10";
      if (bottomSlider) bottomSlider.value = "10";
      if (scaleSlider) scaleSlider.value = "100";
      if (!cropRect || !cropImageNode || !cropStage) return;
      if (!cropBaseFittedW || !cropBaseFittedH) {
        if (cropImgBounds && doApplyCropSliders) doApplyCropSliders();
        return;
      }
      const Wc = cropStage.width();
      const Hc = cropStage.height();
      const w = cropBaseFittedW;
      const h = cropBaseFittedH;
      const cx = (Wc - w) / 2;
      const cy = (Hc - h) / 2;
      cropImageNode.size({ width: w, height: h });
      cropImageNode.position({ x: cx, y: cy });
      cropImgBounds = { x: cx, y: cy, w, h };
      if (doApplyCropSliders) doApplyCropSliders();
    }

    async function bbSaveCrop() {
  // Base viewBox must always come from the current SVG string
  const svgText = bbAssetLabSvgText || (localStorage.getItem(BB_ASSET_LAB_STORAGE_KEY) || "");

  if (!svgText) {
    setStatus("Upload an SVG first.");
    return;
  }

  const baseVb = bbGetRootViewBoxObject(svgText);

  if (!baseVb) {
    setStatus("This SVG has no viewBox. Add one, then try again.");
    return;
  }

  // Sliders: source of truth
  const fracs = bbGetCropSliderFracs();
  const newVb = bbVbForCropFracs(baseVb, fracs);

  if (!newVb) {
    return;
  }

  const outSvg = bbSetRootViewBoxHard(svgText, newVb);

  // Verify actual viewBox
  const vbActual = bbGetRootViewBoxObject(outSvg);

  if (!bbVbCloseEnough(vbActual, newVb, 0.75)) {
    setStatus(
      `ERROR: viewBox did not apply to SVG text. ` +
      `Wanted: ${bbFmtVb4(newVb)}. Found: ${vbActual ? bbFmtVb4(vbActual) : "NONE"}.`
    );

    bbCloseCropper();
    return;
  }

  // Prepare SVG for browser display
  const finalSvg = bbSvgForKonvaRaster(outSvg) || outSvg;

  const vbAfterNorm = bbGetRootViewBoxObject(finalSvg);

  if (!bbVbCloseEnough(vbAfterNorm, newVb, 0.75)) {
    setStatus(
      `ERROR: viewBox changed after preparing for display. ` +
      `Wanted: ${bbFmtVb4(newVb)}. Found: ${vbAfterNorm ? bbFmtVb4(vbAfterNorm) : "NONE"}.`
    );

    bbCloseCropper();
    return;
  }

  const ratio = bbParseViewBoxRatio(finalSvg) || 1;

  const vb = vbAfterNorm
    ? `${vbAfterNorm.x} ${vbAfterNorm.y} ${vbAfterNorm.w} ${vbAfterNorm.h}`
    : `${newVb.x} ${newVb.y} ${newVb.w} ${newVb.h}`;

  // Apply locally for preview only
  bbApplyUploadedSvgToCss(finalSvg, true);

  bbAssetLabSvgText = finalSvg;
  bbAssetLabTrimViewBox = vb;

  try {
    localStorage.setItem(BB_ASSET_LAB_STORAGE_KEY, finalSvg);
    localStorage.setItem(BB_ASSET_LAB_CROP_SAVED_KEY, "1");
  } catch {}

  updateApplyButtonVisibility();

  setPreview({
    name: localStorage.getItem(BB_ASSET_LAB_FILENAME_KEY) || "upload.svg",
    ratio,
    url: bbAssetLabBlobUrl,
    viewBox: vb
  });

  // Store cropped SVG based on selected logo type
  const logoType = localStorage.getItem("current_logo_type") || "light";

  try {
    if (logoType === "dark") {
      localStorage.setItem("brandbased_dark_logo_cropped_svg", finalSvg);
      localStorage.setItem("brandbased_dark_logo_viewbox", vb);
      localStorage.setItem("brandbased_dark_logo_ratio", String(ratio));
    } else {
      localStorage.setItem("brandbased_light_logo_cropped_svg", finalSvg);
      localStorage.setItem("brandbased_light_logo_viewbox", vb);
      localStorage.setItem("brandbased_light_logo_ratio", String(ratio));
    }

    localStorage.setItem("brandbased_last_cropped_logo_type", logoType);

    setStatus(`${logoType} logo cropped and ready. It will upload when you click Continue.`);

    console.log("Cropped Logo Saved Locally");
    console.log("Logo Type:", logoType);
    console.log("ViewBox:", vb);
    console.log("Ratio:", ratio);
    console.log("SVG:", finalSvg);

  } catch (e) {
    console.error("Local cropped logo save error:", e);
    setStatus("Logo cropped, but failed to save locally. Please try again.");
  }

 // Update small logo preview inside upload cards only
try {

  const blob = new Blob([finalSvg], { type: "image/svg+xml" });

  const previewUrl = URL.createObjectURL(blob);

  if (logoType === "dark") {

    const darkPreview = document.getElementById("dark-logo-preview");

    if (darkPreview) {

      darkPreview.src = previewUrl;
      darkPreview.style.display = "block";

      const darkCard = darkPreview.closest(".logo-card");

      if (darkCard) {
        darkCard.classList.add("has-preview");
      }

    }

  } else {

    const lightPreview = document.getElementById("light-logo-preview");

    if (lightPreview) {

      lightPreview.src = previewUrl;
      lightPreview.style.display = "block";

      const lightCard = lightPreview.closest(".logo-card");

      if (lightCard) {
        lightCard.classList.add("has-preview");
      }

    }

  }

} catch (e) {

  console.warn("Logo preview update skipped:", e);

}

  // Do not call backend here.
  // Final upload will happen on Continue button.

  bbCloseCropper();
}

    if (cropBtn) cropBtn.addEventListener("click", bbOpenCropper);
    if (closeBtn) closeBtn.addEventListener("click", bbCloseCropper);
    if (resetBtn) resetBtn.addEventListener("click", bbResetCropper);
    if (saveBtn) saveBtn.addEventListener("click", bbSaveCrop);
    if (overlay) overlay.addEventListener("click", (e) => { if (e.target === overlay) bbCloseCropper(); });

    /**
     * Swaps in-text logo marks to the uploaded asset (data-brand=upload + enhance).
     * @returns {boolean} true if at least one mark was updated
     */
    function bbApplyUploadedAssetToMarks(opts) {
      const o = opts || {};
      const silent = !!o.silent;
      const closeAssetPanel = o.closeAssetPanel !== false;
      const marks = Array.from(document.querySelectorAll(".brandbased-dynamic-logo-slot")).filter(
        (el) => !el.closest(".popup") && el.getAttribute("data-bb-fixed") !== "1"
      );
      if (!marks.length) {
        if (!silent) setStatus("No marks found on page.");
        return false;
      }
      bbSmartMemoryCache.clear();
      bbSmartInFlight.clear();
      bbForceSmartFetch = true;
      try {
        const keys = Object.keys(localStorage || {});
        for (const k of keys) {
          if (k.startsWith(BB_SMART_SIZE_CACHE_PREFIX)) localStorage.removeItem(k);
        }
      } catch {}
      stripBrandEnhancements();
      marks.forEach((el) => {
        el.dataset.brand = "upload";
      });
      enhanceBrandMarks();

      // Brand Settings: also update the threshold “logo chip” to match the active uploaded logo.
      try {
        const chip = document.querySelector(".bb-threshold-chip");
        if (chip) {
          // The uploaded SVG is applied into CSS as a blob URL; mirror it in the chip.
          if (bbAssetLabBlobUrl) chip.style.setProperty("--bb-chip-logo", `url("${bbAssetLabBlobUrl}")`);
          chip.textContent = " ";
        }
      } catch {}
      setTimeout(() => {
        bbForceSmartFetch = false;
      }, 1200);
      requestAnimationFrame(() => {
        const marks2 = Array.from(document.querySelectorAll(".brandbased-dynamic-logo-slot")).filter(
          (el) => !el.closest(".popup")
        );
        marks2.forEach((el) => el.classList.remove("bb-swap-pulse"));
        requestAnimationFrame(() => {
          marks2.forEach((el) => el.classList.add("bb-swap-pulse"));
          setTimeout(() => marks2.forEach((el) => el.classList.remove("bb-swap-pulse")), 650);
        });
      });
      if (closeAssetPanel && panel) panel.classList.remove("open");
      if (!silent) setStatus("Applied. All marks now use your uploaded SVG.");
      return true;
    }

    if (applyBtn) {
      applyBtn.addEventListener("click", () => {
        bbApplyUploadedAssetToMarks({ silent: false, closeAssetPanel: true });
      });
    }

    // Restore last uploaded SVG (if any) — runs on all pages (including Brand-Settings-Module.html).
    try {
      const cached = localStorage.getItem(BB_ASSET_LAB_STORAGE_KEY) || "";
      if (cached && /<\s*svg\b/i.test(cached)) {
        const { ratio } = bbApplyUploadedSvgToCss(cached);
        bbAssetLabSvgText = cached;
        const rvb = bbGetRootViewBoxObject(cached);
        const vbl = rvb ? `${rvb.x} ${rvb.y} ${rvb.w} ${rvb.h}` : "(unknown)";
        setStatus(
          localStorage.getItem(BB_ASSET_LAB_CROP_SAVED_KEY) === "1"
            ? "Restored last SVG. Open Brand Fit Setup and Save to update logos."
            : "Restored last SVG. Open Brand Fit Setup, then Save to update logos in the text."
        );
        setPreview({ name: "Restored upload", ratio, url: bbAssetLabBlobUrl, viewBox: vbl });
        // If a crop was explicitly saved, treat it as the active “golden upload” on pages without the upload UI.
        try {
          if (localStorage.getItem(BB_ASSET_LAB_CROP_SAVED_KEY) === "1") {
            bbApplyUploadedAssetToMarks({ silent: true, closeAssetPanel: true });
          }
        } catch {}
      }
    } catch {}
    updateApplyButtonVisibility();
  }

  bbInitAssetLabUi();
  bbInitPlacementPanelUi();
  bbInitBrandSettingsUi();
  /* Standalone Team Console page (no placement panel): wire OpenAI key UI */
  if (document.getElementById("bbTeamConsoleRoot")) {
    bbInitDevOpenaiKeyUi();
  }
  try {
    bbApplyGuidanceLrPadFromText();
  } catch {}

  function bbGetTypographyContext(el) {
    const cs = window.getComputedStyle(el);
    const fontSize = cs.fontSize || "";
    const lineHeight = cs.lineHeight || "";
    const textLength = (el.textContent || "").trim().length;
    return {
      fontSize,
      lineHeight,
      textLength,
      fontSizePx: bbNumberFromCssPx(fontSize),
      lineHeightPx: bbNumberFromCssPx(lineHeight),
      capHeightRatio: 0.7,
    };
  }

  function bbIsBrandAiSmartOn() {
    try {
      const v = localStorage.getItem(BB_BRAND_AI_SMART_KEY);
      if (v === null) return true;
      return v === "1" || v === "true";
    } catch {
      return true;
    }
  }
  function bbSetBrandAiSmartOn(on) {
    try {
      localStorage.setItem(BB_BRAND_AI_SMART_KEY, on ? "1" : "0");
    } catch {}
  }
  function bbRatioToFractionLabel(ratio) {
    const x = Number(ratio);
    if (!Number.isFinite(x) || x <= 0) return null;
    const maxDen = 30;
    let h1 = 1,
      h0 = 0,
      k1 = 0,
      k0 = 1;
    let b = x;
    for (let i = 0; i < 20; i++) {
      const a = Math.floor(b);
      const h2 = a * h1 + h0;
      const k2 = a * k1 + k0;
      if (k2 > maxDen) break;
      h0 = h1;
      h1 = h2;
      k0 = k1;
      k1 = k2;
      const frac = b - a;
      if (frac < 1e-10) break;
      b = 1 / frac;
    }
    if (k1 === 0) return null;
    const n0 = Math.max(1, Math.round(h1));
    const d0 = Math.max(1, Math.round(k1));
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    const g = gcd(n0, d0);
    return { n: Math.round(n0 / g), d: Math.round(d0 / g) };
  }
  function bbGetGoldenReferenceForApi() {
    const svg = (bbAssetLabSvgText && String(bbAssetLabSvgText).trim()) || "";
    if (!svg || !/<\s*svg\b/i.test(svg)) return null;
    const vb = bbGetRootViewBoxObject(svg);
    if (!vb || !Number.isFinite(vb.w) || !Number.isFinite(vb.h) || vb.h === 0) return null;
    const ratio = vb.w / vb.h;
    const f = bbRatioToFractionLabel(ratio);
    const logoRatioText = f ? `${f.n}:${f.d} (${ratio.toFixed(3)})` : ratio.toFixed(3);
    let currentUpload = "Restored upload";
    try {
      currentUpload = localStorage.getItem(BB_ASSET_LAB_FILENAME_KEY) || "Restored upload";
    } catch {}
    return {
      currentUpload,
      logoRatio: ratio,
      logoRatioText,
      trimViewBox: bbFmtVb4(vb),
    };
  }
  function bbClearSmartSizeCaches() {
    bbSmartMemoryCache.clear();
    try {
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(BB_SMART_SIZE_CACHE_PREFIX)) toRemove.push(k);
      }
      toRemove.forEach((tk) => {
        try {
          localStorage.removeItem(tk);
        } catch {}
      });
    } catch {}
  }
  function bbRefreshAllSmartSizing() {
    bbClearSmartSizeCaches();
    bbForceSmartFetch = true;
    document.querySelectorAll(".brandbased-dynamic-logo-slot.bb-enhanced").forEach((el) => {
      if (el.closest(".popup")) return;
      if (el.__bbSmartClass) {
        el.classList.remove(el.__bbSmartClass);
        el.__bbSmartClass = "";
      }
      el.classList.remove(BB_AI_SIZE_CLASS);
      el.__bbSmartKey = "";
      bbApplySmartSizing(el);
    });
    setTimeout(() => {
      bbForceSmartFetch = false;
    }, 2000);
  }

  function bbSmartCacheKey(brand, ctx) {
    // brand + context combination (string key so we only call AI once per combo)
    const dk = bbHashStr(bbGetDevOpenaiKey());
    return `${BB_SMART_SIZE_CACHE_PREFIX}${brand}|${ctx.fontSize}|${ctx.lineHeight}|${ctx.textLength}|${dk}`;
  }

  function bbHashStr(s) {
    let h = 5381;
    const str = String(s || "");
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) + h) ^ str.charCodeAt(i);
    }
    return (h >>> 0).toString(36);
  }

  function bbGetDynStyleEl() {
    let el = document.getElementById(BB_SMART_DYNAMIC_STYLE_ID);
    if (!el) {
      el = document.createElement("style");
      el.id = BB_SMART_DYNAMIC_STYLE_ID;
      document.head.appendChild(el);
    }
    return el;
  }

  function bbDynClassForKey(key) {
    return `bb-smart-${bbHashStr(key)}`;
  }

  function bbEnsureDynRule(key, vars) {
    const className = bbDynClassForKey(key);
    if (bbSmartDynInserted.has(className)) return className;
    const styleEl = bbGetDynStyleEl();
    const decls = [
      `--bb-scale:${vars.scale}`,
      `--bb-offset-x:${vars.offsetXem}`,
      `--bb-offset-y:${vars.offsetYem}`,
      `--bb-size-mul:${vars.sizeMul}`,
      `--bb-max-w-mul:${vars.maxWMul}`,
      `--bb-user-offset-y-px:${vars.userOffsetYpx}`,
      `--bb-user-offset-y-em:${vars.userOffsetYem}`,
    ];
    styleEl.appendChild(document.createTextNode(`.${className}{${decls.join(";")}}`));
    bbSmartDynInserted.add(className);
    return className;
  }

  async function bbFetchBrandSvgText(brand) {
    const safe = String(brand || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "");
    if (!safe) return "";

    // Special: uploaded asset isn't a file; it's cached as SVG text in localStorage.
    if (safe === "upload") {
      try {
        const cached = localStorage.getItem(BB_ASSET_LAB_STORAGE_KEY) || "";
        if (cached && /<\s*svg\b/i.test(cached)) return cached;
      } catch {}
      return "";
    }

    try {
      // Prefer trimmed assets when present so slot sizing matches what we render.
      const candidates = [`content/${safe}.trim.svg`, `content/${safe}.svg`];
      for (const url of candidates) {
        const r = await fetch(url, { cache: "force-cache" });
        if (!r.ok) continue;
        const t = (await r.text()) || "";
        if (t && /<\s*svg\b/i.test(t)) return t;
      }
      return "";
    } catch {
      return "";
    }
  }

  function bbSetSmartVars(el, result) {
    if (!result) return;
    const scale = typeof result.scale === "number" ? result.scale : 1;
    const offsetX = typeof result.offsetX === "number" ? result.offsetX : 0;
    const offsetY = typeof result.offsetY === "number" ? result.offsetY : 0;
    const sizeMul = typeof result.sizeMul === "number" ? result.sizeMul : 1;
    const maxWMul = typeof result.maxWMul === "number" ? result.maxWMul : 2;

    const key = el.__bbSmartKey;
    if (!key) return;

    const src = (result && result.__bbSource != null && String(result.__bbSource)) || "";
    if (src.startsWith("openai")) {
      el.classList.add(BB_AI_SIZE_CLASS);
    } else {
      el.classList.remove(BB_AI_SIZE_CLASS);
    }

    // If backend provides smart padding suggestion and user hasn't overridden it, store it (Brand AI on only).
    const hasUserPxRule = bbGetUserOffsetYpx() > 0;
    if (
      bbIsBrandAiSmartOn() &&
      !hasUserPxRule &&
      typeof result.paddingBottomPx === "number"
    ) {
      el.__bbUserOffsetYpx = `${result.paddingBottomPx}px`;
    }

    const className = bbEnsureDynRule(key, {
      scale: String(scale),
      offsetXem: `${offsetX}em`,
      offsetYem: `${offsetY}em`,
      sizeMul: String(sizeMul),
      maxWMul: String(maxWMul),
      userOffsetYpx: el.__bbUserOffsetYpx || "0px",
      userOffsetYem: el.__bbUserOffsetYem || "0em",
    });

    if (el.__bbSmartClass && el.__bbSmartClass !== className) el.classList.remove(el.__bbSmartClass);
    el.__bbSmartClass = className;
    el.classList.add(className);

    if (String(el.dataset.brand || "").toLowerCase() === "upload" && bbIsBrandAiSmartOn()) {
      for (const prop of BB_PLACEMENT_PROPS) {
        try {
          el.style.removeProperty(prop);
        } catch {}
      }
      try {
        bbReapplyGuidanceLrAfterBrandAiStrip(el);
      } catch {}
    }
  }

  function bbRecordSmartSizeMeta(result, brand, fromCache) {
    const r = result || {};
    let src = (r.__bbSource && String(r.__bbSource)) || "";
    if (fromCache && !src) src = "local_cache";
    bbLastSmartSizeMeta = {
      source: src,
      brand: String(brand || ""),
      fromCache: !!fromCache,
      at: Date.now(),
    };
    try {
      void bbUpdatePlacementAiStatus();
    } catch {}
  }

  function bbPingApi() {
    return BB_SMART_SIZE_API.replace(/\/api\/bb\/smart-size\/?$/, "/api/bb/ping");
  }

  function bbGetDevOpenaiKey() {
    const el = document.getElementById("bbDevOpenaiKey");
    if (el) {
      const v = String(el.value || "").trim();
      if (v) return v;
    }
    try {
      return String(localStorage.getItem(BB_DEV_OPENAI_KEY) || "").trim();
    } catch {
      return "";
    }
  }

  function bbPingKeySourceNote(ping) {
    if (!ping) return "";
    const s = String(ping.openaiKeySource || "");
    if (s === "dev_header") return " · key: page (dev)";
    if (s === "both") return " · page key overrides .env on smart-size";
    if (s === "env") return " · key: .env";
    return "";
  }

  function bbDevOpenaiPingHeaders() {
    const k = bbGetDevOpenaiKey();
    if (!k) return {};
    return { "X-BB-Dev-OpenAI-Key": k };
  }

  let _bbDevKeyPingTimer = null;

  function bbInitDevOpenaiKeyUi() {
    const input = document.getElementById("bbDevOpenaiKey");
    const clearB = document.getElementById("bbDevOpenaiKeyClear");
    if (!input) return;
    try {
      const stored = String(localStorage.getItem(BB_DEV_OPENAI_KEY) || "");
      if (stored && !input.value) input.value = stored;
    } catch {}
    const save = () => {
      try {
        localStorage.setItem(BB_DEV_OPENAI_KEY, String(input.value || ""));
      } catch {}
    };
    const debouncedStatus = () => {
      clearTimeout(_bbDevKeyPingTimer);
      _bbDevKeyPingTimer = setTimeout(() => {
        void bbUpdatePlacementAiStatus();
      }, 400);
    };
    input.addEventListener("input", () => {
      save();
      debouncedStatus();
    });
    input.addEventListener("change", () => {
      save();
      void bbUpdatePlacementAiStatus();
    });
    if (clearB) {
      clearB.addEventListener("click", () => {
        input.value = "";
        try {
          localStorage.removeItem(BB_DEV_OPENAI_KEY);
        } catch {}
        bbClearSmartSizeCaches();
        void bbUpdatePlacementAiStatus();
        try {
          input.focus();
        } catch {}
      });
    }
  }

  async function bbUpdatePlacementAiStatus() {
    const p = document.getElementById("bbPlaceAiStatus");
    if (!p) return;
    if (!bbIsBrandAiSmartOn()) {
      p.hidden = true;
      p.textContent = "";
      return;
    }
    p.hidden = false;

    let ping = null;
    try {
      const r = await fetch(bbPingApi(), { cache: "no-store", headers: bbDevOpenaiPingHeaders() });
      if (r.ok) ping = await r.json();
    } catch (e) {
      p.textContent = "Status — could not reach " + bbPingApi() + " (start API on 8001).";
      return;
    }
    if (!ping || String(ping.ok) !== "true") {
      p.textContent = "Status — unexpected ping response from API.";
      return;
    }
    if (String(ping.openaiKeyLoaded) !== "yes") {
      const inf = String(ping.openaiKeyInEnvFile || "");
      if (String(ping.dotenvFileExists) === "no") {
        p.textContent =
          "Status — no .env at " +
          (ping.dotenvFilePath || "ui-demo/.env") +
          ". Create it, add OPENAI_API_KEY=... (one line), restart 8001.";
      } else if (inf === "no_line" || inf === "missing") {
        p.textContent =
          "Status — .env exists but has no OPENAI_API_KEY= line. Add exactly: OPENAI_API_KEY=sk-... (one line, no spaces around =), save, restart 8001.";
      } else if (inf === "empty") {
        p.textContent =
          "Status — .env has OPENAI_API_KEY= but the value is empty. Paste a key in “OpenAI API key (local testing)” above, or add the key to .env on one line, save, and restart 8001.";
      } else if (inf === "set") {
        p.textContent =
          "Status — .env contains a key, but the running API process does not. Fully stop and start uvicorn on 8001 (not only reload a tab). If that fails, in Terminal: cd ui-demo && export OPENAI_API_KEY=… && .venv/bin/uvicorn bb_smart_sizing_server:app --port 8001";
      } else {
        p.textContent =
          "Status — .env issue: " +
          (String(ping.pythonDotenvInstalled) === "no"
            ? "install: pip install python-dotenv. "
            : "") +
          "Set OPENAI_API_KEY= (one line), save, restart 8001.";
      }
      return;
    }

    const m = bbLastSmartSizeMeta;
    if (
      !_bbDidStaleKeyAutoRefresh &&
      m &&
      m.source &&
      m.source.indexOf("fallback:no_api_key") >= 0
    ) {
      _bbDidStaleKeyAutoRefresh = true;
      p.textContent =
        "Status — API key is OK (ping). Clearing old “no key” cache and re-running smart size…";
      bbRefreshAllSmartSizing();
      setTimeout(() => {
        void bbUpdatePlacementAiStatus();
      }, 3200);
      return;
    }

    if (!m || !m.source) {
      p.textContent =
        "Status — API key OK (ping)." +
        bbPingKeySourceNote(ping) +
        " Smart-size will show here after a mark loads.";
      return;
    }
    const src = m.source;
    const cache = m.fromCache ? " [cached] " : " ";
    let expl = "";
    if (src === "openai" || (src && src.indexOf("openai") === 0)) {
      if (src.indexOf("golden") >= 0) {
        expl = "Model ran (Brand AI + golden). Non-upload marks used your Asset Lab ratio.";
      } else {
        const lastBrand = String(m.brand || "")
          .trim()
          .toLowerCase();
        if (lastBrand === "upload") {
          expl =
            "Model ran (OpenAI). For the upload / Asset Lab mark we only use alignment (golden is for other in-text brands vs your golden upload). This is expected.";
        } else {
          expl =
            "Model ran (OpenAI) without the golden add-on. Load an SVG in Asset Lab and check a non-upload mark to see ratio-aware sizing.";
        }
      }
    } else if (src.indexOf("fallback:") === 0) {
      expl =
        src.indexOf("no_api_key") >= 0
          ? "Last smart-size still said no key (try hard refresh / restart API). If /api/bb/ping still shows openaiKeyLoaded yes, contact dev."
          : "Fallback heuristics only (not the model). " + (m.source || "");
    } else if (src === "fetch_error" || (src && src.indexOf("http_error") === 0)) {
      expl = "Request failed — is the smart-size server up? (" + String(src) + ")";
    } else if (src === "local_cache") {
      expl =
        "Served from browser cache (older entries may not include API source). Turn Brand AI off and on to force a fresh call.";
    } else if (src === "no_result") {
      expl = "No result object — unexpected.";
    } else {
      expl = String(src);
    }
    p.textContent =
      "Status" +
      cache +
      "— " +
      expl +
      (m.brand ? " · last mark: " + m.brand : "") +
      bbPingKeySourceNote(ping);
  }

  async function bbFetchSmartSize(brand, ctx, svgText) {
    try {
      const baiOn = bbIsBrandAiSmartOn();
      const rules = baiOn ? bbGetSmartRules() : "";
      const st = (svgText && String(svgText).trim()) || "";
      const brandKey = String(brand || "")
        .trim()
        .toLowerCase();
      const golden = baiOn && brandKey && brandKey !== "upload" ? bbGetGoldenReferenceForApi() : null;
      const useBrandAiGolden = !!(baiOn && golden);
      const devK = bbGetDevOpenaiKey();
      const body = JSON.stringify({
        brand,
        context: ctx,
        rules,
        brandAiSmartSize: useBrandAiGolden,
        ...(useBrandAiGolden && golden ? { goldenReference: golden } : {}),
        ...(st ? { svg: st } : {}),
        ...(devK ? { devOpenaiKey: devK } : {}),
      });

      const fetchPromise = fetch(BB_SMART_SIZE_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const timeoutMs = 60000;
      const res = await Promise.race([
        fetchPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
      ]);
      if (!res.ok) {
        let errBody = "";
        try {
          errBody = (await res.text()) || "";
        } catch {}
        const err = {
          scale: 1,
          offsetY: 0,
          offsetX: 0,
          slotW: 35,
          slotH: 35,
          __bbSource: `http_error:${res.status}`,
          __bbError: errBody.slice(0, 200),
          __bbVisionSent: false,
          __bbVisionBytes: 0,
          __bbGeometry: null,
        };
        bbRecordSmartSizeMeta(err, brand, false);
        return err;
      }
      const data = await res.json();
      try {
        data.__bbSource = res.headers.get("X-BB-SmartSize-Source") || "";
        data.__bbKeySource = res.headers.get("X-BB-SmartSize-KeySource") || "";
        data.__bbVisionSent = false;
        data.__bbVisionBytes = 0;
        data.__bbError = res.headers.get("X-BB-SmartSize-Error") || "";
        data.__bbOpenAI = res.headers.get("X-BB-SmartSize-OpenAI") || "";
      } catch {}
      bbRecordSmartSizeMeta(data, brand, false);
      return data;
    } catch (e) {
      const msg = String(e && e.message ? e.message : e);
      const err = {
        scale: 1,
        offsetY: 0,
        offsetX: 0,
        slotW: 35,
        slotH: 35,
        __bbSource: "fetch_error",
        __bbError: msg.slice(0, 200),
        __bbVisionSent: false,
        __bbVisionBytes: 0,
        __bbGeometry: null,
      };
      bbRecordSmartSizeMeta(err, brand, false);
      return err;
    }
  }

  async function bbApplySmartSizing(el) {
    const brand = el?.dataset?.brand;
    if (!brand) return;
    const ctx = bbGetTypographyContext(el);
    const baiForRules = bbIsBrandAiSmartOn();
    const rules = baiForRules ? bbGetSmartRules() : "";
    const userOffsetYpx = baiForRules ? bbGetUserOffsetYpx() : 0;
    const userOffsetYem = baiForRules ? bbGetUserOffsetYem() : 0;
    const brandKey0 = String(brand || "")
      .trim()
      .toLowerCase();
    const g0 =
      baiForRules && brandKey0 && brandKey0 !== "upload" ? bbGetGoldenReferenceForApi() : null;
    const goldenKey = g0
      ? bbHashStr(`${g0.currentUpload}|${g0.trimViewBox}|${String(g0.logoRatio)}`) || "g"
      : "none";
    const svgText = await bbFetchBrandSvgText(brand);
    const svgKey = bbHashStr(svgText) || "none";
    const key = `${bbSmartCacheKey(brand, ctx)}|rules:${rules}|uoy:${userOffsetYpx}|uoyem:${userOffsetYem}|svg:${svgKey}|bai:${baiForRules ? 1 : 0}|g:${goldenKey}`;
    el.__bbSmartKey = key;

    // Fast path: in-memory cache (avoids localStorage + duplicate elements)
    if (!bbForceSmartFetch && bbSmartMemoryCache.has(key)) {
      bbApplyUserRulesToEl(el);
      const cached = bbSmartMemoryCache.get(key);
      bbRecordSmartSizeMeta(cached, brand, true);
      bbSetSmartVars(el, cached);
      return cached;
    }

    if (!bbForceSmartFetch) {
      try {
        const cached = localStorage.getItem(key);
        if (cached) {
          const parsed = JSON.parse(cached);
          bbSmartMemoryCache.set(key, parsed);
          bbApplyUserRulesToEl(el);
          bbRecordSmartSizeMeta(parsed, brand, true);
          bbSetSmartVars(el, parsed);
          return parsed;
        }
      } catch {
        // localStorage blocked/unavailable: proceed without caching
      }
    }

    // Dedup concurrent calls for the same brand+context
    if (!bbSmartInFlight.has(key)) {
      bbSmartInFlight.set(
        key,
        bbFetchSmartSize(brand, ctx, svgText).finally(() => {
          bbSmartInFlight.delete(key);
        })
      );
    }

    const result = await bbSmartInFlight.get(key);
    if (!result) {
      // Graceful: still set defaults so it's obvious system ran.
      bbApplyUserRulesToEl(el);
      const nr = { scale: 1, offsetY: 0, offsetX: 0, __bbSource: "no_result" };
      bbRecordSmartSizeMeta(nr, brand, false);
      bbSetSmartVars(el, nr);
      return null;
    }

    bbSmartMemoryCache.set(key, result);
    bbApplyUserRulesToEl(el);
    bbSetSmartVars(el, result);
    try {
      localStorage.setItem(key, JSON.stringify(result));
    } catch {
      // ignore cache write failures
    }
    return result;
  }

  /** Brand Settings page: inline logos show a hint pill instead of the premium popup. */
  function bbIsBrandSettingsPage() {
    try {
      return document.body?.classList?.contains("bb-brand-settings-page");
    } catch {
      return false;
    }
  }

  function bbShowBrandSettingsThemeHint(anchorEl) {
    try {
      document.getElementById("bbBsThemeHintPill")?.remove();
    } catch {}
    const wrap = document.createElement("div");
    wrap.id = "bbBsThemeHintPill";
    wrap.className = "bb-bs-theme-hint-pill";
    wrap.setAttribute("role", "status");
    wrap.textContent = "Click Theme Design to enable popup (next step)";
    document.body.appendChild(wrap);

    const r = anchorEl.getBoundingClientRect();
    const maxW = Math.min(320, window.innerWidth - 24);
    let left = r.left + r.width / 2 - maxW / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - maxW - 12));
    let top = r.bottom + 10;
    const estH = 48;
    if (top + estH > window.innerHeight - 12) {
      top = Math.max(12, r.top - estH - 8);
    }
    wrap.style.left = `${left}px`;
    wrap.style.top = `${top}px`;
    wrap.style.width = `${maxW}px`;

    const dismiss = () => {
      try {
        wrap.remove();
      } catch {}
      try {
        document.removeEventListener("click", onDoc, true);
      } catch {}
      try {
        window.clearTimeout(tid);
      } catch {}
    };
    const onDoc = (e) => {
      if (wrap.contains(e.target)) return;
      dismiss();
    };
    const tid = window.setTimeout(dismiss, 4500);
    window.setTimeout(() => {
      try {
        document.addEventListener("click", onDoc, true);
      } catch {}
    }, 0);
  }

  function openModalForBrandMark(el) {
    if (bbIsBrandSettingsPage()) {
      bbShowBrandSettingsThemeHint(el);
      return;
    }
    if (!el || el.closest(".popup")) return;
    if (document.querySelector(".popup.popup-visible")) return;
    const popup =
      el.parentElement?.querySelector?.(".popup") ||
      document.querySelector(".popup") ||
      createPopup(el);
    if (!popup) return;
    popup.classList.add("popup-visible");
    popup.style.opacity = "1";
    popup.style.pointerEvents = "auto";

    // Restore original behavior: close “X” appears after ~2s.
    try {
      const closeIconDesktop = popup.querySelector(".close-icon-desktop");
      const closeXIcon = popup.querySelector(".close-x-icon");
      const lockIcon = popup.querySelector(".lock-icon-bb-logo");
      if (closeIconDesktop) closeIconDesktop.style.display = "none";
      if (closeXIcon) {
        closeXIcon.classList.remove("show");
        closeXIcon.style.opacity = "0";
        closeXIcon.style.pointerEvents = "none";
      }
      if (lockIcon) lockIcon.style.marginRight = "0px";
      popup.classList.remove("close-visible");

      window.clearTimeout(popup.__bbCloseTimer);
      popup.__bbCloseTimer = window.setTimeout(() => {
        try {
          if (!popup.classList.contains("popup-visible")) return;
          if (closeIconDesktop) closeIconDesktop.style.display = "block";
          if (closeXIcon) {
            closeXIcon.classList.add("show");
            closeXIcon.style.opacity = "1";
            closeXIcon.style.pointerEvents = "auto";
          }
          if (lockIcon) lockIcon.style.marginRight = "30px";
          popup.classList.add("close-visible");
        } catch {}
      }, 2000);
    } catch {}
  }

  function attachBrandClick(el) {
    if (bbIsBrandSettingsPage()) return;
    if (bbBrandClickControllers.has(el)) return;
    const ac = new AbortController();
    el.addEventListener(
      "click",
      () => {
        openModalForBrandMark(el);
      },
      { signal: ac.signal }
    );
    bbBrandClickControllers.set(el, ac);
  }

  function detachBrandClick(el) {
    bbBrandClickControllers.get(el)?.abort();
    bbBrandClickControllers.delete(el);
  }

  function bbSetPlacementSlidersInteractivity() {
    const on = bbIsBrandAiSmartOn();
    for (const sel of [
      ".bb-place-size",
      ".bb-place-w",
      ".bb-place-h",
      ".bb-place-padl",
      ".bb-place-padr",
      ".bb-place-padt",
      ".bb-place-padb",
    ]) {
      const inp = document.querySelector(sel);
      if (inp) inp.disabled = on;
    }
    const wrap = document.getElementById("bbPlaceSliders");
    if (wrap) wrap.classList.toggle("bb-place-sliders--locked", on);
  }

  function bbUpdatePlacementPanelHints() {
    const manual = document.getElementById("bbPlaceManualHint");
    const golden = document.getElementById("bbPlaceGoldenHint");
    const ai = bbIsBrandAiSmartOn();
    if (manual) manual.hidden = !ai;
    if (golden) {
      const g = bbGetGoldenReferenceForApi();
      golden.hidden = !ai || !!g;
    }
  }

  function bbGetUploadTextMarks() {
    return Array.from(document.querySelectorAll(".brandbased-dynamic-logo-slot.bb-enhanced")).filter(
      (el) => el.dataset.brand === "upload" && !el.closest(".popup")
    );
  }

  /** Marks that receive guidance L/R padding from Admin / model-guidance text (upload + Brand Settings preview). */
  function bbGetGuidancePadTargetMarks() {
    const seen = new Set();
    const out = [];
    const add = (el) => {
      if (!el || seen.has(el)) return;
      if (el.closest?.(".popup")) return;
      seen.add(el);
      out.push(el);
    };
    for (const el of bbGetUploadTextMarks()) add(el);
    document
      .querySelectorAll("#bbPreviewHost .brandbased-dynamic-logo-slot, #bbThemeSimulatedHost .brandbased-dynamic-logo-slot")
      .forEach((el) => add(el));
    return out;
  }

  /** Brand Settings preview + Theme Settings simulated marks (persist placement from sliders / storage). */
  function bbGetPreviewPlacementMarks() {
    const out = [];
    const seen = new Set();
    document
      .querySelectorAll(
        "#bbPreviewHost .brandbased-dynamic-logo-slot, #bbThemeSimulatedHost .brandbased-dynamic-logo-slot"
      )
      .forEach((el) => {
        if (!el || el.closest?.(".popup")) return;
        if (!el.classList.contains("bb-enhanced")) return;
        if (seen.has(el)) return;
        seen.add(el);
        out.push(el);
      });
    return out;
  }

  function bbPlacementSlidersPresent() {
    return !!(document.querySelector(".bb-place-size") && document.querySelector(".bb-place-w"));
  }

  /** Same numeric mapping as sliders when `#bb-place-*` inputs are absent (e.g. Brand Theme Settings page). */
  function bbReadPlacementFromStoredRecord() {
    let o = null;
    try {
      o = JSON.parse(localStorage.getItem(BB_PLACEMENT_KEY) || "null");
    } catch {
      o = null;
    }
    const padChunk = (k) =>
      `${Math.max(0, Math.min(40, Number(o && o[k] != null && o[k] !== "" ? o[k] : 0))) / 100}em`;
    const mul = (sk, dv) =>
      Math.max(0.5, Math.min(1.5, Number(o && o[sk] != null && o[sk] !== "" ? o[sk] : dv) / 100));
    if (!o || typeof o !== "object") {
      return {
        sizeMul: 1,
        wMul: 1,
        hMul: 1,
        padL: "0em",
        padR: "0em",
        padT: "0em",
        padB: "0em",
      };
    }
    return {
      sizeMul: mul("s", 100),
      wMul: mul("w", 100),
      hMul: mul("h", 100),
      padL: padChunk("l"),
      padR: padChunk("r"),
      padT: padChunk("t"),
      padB: padChunk("b"),
    };
  }

  /** After Brand AI clears placement vars, re-apply L/R from guidance (inline beats .BB-AI-Size 0em). */
  function bbReapplyGuidanceLrAfterBrandAiStrip(el) {
    if (!el) return;
    const pr = bbExtractGuidancePadLRpx(bbGetSmartRules());
    if (pr.l != null) el.style.setProperty("--bb-place-pad-l", `${pr.l}px`);
    else el.style.removeProperty("--bb-place-pad-l");
    if (pr.r != null) el.style.setProperty("--bb-place-pad-r", `${pr.r}px`);
    else el.style.removeProperty("--bb-place-pad-r");
  }

  /**
   * Sets --bb-place-pad-l/r from Admin model-guidance text. Only while Brand AI is on;
   * when off, placement sliders / refresh paths clear these vars separately.
   */
  function bbApplyGuidanceLrPadFromText() {
    if (!bbIsBrandAiSmartOn()) return;
    const pr = bbExtractGuidancePadLRpx(bbGetSmartRules());
    for (const el of bbGetGuidancePadTargetMarks()) {
      if (pr.l != null) el.style.setProperty("--bb-place-pad-l", `${pr.l}px`);
      else el.style.removeProperty("--bb-place-pad-l");
      if (pr.r != null) el.style.setProperty("--bb-place-pad-r", `${pr.r}px`);
      else el.style.removeProperty("--bb-place-pad-r");
    }
  }

  function bbUpdatePlaceButtonVisibility() {
    const b = document.getElementById("bbPlaceBtn");
    const p = document.getElementById("bbPlacePanel");
    if (!b) return;
    if (bbGetUploadTextMarks().length > 0) {
      b.classList.add("bb-place-btn--visible");
    } else {
      b.classList.remove("bb-place-btn--visible");
      if (p) {
        p.classList.remove("open");
        p.setAttribute("aria-hidden", "true");
      }
    }
  }

  function bbPlaceSlidersAtDefaults() {
    const s = document.querySelector(".bb-place-size");
    const w = document.querySelector(".bb-place-w");
    const h = document.querySelector(".bb-place-h");
    const l = document.querySelector(".bb-place-padl");
    const r = document.querySelector(".bb-place-padr");
    const t = document.querySelector(".bb-place-padt");
    const b = document.querySelector(".bb-place-padb");
    if (!s || !w || !h || !l || !r || !t || !b) return false;
    return (
      Number(s.value) === 100 &&
      Number(w.value) === 100 &&
      Number(h.value) === 100 &&
      Number(l.value) === 0 &&
      Number(r.value) === 0 &&
      Number(t.value) === 0 &&
      Number(b.value) === 0
    );
  }

  function bbReadPlacementFromSliders() {
    const s = document.querySelector(".bb-place-size");
    const w = document.querySelector(".bb-place-w");
    const h = document.querySelector(".bb-place-h");
    const pl = document.querySelector(".bb-place-padl");
    const pr = document.querySelector(".bb-place-padr");
    const pt = document.querySelector(".bb-place-padt");
    const pb = document.querySelector(".bb-place-padb");
    const padEm = (el) => `${Math.max(0, Math.min(40, Number(el && el.value !== "" ? el.value : 0))) / 100}em`;
    return {
      sizeMul: Math.max(0.5, Math.min(1.5, Number(s && s.value !== "" ? s.value : 100) / 100)),
      wMul: Math.max(0.5, Math.min(1.5, Number(w && w.value !== "" ? w.value : 100) / 100)),
      hMul: Math.max(0.5, Math.min(1.5, Number(h && h.value !== "" ? h.value : 100) / 100)),
      padL: padEm(pl),
      padR: padEm(pr),
      padT: padEm(pt),
      padB: padEm(pb),
    };
  }

  function bbApplyPlacementSlidersToUploadMarks() {
    // Turning Brand AI off: strip guidance-driven L/R on upload + preview marks so slider em can take over.
    if (!bbIsBrandAiSmartOn()) {
      for (const el of bbGetGuidancePadTargetMarks()) {
        try {
          el.style.removeProperty("--bb-place-pad-l");
          el.style.removeProperty("--bb-place-pad-r");
        } catch {}
      }
    }
    const marksMap = new Map();
    const addMarks = (list) => {
      for (const el of list) marksMap.set(el, true);
    };
    addMarks(bbGetUploadTextMarks());
    addMarks(bbGetPreviewPlacementMarks());
    const marks = Array.from(marksMap.keys());
    if (!marks.length) {
      try {
        bbApplyGuidanceLrPadFromText();
      } catch {}
      return;
    }
    // Brand AI: smart sizing must own --bb-size-mul / slot vars (class rules lose to inline).
    if (bbIsBrandAiSmartOn()) {
      for (const el of marks) {
        for (const prop of BB_PLACEMENT_PROPS) {
          try {
            el.style.removeProperty(prop);
          } catch {}
        }
      }
      try {
        bbApplyGuidanceLrPadFromText();
      } catch {}
      return;
    }
    const slidersHere = bbPlacementSlidersPresent();
    if (slidersHere && bbPlaceSlidersAtDefaults()) {
      for (const el of marks) {
        for (const prop of BB_PLACEMENT_PROPS) {
          try {
            el.style.removeProperty(prop);
          } catch {}
        }
      }
      try {
        localStorage.removeItem(BB_PLACEMENT_KEY);
      } catch {}
      try {
        bbApplyGuidanceLrPadFromText();
      } catch {}
      return;
    }

    const v = slidersHere ? bbReadPlacementFromSliders() : bbReadPlacementFromStoredRecord();

    for (const el of marks) {
      el.style.setProperty("--bb-size-mul", String(v.sizeMul));
      el.style.setProperty("--bb-place-w-mul", String(v.wMul));
      el.style.setProperty("--bb-place-h-mul", String(v.hMul));
      el.style.setProperty("--bb-place-pad-l", v.padL);
      el.style.setProperty("--bb-place-pad-r", v.padR);
      el.style.setProperty("--bb-place-pad-t", v.padT);
      el.style.setProperty("--bb-place-pad-b", v.padB);
    }
    if (slidersHere) {
      try {
        const size = document.querySelector(".bb-place-size");
        const w = document.querySelector(".bb-place-w");
        const h = document.querySelector(".bb-place-h");
        const l = document.querySelector(".bb-place-padl");
        const r = document.querySelector(".bb-place-padr");
        const t = document.querySelector(".bb-place-padt");
        const b = document.querySelector(".bb-place-padb");
        localStorage.setItem(
          BB_PLACEMENT_KEY,
          JSON.stringify({
            s: size ? size.value : "100",
            w: w ? w.value : "100",
            h: h ? h.value : "100",
            l: l ? l.value : "0",
            r: r ? r.value : "0",
            t: t ? t.value : "0",
            b: b ? b.value : "0",
          })
        );
      } catch {}
    }
    try {
      bbApplyGuidanceLrPadFromText();
    } catch {}
  }

  function bbSetPlacementSlidersFromStorage() {
    const size = document.querySelector(".bb-place-size");
    const w = document.querySelector(".bb-place-w");
    const h = document.querySelector(".bb-place-h");
    const l = document.querySelector(".bb-place-padl");
    const r = document.querySelector(".bb-place-padr");
    const t = document.querySelector(".bb-place-padt");
    const b = document.querySelector(".bb-place-padb");
    if (!size || !w || !h || !l || !r || !t || !b) return;
    let o = null;
    try {
      o = JSON.parse(localStorage.getItem(BB_PLACEMENT_KEY) || "null");
    } catch {
      o = null;
    }
    if (o && typeof o === "object") {
      size.value = o.s != null ? String(o.s) : "100";
      w.value = o.w != null ? String(o.w) : "100";
      h.value = o.h != null ? String(o.h) : "100";
      l.value = o.l != null ? String(o.l) : "0";
      r.value = o.r != null ? String(o.r) : "0";
      t.value = o.t != null ? String(o.t) : "0";
      b.value = o.b != null ? String(o.b) : "0";
    } else {
      size.value = "100";
      w.value = "100";
      h.value = "100";
      l.value = "0";
      r.value = "0";
      t.value = "0";
      b.value = "0";
    }
  }

  function bbResetPlacementSliders() {
    const size = document.querySelector(".bb-place-size");
    const w = document.querySelector(".bb-place-w");
    const h = document.querySelector(".bb-place-h");
    const l = document.querySelector(".bb-place-padl");
    const r = document.querySelector(".bb-place-padr");
    const t = document.querySelector(".bb-place-padt");
    const b = document.querySelector(".bb-place-padb");
    if (size) size.value = "100";
    if (w) w.value = "100";
    if (h) h.value = "100";
    if (l) l.value = "0";
    if (r) r.value = "0";
    if (t) t.value = "0";
    if (b) b.value = "0";
  }

  function bbInitPlacementPanelUi() {
    const placeBtn = document.getElementById("bbPlaceBtn");
    const placePanel = document.getElementById("bbPlacePanel");
    if (!placePanel) return;
    /* API key UI lives on Admin Team Console only — not inside Custom placement */
    if (document.getElementById("bbDevOpenaiWrap")) bbInitDevOpenaiKeyUi();
    // Optional: edit the same model guidance text here (mirrors the floating panel).
    try {
      const gInput = document.getElementById("bbPlaceGuidanceInput");
      const gSave = document.getElementById("bbPlaceGuidanceSave");
      const gClear = document.getElementById("bbPlaceGuidanceClear");
      const gStatus = document.getElementById("bbPlaceGuidanceStatus");
      if (gInput) gInput.value = bbGetSmartRules();
      const setStatus = (t) => {
        if (!gStatus) return;
        gStatus.textContent = t || "";
      };
      const syncFloating = (rulesText) => {
        const f = document.querySelector(".bb-smart-rules-input");
        if (f) f.value = rulesText;
      };
      const applyRules = (rulesText) => {
        clearTimeout(_bbGuidanceDebounce);
        syncFloating(String(rulesText ?? ""));
        bbCommitGuidanceToStorageAndRefresh(rulesText);
        setStatus(String(rulesText || "").trim() ? "Saved" : "");
      };
      if (gSave && gInput) {
        gSave.addEventListener("click", () => {
          applyRules(String(gInput.value || ""));
        });
      }
      if (gClear && gInput) {
        gClear.addEventListener("click", () => {
          gInput.value = "";
          applyRules("");
        });
      }
      if (gInput) {
        const floatSt = document.querySelector(".bb-smart-rules-status");
        gInput.addEventListener("input", () => {
          bbScheduleGuidanceCommit(String(gInput.value || ""), floatSt);
        });
        gInput.addEventListener("keydown", (e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            try {
              applyRules(String(gInput.value || ""));
            } catch {}
          }
        });
      }
    } catch {}
    const brandAiBtn = document.getElementById("bbPlaceBrandAiToggle");
    if (brandAiBtn) {
      const syncBrandAiBtn = () => {
        const on = bbIsBrandAiSmartOn();
        brandAiBtn.setAttribute("aria-pressed", on ? "true" : "false");
        brandAiBtn.textContent = on ? "On" : "Off";
        // Brand Settings: drive the iridescent shimmer state on the Adaptive card.
        try {
          const adaptive = brandAiBtn.closest?.(".bb-adaptive-card");
          if (adaptive) adaptive.classList.toggle("bb-adaptive-on", on);
        } catch {}
      };
      syncBrandAiBtn();
      brandAiBtn.addEventListener("click", () => {
        bbSetBrandAiSmartOn(!bbIsBrandAiSmartOn());
        syncBrandAiBtn();
        if (!bbIsBrandAiSmartOn()) {
          bbSetPlacementSlidersFromStorage();
          bbApplyPlacementSlidersToUploadMarks();
        } else {
          bbApplyPlacementSlidersToUploadMarks();
        }
        bbSetPlacementSlidersInteractivity();
        bbUpdatePlacementPanelHints();
        bbUpdatePlacementAiStatus();
        bbRefreshAllSmartSizing();
      });
    }
    const inputs = [
      ".bb-place-size",
      ".bb-place-w",
      ".bb-place-h",
      ".bb-place-padl",
      ".bb-place-padr",
      ".bb-place-padt",
      ".bb-place-padb",
    ]
      .map((sel) => document.querySelector(sel))
      .filter(Boolean);
    const closeB = placePanel.querySelector(".bb-place-close");
    const resetB = placePanel.querySelector(".bb-place-reset");
    const doneB = placePanel.querySelector(".bb-place-apply");
    const close = () => {
      placePanel.classList.remove("open");
      placePanel.setAttribute("aria-hidden", "true");
    };
    const open = () => {
      if (brandAiBtn) {
        const on = bbIsBrandAiSmartOn();
        brandAiBtn.setAttribute("aria-pressed", on ? "true" : "false");
        brandAiBtn.textContent = on ? "On" : "Off";
      }
      bbSetPlacementSlidersInteractivity();
      bbUpdatePlacementPanelHints();
      bbUpdatePlacementAiStatus();
      bbSetPlacementSlidersFromStorage();
      bbApplyPlacementSlidersToUploadMarks();
      placePanel.classList.add("open");
      placePanel.setAttribute("aria-hidden", "false");
    };
    const staticPanelMode = !placeBtn;
    if (!staticPanelMode && placeBtn) {
      placeBtn.addEventListener("click", () => {
        if (!bbGetUploadTextMarks().length) return;
        if (placePanel.classList.contains("open")) {
          close();
        } else {
          open();
        }
      });
    } else {
      // Brand Settings page: panel is always visible, no popup behavior.
      try {
        placePanel.classList.add("open");
        placePanel.setAttribute("aria-hidden", "false");
      } catch {}
      try {
        if (closeB) closeB.style.display = "none";
        if (doneB) doneB.style.display = "none";
      } catch {}
      open();
    }
    if (closeB) closeB.addEventListener("click", close);
    if (doneB) doneB.addEventListener("click", close);
    if (resetB) {
      resetB.addEventListener("click", () => {
        bbResetPlacementSliders();
        bbApplyPlacementSlidersToUploadMarks();
      });
    }
    for (const inp of inputs) {
      inp.addEventListener("input", () => {
        bbApplyPlacementSlidersToUploadMarks();
      });
    }
    bbSetPlacementSlidersInteractivity();
    bbUpdatePlacementPanelHints();
    bbUpdatePlacementAiStatus();
    bbUpdatePlaceButtonVisibility();
  }

  /** Resolver: brand class + bb-enhanced (paths from CSS .bb-* tokens); click → modal. */
  function enhanceBrandMarks() {
    const threshold = bbGetReplaceThreshold();
    let replaced = 0;
    document.querySelectorAll(".brandbased-dynamic-logo-slot").forEach((el) => {
      if (el.closest(".popup")) return;
      if (el.classList.contains("bb-enhanced")) return;
      const brand = el.dataset.brand;
      if (!brand) return;
      const token = bbBrandClass(brand);
      if (!token) return;
      if (threshold === 0) return;
      if (replaced >= threshold) return;

      el.classList.add(token, "bb-enhanced");
      bbApplySmartSizing(el);
      attachBrandClick(el);
      replaced += 1;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.classList.add("slide-up");
        });
      });
    });
    bbUpdatePlaceButtonVisibility();
    if (!bbIsBrandAiSmartOn()) {
      const hasPlacementMarks =
        bbGetUploadTextMarks().length > 0 || bbGetPreviewPlacementMarks().length > 0;
      if (hasPlacementMarks) {
        if (bbPlacementSlidersPresent()) bbSetPlacementSlidersFromStorage();
        bbApplyPlacementSlidersToUploadMarks();
      }
    }
  }

  function stripBrandEnhancements() {
    document.querySelectorAll(".brandbased-dynamic-logo-slot").forEach((el) => {
      if (el.closest(".popup")) return;
      detachBrandClick(el);
      const token = bbBrandClass(el.dataset.brand);
      if (token) el.classList.remove(token);
      // Safety: always remove any lingering bb-* brand token classes.
      // This prevents `bb-nike` + `bb-upload` from stacking and fighting over `--bb-logo`.
      try {
        for (const c of Array.from(el.classList)) {
          if (typeof c === "string" && c.startsWith("bb-") && c !== "bb-enhanced" && c !== "bb-swap-pulse") {
            el.classList.remove(c);
          }
        }
      } catch {}
      el.classList.remove("bb-enhanced", "slide-up", BB_AI_SIZE_CLASS);
      if (el.__bbSmartClass) el.classList.remove(el.__bbSmartClass);
      el.__bbSmartClass = "";
      el.__bbSmartKey = "";
      el.__bbUserOffsetYpx = "";
      el.__bbUserOffsetYem = "";
      for (const prop of BB_PLACEMENT_PROPS) {
        try {
          el.style.removeProperty(prop);
        } catch {}
      }
    });
    // Popups are overlays; remove them globally.
    try {
      document.querySelectorAll(".popup").forEach((popup) => popup.remove());
    } catch {}
    bbUpdatePlaceButtonVisibility();
  }

  function createPopup(brandHost) {
  const existing = document.querySelector(".popup");
  if (existing) return existing;

  const popup = document.createElement("div");
  popup.className = "popup";
  popup.style.opacity = "0";
  popup.style.pointerEvents = "none";
  popup.style.transition = "all 0.3s ease";
  popup.innerHTML = `
    <div class="blur-bg"></div> 
    <div class="popup-handle"></div>
    <div class="title-row">
      <div class="brand-icon" aria-hidden="true"></div>
      <div class="product-title">Product Display Name</div>
    </div>
    <div class="lock-icon-bb-logo"><img src="brandbased-logo.svg" style="width: 60%; height: 60%;" /></div>
    <div class="close-icon-desktop">
      <div class="close-x-icon" aria-label="Close popup" role="button" tabindex="0">
        <svg viewBox="0 0 24 24" fill="none">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </div>
    </div>


    <div class="product-top-section">
      <div class="product-element">
       
        <div class="swiper swiper-thumb">
          <div class="swiper-wrapper">
            <div class="swiper-slide"><img src="bb-placeholder-image1.png" alt=""></div>
            <div class="swiper-slide"><img src="bb-placeholder-image2.png" alt=""></div>
            <div class="swiper-slide"><img src="bb-placeholder-image3.png" alt=""></div>
          </div>
          <div class="swiper-pagination"></div>
        </div>

        
        <div class="slider-close-up">
         

          <span class="close">
  <svg width="24" height="24" viewBox="0 0 24 24">
    <line x1="5" y1="5" x2="19" y2="19" stroke="white" stroke-width="3" stroke-linecap="round"/>
    <line x1="19" y1="5" x2="5" y2="19" stroke="white" stroke-width="3" stroke-linecap="round"/>
  </svg>
</span>
          <div class="swiper slider-close-up-swiper">
            <div class="swiper-wrapper">
             
              <div class="swiper-slide"><img src="bb-placeholder-image1.png" alt=""></div>
<div class="swiper-slide"><img src="bb-placeholder-image2.png" alt=""></div>
<div class="swiper-slide"><img src="bb-placeholder-image3.png" alt=""></div>

            </div>
            <a class="bb-icon-close-up" href="https://brandbased.ai/" target="_blank" rel="noopener noreferrer" aria-label="BrandBased — visit brandbased.ai">
              <img src="brandbased-logo.svg" alt="" width="40" height="40" decoding="async" />
            </a>
            <div class="zoom-toggle-btn" role="button" tabindex="0" aria-label="Zoom">+</div>
            <div class="swiper-pagination"></div>
            <div class="swiper-button-next"></div>
            <div class="swiper-button-prev"></div>
          </div>
        </div>
      </div>
      

      <div class="text-section">
        <span class="product-description-holder">
          <span class="product-description">
              <p>Every product has a story, and yours is no exception. Share what inspired its creation, the craftsmanship or technology behind it, and the unique qualities that make it stand out. Highlight the details that customers will notice and appreciate, from the design and materials to the thoughtful features that make their life easier or more enjoyable. Tell them why this product is more than just an item—it’s an experience, a solution, or a statement they can connect with. The more your customers understand the value and passion behind your product, the more they’ll be drawn to it and excited to make it their own.</p>
            </span>
        </span>
      </div>
    </div>
    <div class="selectors-row">
      <select class="product-qty"><option>Qty</option><option>1</option><option>2</option><option>3</option><option>4</option></select>
      <select class="product-size"><option>Size</option><option>S</option><option>M</option><option>L</option><option>XL</option></select>
      <select class="product-color"><option>Colour</option><option>OG Grinch</option><option>Reverse Grinch</option><option>Ice Grinch</option></select>
    </div>
    <div class="buy-now-row">
      <a href="#" target="_blank" class="explore-link" aria-label="Explore">
        <div class="explore-icon-when-buy-now-is-used"><img src="explore icon.svg" style="width: 100%; height: 100%;" /></div>
      </a>
      <a href="https://buy.stripe.com/28EcN42WJgtX1XR7OB6J202" target="_blank" class="buy-now-link">
        <span class="buy-now-button">Buy Now</span>
      </a>
    </div>
    <div class="add-element">
      <video src="add-sample.mp4" width="100%" height="100%" autoplay muted loop playsinline style="object-fit: cover; border-radius: 8px; display: block;"></video>
      <div class="ad-label">Ad</div>
    </div>
  `;

  // Always mount to body so it never affects layout (matches original “correct” behavior).
  document.body.appendChild(popup);

  const brandSlug = brandHost.dataset.brand;
  const brandIconEl = popup.querySelector(".brand-icon");
  const token = bbBrandClass(brandSlug);
  if (token && brandIconEl) {
    brandIconEl.classList.add(token);
  }

  /*** INIT SWIPERS FOR THIS POPUP ***/
  const thumbSwiper = new Swiper(popup.querySelector('.swiper-thumb'), {
    slidesPerView: 1,
    spaceBetween: 10,
    pagination: {
      el: popup.querySelector('.swiper-thumb .swiper-pagination'),
      clickable: true,
      dynamicBullets: true,
    },
  });

  const sliderCloseUpSwiper = new Swiper(popup.querySelector('.slider-close-up-swiper'), {
    slidesPerView: 1,
    spaceBetween: 10,
    navigation: {
      nextEl: popup.querySelector('.slider-close-up-swiper .swiper-button-next'),
      prevEl: popup.querySelector('.slider-close-up-swiper .swiper-button-prev')
    },
    pagination: {
      el: popup.querySelector('.slider-close-up-swiper .swiper-pagination'),
      clickable: true,
      dynamicBullets: true
    }
  });





  const sliderCloseUp = popup.querySelector('.slider-close-up');
  const closeBtn = popup.querySelector('.slider-close-up .close');

  // Keep the close-up X consistently inset from the viewport edges (>= 780px).
  const bbPositionCloseUpX = () => {
    if (!sliderCloseUp || !closeBtn) return;
    if (window.innerWidth < 780) {
      // Let mobile CSS own placement.
      closeBtn.style.removeProperty("top");
      closeBtn.style.removeProperty("right");
      closeBtn.style.removeProperty("margin-top");
      closeBtn.style.removeProperty("margin-right");
      return;
    }
    // Deterministic inset: fixed right inset; top nudged -10px for optical alignment.
    // (We avoid env(safe-area-*) parsing because it isn't reliably numeric via getComputedStyle.)
    const inset = 16;
    closeBtn.style.top = `${inset - 10}px`;
    closeBtn.style.right = `${inset}px`;
    // Neutralize any earlier margin-based nudges so this always wins.
    closeBtn.style.marginTop = "0";
    closeBtn.style.marginRight = "0";
  };
  try {
    window.addEventListener("resize", bbPositionCloseUpX, { passive: true });
    window.addEventListener("orientationchange", bbPositionCloseUpX, { passive: true });
  } catch {}

  // Open close-up when clicking thumbnail slide
  popup.querySelectorAll('.swiper-thumb .swiper-slide').forEach((slide, index) => {
    slide.addEventListener('click', () => {
      sliderCloseUp.style.display = 'flex';
      // Position after layout has updated (avoids race with style recalcs on some sizes).
      try { requestAnimationFrame(() => requestAnimationFrame(bbPositionCloseUpX)); } catch {}
      sliderCloseUpSwiper.slideTo(index, 0);

      sliderCloseUpSwiper.slides.forEach(s => {
        const v = s.querySelector('video');
        if (v) {
          v.setAttribute('controls','faulse');
          v.pause();
        }
      });

      const activeVideo = sliderCloseUpSwiper.slides[index].querySelector('video');
      if (activeVideo) activeVideo.play();
    });
  });

  // Pause other videos when changing slides
  sliderCloseUpSwiper.on('slideChange', () => {
    sliderCloseUpSwiper.slides.forEach(s => {
      const v = s.querySelector('video');
      if (v) v.pause();
    });
    const currentVideo = sliderCloseUpSwiper.slides[sliderCloseUpSwiper.activeIndex].querySelector('video');
    if (currentVideo) currentVideo.play();
  });

  // Close close-up view
  closeBtn.onclick = () => { sliderCloseUp.style.display = 'none'; };
  sliderCloseUp.addEventListener('click', e => {
    if (e.target === sliderCloseUp) sliderCloseUp.style.display = 'none';
  });

  // If close-up is ever shown/hidden via style changes, keep X positioned correctly.
  try {
    const mo = new MutationObserver(() => {
      if (sliderCloseUp && sliderCloseUp.style.display === "flex") bbPositionCloseUpX();
    });
    mo.observe(sliderCloseUp, { attributes: true, attributeFilter: ["style"] });
  } catch {}









  // Multi-level zoom (cycle): 1x → 1.7x → 2.6x → 1x
  const ZOOM_LEVELS = [1, 1.7, 2.6];
  const zoomBtns = Array.from(popup.querySelectorAll(".slider-close-up .zoom-toggle-btn")).filter(Boolean);
  const closeUpEl = popup.querySelector(".slider-close-up");
  const getActiveMedia = () => {
    const slide = sliderCloseUpSwiper.slides[sliderCloseUpSwiper.activeIndex];
    if (!slide) return { slide: null, media: null };
    const media = slide.querySelector("img,video");
    return { slide, media };
  };
  const setPan = (slide, tx, ty) => {
    if (!slide) return;
    slide.dataset.panX = String(Number(tx) || 0);
    slide.dataset.panY = String(Number(ty) || 0);
  };
  const getPan = (slide) => {
    return {
      x: Number(slide?.dataset?.panX || "0") || 0,
      y: Number(slide?.dataset?.panY || "0") || 0,
    };
  };
  const getZoomIdx = (slide) => Number(slide?.dataset?.zoomLevel || "0") || 0;
  const applyTransform = (slide) => {
    if (!slide) return;
    const m = slide.querySelector("img,video");
    if (!m) return;
    const idx = getZoomIdx(slide);
    const z = ZOOM_LEVELS[idx] || 1;
    const p = getPan(slide);
    m.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) scale(${z})`;
    m.style.cursor = idx === 0 ? "zoom-in" : "grab";
  };
  const applyZoomLevel = (levelIdx) => {
    sliderCloseUpSwiper.slides.forEach((s) => {
      s.dataset.zoomLevel = "0";
      setPan(s, 0, 0);
      const m = s.querySelector("img,video");
      if (m) {
        m.style.transform = "translate3d(0px, 0px, 0) scale(1)";
        m.style.cursor = "zoom-in";
      }
    });
    const { slide, media } = getActiveMedia();
    if (!slide || !media) return;
    const idx = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, Number(levelIdx) || 0));
    slide.dataset.zoomLevel = String(idx);
    setPan(slide, 0, 0);
    applyTransform(slide);
    for (const b of zoomBtns) {
      try {
        b.textContent = idx === ZOOM_LEVELS.length - 1 ? "–" : "+";
      } catch {}
    }
  };
  const bumpZoom = () => {
    const { slide } = getActiveMedia();
    if (!slide) return;
    const cur = Number(slide.dataset.zoomLevel || "0") || 0;
    const next = (cur + 1) % ZOOM_LEVELS.length;
    applyZoomLevel(next);
  };
  for (const zoomBtn of zoomBtns) {
    zoomBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      bumpZoom();
    });
    zoomBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        bumpZoom();
      }
    });
  }
  // Double-click / double-tap the media to cycle zoom.
  sliderCloseUpSwiper.slides.forEach((s) => {
    s.addEventListener("dblclick", (e) => {
      const t = e.target;
      if (t && (t.tagName === "IMG" || t.tagName === "VIDEO")) bumpZoom();
    });
  });
  let _bbLastTapAt = 0;
  sliderCloseUpSwiper.slides.forEach((s) => {
    s.addEventListener(
      "touchend",
      (e) => {
        const t = e.target;
        if (!t || (t.tagName !== "IMG" && t.tagName !== "VIDEO")) return;
        const now = Date.now();
        if (now - _bbLastTapAt < 280) {
          try {
            e.preventDefault();
          } catch {}
          bumpZoom();
          _bbLastTapAt = 0;
        } else {
          _bbLastTapAt = now;
        }
      },
      { passive: false }
    );
  });
  // Mobile robustness: Swiper can swallow slide-level taps. Also listen on the close-up swiper root.
  try {
    const closeUpSwiperRoot = popup.querySelector(".slider-close-up .slider-close-up-swiper");
    if (closeUpSwiperRoot) {
      // Desktop robustness: some browsers don't emit dblclick reliably inside Swiper;
      // use click.detail (2+) to detect a double-click on media.
      closeUpSwiperRoot.addEventListener(
        "click",
        (e) => {
          if ((e.detail || 0) < 2) return;
          const path = (typeof e.composedPath === "function" ? e.composedPath() : []) || [];
          const t = (path.find((n) => n && n.tagName === "IMG") ||
            path.find((n) => n && n.tagName === "VIDEO") ||
            e.target);
          if (!t || (t.tagName !== "IMG" && t.tagName !== "VIDEO")) return;
          bumpZoom();
        },
        { passive: true }
      );
      closeUpSwiperRoot.addEventListener(
        "touchend",
        (e) => {
          const path = (typeof e.composedPath === "function" ? e.composedPath() : []) || [];
          const t = (path.find((n) => n && n.tagName === "IMG") ||
            path.find((n) => n && n.tagName === "VIDEO") ||
            e.target);
          if (!t || (t.tagName !== "IMG" && t.tagName !== "VIDEO")) return;
          const now = Date.now();
          if (now - _bbLastTapAt < 280) {
            try {
              e.preventDefault();
            } catch {}
            bumpZoom();
            _bbLastTapAt = 0;
          } else {
            _bbLastTapAt = now;
          }
        },
        { passive: false }
      );
    }
  } catch {}
  sliderCloseUpSwiper.on("slideChange", () => applyZoomLevel(0));

  // Drag/pan when zoomed in (pointer events)
  let _bbPan = null; // { id, slide, startX, startY, baseX, baseY }
  const onDown = (e) => {
    const t = e.target;
    if (!t || (t.tagName !== "IMG" && t.tagName !== "VIDEO")) return;
    const { slide } = getActiveMedia();
    if (!slide) return;
    const idx = getZoomIdx(slide);
    const z = ZOOM_LEVELS[idx] || 1;
    if (z <= 1.001) return;
    try { e.preventDefault(); } catch {}
    const p = getPan(slide);
    _bbPan = { id: e.pointerId, slide, startX: e.clientX, startY: e.clientY, baseX: p.x, baseY: p.y, z };
    try { t.setPointerCapture(e.pointerId); } catch {}
    t.style.cursor = "grabbing";
  };
  const onMove = (e) => {
    if (!_bbPan || e.pointerId !== _bbPan.id) return;
    const dx = (e.clientX - _bbPan.startX) / (_bbPan.z || 1);
    const dy = (e.clientY - _bbPan.startY) / (_bbPan.z || 1);
    setPan(_bbPan.slide, _bbPan.baseX + dx, _bbPan.baseY + dy);
    applyTransform(_bbPan.slide);
  };
  const onUp = (e) => {
    if (!_bbPan || e.pointerId !== _bbPan.id) return;
    const { slide } = _bbPan;
    _bbPan = null;
    try {
      const m = slide?.querySelector("img,video");
      if (m) m.style.cursor = "grab";
    } catch {}
  };
  if (closeUpEl) {
    closeUpEl.addEventListener("pointerdown", onDown);
    closeUpEl.addEventListener("pointermove", onMove);
    closeUpEl.addEventListener("pointerup", onUp);
    closeUpEl.addEventListener("pointercancel", onUp);
    closeUpEl.addEventListener("pointerleave", onUp);
  }






//max the close X close-up icon sit in the correct location by making popup modal larger when close-up slider is open
document.querySelectorAll('.slider-close-up').forEach(slider => {
  const popup = slider.closest('.popup');
  if (!popup) return;
  const closeBtn = slider.querySelector('.close');
  if (!closeBtn) return;

  const observer = new MutationObserver(mutations => {
    // Only apply changes on large screens
    if (window.innerWidth < 980) return;

    mutations.forEach(mutation => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
        if (slider.style.display === 'flex') {
          // slider-close-up is visible → adjust popup
          popup.style.minWidth = '80%';
          popup.style.height = '80%';

          // Animate .close opacity each time
          closeBtn.style.transition = 'none';
          closeBtn.style.opacity = '0';
          void closeBtn.offsetWidth; // force reflow
          closeBtn.style.transition = 'opacity 1s ease';
          closeBtn.style.opacity = '1';

        } else {
          // slider-close-up hidden → reset popup
          popup.style.minWidth = '';
          popup.style.height = '';
        }
      }
    });
  });

  observer.observe(slider, { attributes: true, attributeFilter: ['style'] });

  // Optional: handle window resize
  window.addEventListener('resize', () => {
    if (window.innerWidth < 980) {
      popup.style.minWidth = '';
      popup.style.height = '';
    } else if (slider.style.display === 'flex') {
      popup.style.minWidth = '80%';
      popup.style.height = '78%';
    }
  });
});






  




  

const positionPopup = () => {
  if (window.innerWidth < 840) {
    popup.style.position = '';
    popup.style.top = '';
    popup.style.left = '';
    popup.style.transform = '';
    popup.style.zIndex = '';
  } else {
    popup.style.position = 'fixed';
    popup.style.top = '50%';
    popup.style.left = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
    popup.style.zIndex = '9999';
  }
};

    positionPopup();
    window.addEventListener('resize', positionPopup);

    const closeIconDesktop = popup.querySelector('.close-icon-desktop');
    closeIconDesktop?.addEventListener('click', () => {
      popup.classList.remove('popup-visible');
      popup.style.opacity = '0';
      popup.style.pointerEvents = 'none';
      try {
        window.clearTimeout(popup.__bbCloseTimer);
      } catch {}
    });

    // Mobile-only: delayed handle close and swipe down
    const popupHandle = popup.querySelector('.popup-handle');
    let canCloseMobile = false;
    let touchStartY = 0;

    setTimeout(() => {
      canCloseMobile = true;
    }, 2000);

    popupHandle?.addEventListener('click', () => {
      if (canCloseMobile) {
        popup.classList.remove('popup-visible');
        popup.style.opacity = '0';
        popup.style.pointerEvents = 'none';
      }
    });

    popupHandle?.addEventListener('touchstart', (e) => {
      touchStartY = e.touches[0].clientY;
    });

    popupHandle?.addEventListener('touchend', (e) => {
      const touchEndY = e.changedTouches[0].clientY;
      if (canCloseMobile && touchEndY - touchStartY > 40) {
        popup.classList.remove('popup-visible');
        popup.style.opacity = '0';
        popup.style.pointerEvents = 'none';
      }
    });

    // Mobile: swipe down anywhere to close.
    // Swiper can stop propagation on inner nodes, so listen on document capture and filter for this popup.
    let _bbDocSwipe = null; // { x, y }
    const bbCanSwipeClosePopup = () => {
      if (window.innerWidth > 980) return false;
      if (!popup.classList.contains("popup-visible")) return false;
      // Don't close if close-up overlay is open.
      if (popup.querySelector(".slider-close-up")?.style?.display === "flex") return false;
      return true;
    };
    const onDocTouchStart = (e) => {
      if (!bbCanSwipeClosePopup()) return;
      const t = e.touches && e.touches[0];
      if (!t) return;
      const target = e.target;
      if (!(target instanceof Element)) return;
      // Only if the gesture starts inside this popup.
      if (!target.closest(".popup")) return;
      _bbDocSwipe = { x: t.clientX, y: t.clientY };
    };
    const onDocTouchMove = (e) => {
      if (!bbCanSwipeClosePopup()) return;
      if (!_bbDocSwipe) return;
      const t = e.touches && e.touches[0];
      if (!t) return;
      const dx = t.clientX - _bbDocSwipe.x;
      const dy = t.clientY - _bbDocSwipe.y;
      // If user is clearly swiping horizontally, abort (let Swiper handle it).
      if (Math.abs(dx) > 55 && Math.abs(dy) < 45) _bbDocSwipe = null;
    };
    const onDocTouchEnd = (e) => {
      if (!bbCanSwipeClosePopup()) return;
      const st = _bbDocSwipe;
      _bbDocSwipe = null;
      if (!st) return;
      const t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - st.x;
      const dy = t.clientY - st.y;
      if (dy > 85 && Math.abs(dx) < 45) {
        popup.classList.remove("popup-visible");
        popup.style.opacity = "0";
        popup.style.pointerEvents = "none";
        try {
          window.clearTimeout(popup.__bbCloseTimer);
        } catch {}
      }
    };
    try {
      document.addEventListener("touchstart", onDocTouchStart, { passive: true, capture: true });
      document.addEventListener("touchmove", onDocTouchMove, { passive: true, capture: true });
      document.addEventListener("touchend", onDocTouchEnd, { passive: true, capture: true });
    } catch {}

    return popup;
  }

 // Delay before brand layers + popups
setTimeout(() => {
  if (!brandbasedEnhancementEnabled) return;
  enhanceBrandMarks();

  document.querySelectorAll(".brandbased-dynamic-logo-slot").forEach((host) => {
    if (host.closest(".popup")) return;
    if (bbIsBrandSettingsPage()) return;
    createPopup(host);
  });

}, 2000); // delay before additive BB layers + popups

// Safety net: ensure Brand Settings marks always open a popup even if enhancements haven’t run yet.
document.addEventListener(
  "click",
  (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const el = t.closest(".brandbased-dynamic-logo-slot");
    if (!el || el.closest(".popup")) return;
    openModalForBrandMark(el);
  },
  true
);

  document.querySelector(".header-icon.logo")?.addEventListener("click", () => {
    brandbasedEnhancementEnabled = !brandbasedEnhancementEnabled;
    if (!brandbasedEnhancementEnabled) {
      stripBrandEnhancements();
    } else {
      enhanceBrandMarks();
      document.querySelectorAll(".brandbased-dynamic-logo-slot").forEach((host) => {
        if (host.closest(".popup")) return;
        if (bbIsBrandSettingsPage()) return;
        createPopup(host);
      });
    }
  });

  })();

});
