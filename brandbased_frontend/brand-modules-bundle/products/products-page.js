(() => {
  const $ = (id) => document.getElementById(id);
  const SOURCE_ID = `products:${Math.random().toString(16).slice(2)}`;

  // (Reverted) No file:// theme handoff logic here.

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
  // Also stores the last event so we don't do heavy re-hydrates (prevents Theme Design "blink").
  const SYNC_VERSION_KEY = "bbSync:version:v1";
  const SYNC_EVENT_KEY = "bbSync:lastEvent:v1";
  const bumpSync = (evt) => {
    try {
      const cur = Number(localStorage.getItem(SYNC_VERSION_KEY) || "0") || 0;
      localStorage.setItem(SYNC_VERSION_KEY, String(cur + 1));
    } catch {}
    if (evt && typeof evt === "object") {
      try {
        localStorage.setItem(
          SYNC_EVENT_KEY,
          JSON.stringify({ ...evt, src: SOURCE_ID, t: Date.now() })
        );
      } catch {}
    }
  };

  const nameEl = $("bbProductName");
  const descEl = $("bbProductDescription");
  const priceEl = $("bbProductPrice");
  const currencyEl = $("bbProductCurrency");
  const invEl = $("bbProductInventory");
  const invUnlimitedEl = $("bbProductInvUnlimited");
  const showAvailScarcityEl = $("bbProductShowAvailScarcity");
  const allowQtyChoiceEl = $("bbProductAllowQtyChoice");

  const readInventoryUiFromForm = () => {
    const unlimited = !!(invUnlimitedEl?.checked);
    const invRaw = String(invEl?.value ?? "").trim();
    const invNum = invRaw === "" ? NaN : Number.parseInt(invRaw, 10);
    const soldOut = !unlimited && (!invRaw || !Number.isFinite(invNum) || invNum <= 0);
    const allowQtyChoice = allowQtyChoiceEl ? !!allowQtyChoiceEl.checked : true;
    return { unlimited, invRaw, invNum, soldOut, allowQtyChoice };
  };
  const shipFlatEl = $("bbProductShippingFlat");
  const shipRegionEl = $("bbProductShipRegion");
  const shipGlobalFlatEl = $("bbProductGlobalShippingFlat");
  const shipGlobalExcludedEl = $("bbProductGlobalShipExcluded");
  const shipGlobalExcludedBtnEl = $("bbProductGlobalShipExcludedBtn");
  const shipGlobalExcludedMenuEl = $("bbProductGlobalShipExcludedMenu");
  const pricePrefixEl = $("bbProductPricePrefix");
  const shipFlatPrefixEl = $("bbProductShippingFlatPrefix");
  const shipGlobalFlatPrefixEl = $("bbProductGlobalShippingFlatPrefix");
  const shipModeRegionEl = $("bbProductShipModeRegion");
  const shipModeGlobalEl = $("bbProductShipModeGlobal");
  const shipByRegionWrapEl = $("bbProductsShipByRegionFields");
  const shipGlobalWrapEl = $("bbProductsShipGlobalFields");
  const variantsRoot = $("bbProductsVariantsRoot");
  const uploadEl = $("bbProductsGalleryUpload");
  const listEl = $("bbProductsGalleryList");
  const limitEl = $("bbProductsMediaLimit");

  const getPopup = () => document.querySelector("#bbThemePopupMount .popup") || document.querySelector(".popup");

  /**
   * Fixed “Unavailable Shipping Regions” roster (ISO Alpha‑2 where applicable). Not toggleable —
   * verify against your processor policy before tightening or relaxing this demo list.
   */
  const PLATFORM_UNAVAILABLE_SHIPPING_ROWS = (() => {
    /** @type {{ code: string, name: string, note?: string }[]} */
    const countries = [
      { code: "AF", name: "Afghanistan" },
      { code: "BY", name: "Belarus" },
      { code: "CU", name: "Cuba" },
      { code: "IR", name: "Iran" },
      { code: "IQ", name: "Iraq" },
      { code: "KP", name: "North Korea" },
      { code: "LB", name: "Lebanon" },
      { code: "LY", name: "Libya" },
      { code: "MM", name: "Myanmar" },
      { code: "NI", name: "Nicaragua" },
      { code: "RU", name: "Russia" },
      { code: "SO", name: "Somalia" },
      { code: "SD", name: "Sudan" },
      { code: "SY", name: "Syria" },
      { code: "VE", name: "Venezuela" },
      { code: "YE", name: "Yemen" },
      { code: "ZW", name: "Zimbabwe" },
    ].sort((a, b) => a.name.localeCompare(b.name));
    /** @type {{ code: string, name: string, note?: string }[]} */
    const subnational = [
      {
        code: "",
        name: "Crimea, Donetsk & Luhansk",
        note: "Ukraine — platform policy blocks shipments/payments involving these subnational regions.",
      },
    ];
    return [...countries, ...subnational];
  })();

  const PLATFORM_UNAVAILABLE_ISO = new Set(
    PLATFORM_UNAVAILABLE_SHIPPING_ROWS.flatMap((r) => (String(r.code || "").trim() ? [String(r.code).trim().toUpperCase()] : []))
  );

  /** @type {{ code: string, name: string }[]} Processor-eligible preset destinations only (merchant may exclude optionally). */
  const MERCHANT_EXCLUDABLE_COUNTRY_PRESETS = (() => {
    const rows = [
      { code: "AR", name: "Argentina" },
      { code: "AU", name: "Australia" },
      { code: "AT", name: "Austria" },
      { code: "BH", name: "Bahrain" },
      { code: "BD", name: "Bangladesh" },
      { code: "BE", name: "Belgium" },
      { code: "BO", name: "Bolivia" },
      { code: "BW", name: "Botswana" },
      { code: "BR", name: "Brazil" },
      { code: "BG", name: "Bulgaria" },
      { code: "CA", name: "Canada" },
      { code: "CL", name: "Chile" },
      { code: "CN", name: "China" },
      { code: "CO", name: "Colombia" },
      { code: "CR", name: "Costa Rica" },
      { code: "HR", name: "Croatia" },
      { code: "CY", name: "Cyprus" },
      { code: "CZ", name: "Czechia" },
      { code: "DK", name: "Denmark" },
      { code: "DO", name: "Dominican Republic" },
      { code: "EC", name: "Ecuador" },
      { code: "EG", name: "Egypt" },
      { code: "SV", name: "El Salvador" },
      { code: "EE", name: "Estonia" },
      { code: "ET", name: "Ethiopia" },
      { code: "FI", name: "Finland" },
      { code: "FR", name: "France" },
      { code: "DE", name: "Germany" },
      { code: "GH", name: "Ghana" },
      { code: "GR", name: "Greece" },
      { code: "GT", name: "Guatemala" },
      { code: "HK", name: "Hong Kong" },
      { code: "HU", name: "Hungary" },
      { code: "IS", name: "Iceland" },
      { code: "IN", name: "India" },
      { code: "ID", name: "Indonesia" },
      { code: "IE", name: "Ireland" },
      { code: "IL", name: "Israel" },
      { code: "IT", name: "Italy" },
      { code: "JM", name: "Jamaica" },
      { code: "JP", name: "Japan" },
      { code: "JO", name: "Jordan" },
      { code: "KZ", name: "Kazakhstan" },
      { code: "KE", name: "Kenya" },
      { code: "KW", name: "Kuwait" },
      { code: "LV", name: "Latvia" },
      { code: "LT", name: "Lithuania" },
      { code: "LU", name: "Luxembourg" },
      { code: "MY", name: "Malaysia" },
      { code: "MT", name: "Malta" },
      { code: "MX", name: "Mexico" },
      { code: "MA", name: "Morocco" },
      { code: "NP", name: "Nepal" },
      { code: "NL", name: "Netherlands" },
      { code: "NZ", name: "New Zealand" },
      { code: "NG", name: "Nigeria" },
      { code: "MK", name: "North Macedonia" },
      { code: "NO", name: "Norway" },
      { code: "OM", name: "Oman" },
      { code: "PK", name: "Pakistan" },
      { code: "PA", name: "Panama" },
      { code: "PY", name: "Paraguay" },
      { code: "PE", name: "Peru" },
      { code: "PH", name: "Philippines" },
      { code: "PL", name: "Poland" },
      { code: "PT", name: "Portugal" },
      { code: "QA", name: "Qatar" },
      { code: "RO", name: "Romania" },
      { code: "SA", name: "Saudi Arabia" },
      { code: "RS", name: "Serbia" },
      { code: "SG", name: "Singapore" },
      { code: "SK", name: "Slovakia" },
      { code: "SI", name: "Slovenia" },
      { code: "ZA", name: "South Africa" },
      { code: "KR", name: "South Korea" },
      { code: "ES", name: "Spain" },
      { code: "LK", name: "Sri Lanka" },
      { code: "SE", name: "Sweden" },
      { code: "CH", name: "Switzerland" },
      { code: "TW", name: "Taiwan" },
      { code: "TZ", name: "Tanzania" },
      { code: "TH", name: "Thailand" },
      { code: "TN", name: "Tunisia" },
      { code: "TR", name: "Türkiye" },
      { code: "UG", name: "Uganda" },
      { code: "UA", name: "Ukraine" },
      { code: "AE", name: "United Arab Emirates" },
      { code: "GB", name: "United Kingdom" },
      { code: "US", name: "United States" },
      { code: "UY", name: "Uruguay" },
      { code: "UZ", name: "Uzbekistan" },
      { code: "VN", name: "Vietnam" },
    ].filter((r) => !PLATFORM_UNAVAILABLE_ISO.has(r.code));
    const byCode = new Map(rows.map((r) => [r.code, r]));
    return Array.from(byCode.values()).sort((a, b) => a.name.localeCompare(b.name));
  })();

  const parseExcludedCodes = (raw) => {
    const s = String(raw || "")
      .split(",")
      .map((x) => x.trim().toUpperCase())
      .map((c) => (c === "UK" ? "GB" : c))
      .filter(Boolean);
    return Array.from(new Set(s));
  };

  /** Persisted CSV = merchant-chosen exclusions only (never fixed platform blocklist ISO codes). */
  const merchantExcludedCsvFromRaw = (raw) =>
    parseExcludedCodes(raw)
      .filter((c) => !PLATFORM_UNAVAILABLE_ISO.has(c))
      .sort()
      .join(", ");

  const setExcludedCodesToHiddenInput = (codes) => {
    if (!shipGlobalExcludedEl) return;
    const clean = Array.isArray(codes)
      ? codes
          .map((c) => String(c || "").trim().toUpperCase())
          .map((c) => (c === "UK" ? "GB" : c))
          .filter((c) => c && !PLATFORM_UNAVAILABLE_ISO.has(c))
      : [];
    shipGlobalExcludedEl.value = Array.from(new Set(clean)).sort().join(", ");
  };

  const renderExcludedCountriesUi = () => {
    if (!shipGlobalExcludedBtnEl || !shipGlobalExcludedMenuEl || !shipGlobalExcludedEl) return;
    const active = new Set(parseExcludedCodes(shipGlobalExcludedEl.value));
    const selectedPresets = MERCHANT_EXCLUDABLE_COUNTRY_PRESETS.filter((c) => active.has(c.code));
    const extraCodes = parseExcludedCodes(shipGlobalExcludedEl.value).filter(
      (c) =>
        !PLATFORM_UNAVAILABLE_ISO.has(c) && !MERCHANT_EXCLUDABLE_COUNTRY_PRESETS.some((p) => p.code === c)
    );
    const blockedCount = PLATFORM_UNAVAILABLE_SHIPPING_ROWS.length;
    const labelPieces = [...selectedPresets.map((p) => p.name), ...extraCodes];
    shipGlobalExcludedBtnEl.textContent = labelPieces.length
      ? labelPieces.length <= 2
        ? `Also excluding: ${labelPieces.join(", ")} · ${blockedCount} blocked`
        : `Also excluding: ${labelPieces.slice(0, 2).join(", ")} +${labelPieces.length - 2} (${blockedCount} blocked)`
      : `Optional exclusions (${blockedCount} policy-blocked regions always apply)`;

    shipGlobalExcludedMenuEl.innerHTML = "";

    const unavailWrap = document.createElement("details");
    unavailWrap.className = "bb-products-excl-details";
    unavailWrap.open = false;
    const unavailSum = document.createElement("summary");
    unavailSum.className = "bb-products-excl-summary";
    unavailSum.textContent = "Unavailable Shipping Regions";
    unavailWrap.appendChild(unavailSum);
    const unavailIntro = document.createElement("p");
    unavailIntro.className = "bb-products-excl-help bb-products-excl-help--muted";
    unavailIntro.textContent = "Customers in these regions cannot proceed with shipping or checkout.";
    unavailWrap.appendChild(unavailIntro);

    PLATFORM_UNAVAILABLE_SHIPPING_ROWS.forEach((row) => {
      const rowEl = document.createElement("div");
      rowEl.className = "bb-products-excl-blocked";
      rowEl.setAttribute("role", "presentation");

      const mark = document.createElement("span");
      mark.className = "bb-products-excl-blocked-mark";
      mark.setAttribute("aria-hidden", "true");
      mark.textContent = "•";

      const text = document.createElement("span");
      text.className = "bb-products-excl-blocked-text";

      const nameEl = document.createElement("span");
      nameEl.className = "bb-products-excl-blocked-name";
      nameEl.textContent = row.name;

      text.appendChild(nameEl);
      if (row.code) {
        const codeEl = document.createElement("span");
        codeEl.className = "bb-products-excl-blocked-code";
        codeEl.textContent = row.code;
        text.appendChild(codeEl);
      }
      if (row.note) {
        const noteEl = document.createElement("span");
        noteEl.className = "bb-products-excl-blocked-note";
        noteEl.textContent = row.note;
        text.appendChild(noteEl);
      }
      rowEl.appendChild(mark);
      rowEl.appendChild(text);
      unavailWrap.appendChild(rowEl);
    });
    shipGlobalExcludedMenuEl.appendChild(unavailWrap);

    const sectionLabel = document.createElement("div");
    sectionLabel.className = "bb-products-excl-section-label";
    sectionLabel.textContent = "Optional exclusions";
    shipGlobalExcludedMenuEl.appendChild(sectionLabel);

    const optHelp = document.createElement("p");
    optHelp.className = "bb-products-excl-help";
    optHelp.textContent = "Eligible destination countries — check any you still do not want to ship to.";
    shipGlobalExcludedMenuEl.appendChild(optHelp);

    MERCHANT_EXCLUDABLE_COUNTRY_PRESETS.forEach((c) => {
      const item = document.createElement("label");
      item.className = "bb-products-excl-item";
      item.setAttribute("role", "menuitemcheckbox");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = active.has(c.code);
      const name = document.createElement("span");
      name.className = "bb-products-excl-name";
      name.textContent = c.name;
      const code = document.createElement("span");
      code.className = "bb-products-excl-code";
      code.textContent = c.code;
      name.appendChild(code);
      item.appendChild(cb);
      item.appendChild(name);
      cb.addEventListener("change", () => {
        let next = new Set(parseExcludedCodes(shipGlobalExcludedEl.value));
        if (cb.checked) next.add(c.code);
        else next.delete(c.code);
        next = new Set(Array.from(next).filter((iso) => !PLATFORM_UNAVAILABLE_ISO.has(iso)));
        setExcludedCodesToHiddenInput(Array.from(next));
        renderExcludedCountriesUi();
        applyProductToPopup();
        saveSlotFromForm();
      });
      shipGlobalExcludedMenuEl.appendChild(item);
    });

    extraCodes.forEach((codeRaw) => {
      const orphan = document.createElement("label");
      orphan.className = "bb-products-excl-item bb-products-excl-item--orphan";
      orphan.setAttribute("role", "menuitemcheckbox");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = true;
      const name = document.createElement("span");
      name.className = "bb-products-excl-name";
      name.textContent = codeRaw;
      const codeHint = document.createElement("span");
      codeHint.className = "bb-products-excl-code";
      codeHint.textContent = "custom ISO";
      name.appendChild(codeHint);
      orphan.appendChild(cb);
      orphan.appendChild(name);
      cb.addEventListener("change", () => {
        let next = new Set(parseExcludedCodes(shipGlobalExcludedEl.value));
        next.delete(codeRaw);
        next = new Set(Array.from(next).filter((iso) => !PLATFORM_UNAVAILABLE_ISO.has(iso)));
        setExcludedCodesToHiddenInput(Array.from(next));
        renderExcludedCountriesUi();
        applyProductToPopup();
        saveSlotFromForm();
      });
      shipGlobalExcludedMenuEl.appendChild(orphan);
    });
  };
  const setExcludedMenuOpen = (open) => {
    if (!shipGlobalExcludedBtnEl || !shipGlobalExcludedMenuEl) return;
    const isOpen = !!open;
    shipGlobalExcludedBtnEl.setAttribute("aria-expanded", isOpen ? "true" : "false");
    shipGlobalExcludedMenuEl.hidden = !isOpen;
    if (isOpen) renderExcludedCountriesUi();
  };

  const isDockEnabled = () => {
    try {
      return document.body.classList.contains("bb-theme-dock-enabled");
    } catch {
      return false;
    }
  };

  const ensurePopupFlipWrap = () => {
    const mount = document.getElementById("bbThemePopupMount");
    const popup = getPopup();
    if (!mount || !popup) return null;
    // Avoid moving/wrapping the popup before the Products dock script has finished.
    // If we relocate it early, vendor sizing (and Swiper) can initialize against a clipped container.
    if (!isDockEnabled()) return null;
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

  const setSelectLabel = (sel, label) => {
    if (!sel) return;
    const first = sel.querySelector("option");
    if (!first) return;
    first.textContent = label;
  };

  const renderDescriptionToPopup = (popup, rawText) => {
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

  const MAX_PREVIEW_QTY = 99;

  const snapshotPreviewQtyFromPopup = () => {
    try {
      const popup = getPopup();
      const s = _slots[_slotIdx];
      if (!popup || !s) return;
      const qtySel = popup.querySelector(".bb-products-fixed-qty-select");
      if (!qtySel || qtySel.disabled) return;
      const v = String(qtySel.value || "").trim();
      if (v) s.previewQty = v;
    } catch {}
  };

  const syncFixedQtySelect = (popup) => {
    const row = popup.querySelector(".selectors-row");
    if (!row) return;
    let qtySel = row.querySelector(".bb-products-fixed-qty-select");
    if (!qtySel) {
      qtySel = document.createElement("select");
      qtySel.className = "bb-products-fixed-qty-select";
      qtySel.setAttribute("aria-label", "Quantity");
      row.appendChild(qtySel);
      qtySel.addEventListener("change", () => {
        snapshotVariantSelectionsFromPopup();
        snapshotPreviewQtyFromPopup();
        persistSlot(_slotIdx);
        applyProductToPopup();
      });
    }
    const slotRef = _slots[_slotIdx];
    const { unlimited, invNum, soldOut, allowQtyChoice } = readInventoryUiFromForm();

    // If disabled, never show QTY.
    if (!allowQtyChoice) {
      qtySel.classList.add("bb-products-fixed-qty-select--hidden");
      try {
        qtySel.setAttribute("aria-hidden", "true");
      } catch {}
      qtySel.innerHTML = "";
      qtySel.disabled = true;
      if (slotRef) slotRef.previewQty = "1";
      return;
    }

    let maxQ = MAX_PREVIEW_QTY;
    if (!unlimited) {
      if (!Number.isFinite(invNum) || invNum <= 0) maxQ = 0;
      else maxQ = Math.min(invNum, MAX_PREVIEW_QTY);
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
      qtySel.disabled = true;
      if (slotRef) slotRef.previewQty = "";
      return;
    }

    // If customer quantity choice is enabled, show QTY even when there are no variants.

    qtySel.classList.remove("bb-products-fixed-qty-select--hidden");
    try {
      qtySel.removeAttribute("aria-hidden");
    } catch {}

    const hasVariantsForLabel = Number(popup?.__bbVariantCount || 0) > 0;
    ph.textContent = hasVariantsForLabel ? "Qty" : "Select Qty";
    qtySel.appendChild(ph);

    const saved = String(slotRef?.previewQty || "1").trim();
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
    if (slotRef) slotRef.previewQty = String(qtySel.value || "").trim() || String(want);
  };

  const applyProductToPopup = () => {
    const popup = getPopup();
    if (!popup) return;

    snapshotVariantSelectionsFromPopup();
    snapshotPreviewQtyFromPopup();

    const title = popup.querySelector(".product-title");
    if (title && nameEl) {
      const v = String(nameEl.value || "").trim() || "Product Display Name";
      title.textContent = v;
    }

    if (descEl) renderDescriptionToPopup(popup, descEl.value);

    const basePrice = priceEl ? String(priceEl.value || "").trim() : "";
    const currency = currencyEl ? String(currencyEl.value || "USD").trim() : "USD";

    const s1 = popup.querySelector(".selectors-row select:nth-child(1)");
    const s2 = popup.querySelector(".selectors-row select:nth-child(2)");
    const s3 = popup.querySelector(".selectors-row select:nth-child(3)");
    const selects = [s1, s2, s3].filter(Boolean);

    const rows = variantGroupsForActiveSlot();
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
        opt.textContent = pStr !== "" ? `${lab} · ${fmtMoneySym(currency, pStr)}` : lab;
        if (pStr !== "") opt.setAttribute("data-bb-variant-price", pStr);
        const mi = normalizeMediaIndex(o.mediaIndex);
        if (mi !== "") opt.setAttribute("data-bb-variant-media", String(mi));
        sel.appendChild(opt);
      }
      const slotRef = _slots[_slotIdx];
      if (slotRef) {
        slotRef.variantSelections = normalizeVariantSelections(slotRef.variantSelections);
        const want = String(slotRef.variantSelections[k] || "").trim();
        if (want && [...sel.options].some((o) => o.value === want && !o.disabled)) {
          sel.value = want;
        } else {
          sel.selectedIndex = 0;
          slotRef.variantSelections[k] = "";
        }
      }
      /* Direct change: persist selection + refresh Buy price (snapshot inside apply keeps picks across rebuilds). */
      if (!sel.__bbVariantPriceListenDirect) {
        sel.__bbVariantPriceListenDirect = true;
        sel.addEventListener("change", () => {
          /* Stamp a monotonic tick so syncVariantLinkedGallerySlide can prefer the last-changed select. */
          sel.__bbVariantTouchTick = ++_variantTouchTick;
          snapshotVariantSelectionsFromPopup();
          persistSlot(_slotIdx);
          applyProductToPopup();
        });
      }
    }

    syncFixedQtySelect(popup);

    const rowEl = popup.querySelector(".selectors-row");
    if (rowEl) {
      rowEl.classList.remove(
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
      const variantCols = Math.min(3, rows.length);
      const qtySelNow = popup.querySelector(".bb-products-fixed-qty-select");
      const qtyHidden =
        !!qtySelNow?.classList.contains("bb-products-fixed-qty-select--hidden");
      const qtyVisible = !!qtySelNow && !qtyHidden;
      const visibleCount = variantCols + (qtyVisible ? 1 : 0);
      if (visibleCount === 0) rowEl.classList.add("bb-products-selectors-row--empty");
      else
        rowEl.classList.add(
          `bb-products-selectors--cols-${Math.min(4, visibleCount)}`
        );
    }

    const invBuy = readInventoryUiFromForm();
    const soldOutBuy = invBuy.soldOut;
    const showAvailInline =
      !!(showAvailScarcityEl?.checked) &&
      !invBuy.unlimited &&
      Number.isFinite(invBuy.invNum) &&
      invBuy.invNum > 0 &&
      !soldOutBuy;

    // Put the price *inside* the Buy Now button (inline next to label).
    try {
      const buyBtn = popup.querySelector(".buy-now-button");
      if (buyBtn) {
        try {
          popup.querySelectorAll(".bb-products-buy-now-price").forEach((n) => {
            if (n && n !== buyBtn) n.remove();
          });
        } catch {}
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

        if (!buyBtn.__bbQtyUnlockListen) {
          buyBtn.__bbQtyUnlockListen = true;
          buyBtn.addEventListener("click", () => {
            try {
              const s = _slots[_slotIdx];
              if (!s) return;
              const vCount = Number(popup?.__bbVariantCount || 0) || 0;
              if (vCount > 0) return; // already visible; no unlock needed
              if (!s.qtyUnlocked) {
                s.qtyUnlocked = true;
                persistSlot(_slotIdx);
              }
              applyProductToPopup();
            } catch {}
          });
        }

        if (soldOutBuy) {
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

          const tier = readEffectivePriceFromSelectors(popup);
          const amount = String(tier !== "" ? tier : basePrice || "").trim();
          const pretty = amount ? fmtMoneySym(currency, amount) : "";

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
            /* Below this threshold the copy switches to a scarcity nudge ("Only N left"). */
            const LOW_STOCK_THRESHOLD = 25;
            const n = invBuy.invNum;
            availBit.textContent =
              n < LOW_STOCK_THRESHOLD
                ? ` · Only ${n} left`
                : ` · ${n} available`;
            availBit.style.display = "inline";
          } else {
            availBit.textContent = "";
            availBit.style.display = "none";
          }
        }

        try {
          buyBtn.style.display = "inline-flex";
          buyBtn.style.alignItems = "center";
          buyBtn.style.gap = "8px";
          buyBtn.style.justifyContent = "center";
          availBit.style.font = "inherit";
          availBit.style.opacity = "0.82";
          availBit.style.fontWeight = "600";
          availBit.style.whiteSpace = "nowrap";
        } catch {}
      }
    } catch {}

    syncVariantLinkedGallerySlide(popup);
  };

  const revokeAll = (arr) => {
    for (const u of arr) {
      try {
        if (typeof u === "string" && u.startsWith("blob:")) URL.revokeObjectURL(u);
      } catch {}
    }
  };

  // Persist product media across navigation (blob: URLs do not survive).
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

    const put = async ({ id, blob, kind, type }) => {
      const db = await open();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
        tx.objectStore(STORE).put({ id, blob, kind, type });
      });
    };

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

    const revoke = (id) => {
      const url = URL_CACHE.get(id);
      if (url) {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      }
      URL_CACHE.delete(id);
    };

    return { put, getObjectUrl, revoke };
  })();

  const MAX_MEDIA = 5;
  /** Shared with Theme Settings popup markup (`vendor-bb-smart-ui.js`). */
  // `file://` can cache SVGs aggressively; append a lightweight cache-buster so edits show immediately.
  const PRODUCT_PLACEHOLDER_IMAGE = `BB-Product-Image-Placeholder.svg?v=${Date.now()}`;
  /** @type {{file?: File|null, url: string, kind: "image"|"video", justAdded?: boolean}[]} */
  let _media = [];

  // 7 product slots per modal (only one visible at a time)
  const PRODUCT_SLOTS = 7;
  /** Preview popup variant `<select>` values (option `value` = chip label), per slot — survives DOM rebuilds. */
  const normalizeVariantSelections = (v) => {
    const a = Array.isArray(v) ? v.map((x) => String(x ?? "")) : [];
    while (a.length < 3) a.push("");
    return a.slice(0, 3);
  };

  /** @type {{name:string, desc:string, price:string, currency:string, inv:string, ship:string, region:string, variants: {name:string, options:{label:string, price:string}[]}[], variantSelections: string[], media: {file?: File|null, url: string, kind: "image"|"video", justAdded?: boolean}[]}[]} */
  const _slots = Array.from({ length: PRODUCT_SLOTS }, () => ({
    name: "",
    desc: "",
    price: "",
    currency: "USD",
    inv: "",
    invUnlimited: false,
    showAvailScarcity: false,
    allowQtyChoice: true,
    ship: "",
    region: "",
    shipGlobal: "",
    shipGlobalExcluded: "",
    shipMode: "region",
    variants: [],
    variantAddDrafts: [],
    variantSelections: ["", "", ""],
    previewQty: "1",
    qtyUnlocked: false,
    media: [],
  }));
  let _slotIdx = 0;

  /** Monotonic counter used to break ties when several variant dropdowns have media-linked
      options selected. The select with the highest "touch" tick wins (last-changed wins). */
  let _variantTouchTick = 0;

  const MAX_VARIANT_GROUPS = 3;
  /** Variant option → gallery slot (0–4), matched to “up to 5 media” in the product gallery. */
  const MAX_VARIANT_MEDIA_SLOTS = 5;

  /** @returns {number | ""} */
  const normalizeMediaIndex = (v) => {
    if (v === "" || v == null) return "";
    const n = typeof v === "number" ? v : Number.parseInt(String(v).trim(), 10);
    if (!Number.isFinite(n)) return "";
    const i = Math.round(n);
    if (i < 0 || i >= MAX_VARIANT_MEDIA_SLOTS) return "";
    return i;
  };
  const fmtMoneySym = (ccy, amt) => {
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

  const currencySymbolOnly = (ccy) => {
    const c = String(ccy || "").trim().toUpperCase();
    if (c === "USD") return "US$";
    if (c === "AUD") return "A$";
    if (c === "EUR") return "€";
    if (c === "GBP") return "£";
    if (c === "CA" || c === "CAD") return "CA$";
    return c ? `${c} ` : "";
  };

  const syncShippingRatePlaceholders = () => {
    const sym = currencySymbolOnly(currencyEl?.value || "USD");
    try {
      if (pricePrefixEl) pricePrefixEl.textContent = sym.trim() || "US$";
    } catch {}
    try {
      if (shipFlatPrefixEl) shipFlatPrefixEl.textContent = sym.trim() || "$";
    } catch {}
    try {
      if (shipGlobalFlatPrefixEl) shipGlobalFlatPrefixEl.textContent = sym.trim() || "$";
    } catch {}
  };
  /** @returns {{name:string, options:{label:string, price:string, sku:string, mediaIndex?: number|""}[]}[]} */
  const normalizeVariantGroups = (rows) => {
    if (!Array.isArray(rows)) return [];
    return rows.slice(0, MAX_VARIANT_GROUPS).map((r) => {
      const name = String(r?.name || "").trim();
      const options = Array.isArray(r?.options)
        ? r.options
            .map((o) => ({
              label: String(o?.label || "").trim(),
              price: String(o?.price != null ? o.price : "").trim(),
              sku: String(o?.sku != null ? o.sku : "").trim(),
              mediaIndex: normalizeMediaIndex(o?.mediaIndex),
            }))
            .filter((o) => o.label)
        : [];
      return { name, options };
    });
  };
  /** @returns {{name:string, options:{label:string, price:string}[]}[]} */
  const migrateVariantsFromObj = (o) => {
    if (!o || typeof o !== "object") return [];
    if ("variants" in o && Array.isArray(o.variants)) return normalizeVariantGroups(o.variants);
    const vn = String(o.variantName || "").trim();
    const parts = String(o.variantOptions || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    if (vn && parts.length)
      return normalizeVariantGroups([
        { name: vn, options: parts.map((label) => ({ label, price: "", sku: "", mediaIndex: "" })) },
      ]);
    return [];
  };
  /**
   * Price shown on Buy button when the user picks a variant option that carries `data-bb-variant-price`.
   * Uses `selectedIndex` (reliable with disabled placeholder rows). Left → right: later dropdowns override.
   */
  const readEffectivePriceFromSelectors = (popup) => {
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

  const coerceVariantDraft = (d) => ({
    label: String(d?.label ?? ""),
    price: String(d?.price != null ? d.price : ""),
  });

  /** Groups for popup: merges per-row “Add value / Price” drafts so preview updates live. */
  const variantGroupsForActiveSlot = () => {
    const slot = _slots[_slotIdx];
    if (!slot) return [];
    const raw = Array.isArray(slot.variants) ? slot.variants : [];
    const drafts = Array.isArray(slot.variantAddDrafts)
      ? slot.variantAddDrafts
      : [];
    const merged = [];
    for (let gi = 0; gi < Math.min(MAX_VARIANT_GROUPS, raw.length); gi++) {
      const r = raw[gi];
      const name = String(r?.name || "").trim();
      const baseOpts = Array.isArray(r?.options)
        ? r.options
            .map((o) => ({
              label: String(o?.label ?? "").trim(),
              price: String(o?.price != null ? o.price : "").trim(),
              mediaIndex: normalizeMediaIndex(o?.mediaIndex),
              /* SKU intentionally omitted — admin-only, must not influence popup data attrs. */
            }))
            .filter((o) => o.label)
        : [];
      const d = coerceVariantDraft(drafts[gi] || { label: "", price: "" });
      const dl = String(d.label || "").trim();
      const dp = String(d.price || "").trim();
      const opts = [...baseOpts];
      if (dl && !opts.some((o) => o.label === dl)) opts.push({ label: dl, price: dp, mediaIndex: "" });
      merged.push({ name, options: opts });
    }
    return merged.filter(
      (g) =>
        g.name &&
        Array.isArray(g.options) &&
        g.options.some((o) => String(o?.label || "").trim())
    );
  };

  const ensureVariantDraftsForGroups = (n) => {
    const slot = _slots[_slotIdx];
    if (!slot) return;
    if (!Array.isArray(slot.variantAddDrafts)) slot.variantAddDrafts = [];
    while (slot.variantAddDrafts.length < n)
      slot.variantAddDrafts.push({ label: "", price: "" });
    while (slot.variantAddDrafts.length > n) slot.variantAddDrafts.pop();
  };

  /** Call before rebuilding `.selectors-row` so interval-driven `applyProductToPopup` does not wipe picks. */
  const snapshotVariantSelectionsFromPopup = () => {
    try {
      const popup = getPopup();
      if (!popup) return;
      const s = _slots[_slotIdx];
      if (!s) return;
      s.variantSelections = normalizeVariantSelections(s.variantSelections);
      const row = popup.querySelectorAll(
        ".selectors-row select:not(.bb-products-fixed-qty-select)"
      );
      for (let k = 0; k < 3; k++) {
        const sel = row[k];
        if (!sel || sel.classList.contains("bb-products-variant-select--hidden")) {
          s.variantSelections[k] = "";
          continue;
        }
        s.variantSelections[k] = String(sel.value || "");
      }
    } catch {}
  };

  const seedDefaultMediaIfEmpty = () => {
    // Products demo: include the bundled mp4 as initial media so the popup gallery isn't empty.
    if (_media.length) return;
    _media.push({ file: null, url: "../add-sample.mp4", kind: "video" });
  };

  const THEME_BG_KEY = "bbTheme:background:v1";
  const normHex6 = (v) => {
    const t = String(v || "").trim();
    if (/^#[0-9a-fA-F]{6}$/i.test(t)) return t.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/i.test(t)) {
      const x = t.slice(1).toLowerCase();
      return `#${x[0]}${x[0]}${x[1]}${x[1]}${x[2]}${x[2]}`;
    }
    return null;
  };
  const readTheme = () => {
    let o = null;
    try {
      o = JSON.parse(localStorage.getItem(THEME_BG_KEY) || "null");
    } catch {
      o = null;
    }
    return {
      contentColorHex: normHex6(o?.contentColorHex) || "#14141a",
      productTitleColorHex: normHex6(o?.productTitleColorHex) || "#14141a",
      buyButtonBgHex: normHex6(o?.buyButtonBgHex) || "#1030f4",
      buyButtonLabelHex: normHex6(o?.buyButtonLabelHex) || "#ffffff",
      exploreIconHex: normHex6(o?.exploreIconHex) || "#1030f4",
      lockLogoHex: normHex6(o?.lockLogoHex) || "#1030f4",
    };
  };
  const applyThemeToPopup = () => {
    const popup = getPopup();
    if (!popup) return;
    const s = readTheme();
    const title = popup.querySelector(".product-title");
    const desc = popup.querySelector(".product-description");
    const selects = popup.querySelectorAll(".selectors-row, .selectors-row select");
    const closeLines = popup.querySelectorAll(".close-x-icon svg line, .popup-sheet-close svg line");
    const buyBtn = popup.querySelector(".buy-now-button");
    const explore = popup.querySelector(".explore-link");
    const lockHost = popup.querySelector(".lock-icon-bb-logo");

    if (title) title.style.color = s.productTitleColorHex;
    if (desc) desc.style.color = s.contentColorHex;
    selects.forEach((n) => {
      try {
        n.style.color = s.contentColorHex;
      } catch {}
    });
    closeLines.forEach((n) => {
      try {
        n.style.stroke = s.contentColorHex;
      } catch {}
    });
    if (buyBtn) {
      buyBtn.style.backgroundColor = s.buyButtonBgHex;
      buyBtn.style.color = s.buyButtonLabelHex;
      buyBtn.style.webkitTextFillColor = s.buyButtonLabelHex;
    }
    if (explore) {
      try {
        explore.style.color = s.exploreIconHex;
      } catch {}
    }
    if (lockHost) {
      try {
        lockHost.style.color = s.lockLogoHex;
      } catch {}
      try {
        lockHost.querySelectorAll("svg.bb-lock-logo-inline *").forEach((n) => {
          n.removeAttribute?.("style");
          n.setAttribute?.("fill", s.lockLogoHex);
          n.setAttribute?.("stroke", s.lockLogoHex);
        });
      } catch {}
    }
  };

  const saveSlotFromForm = () => {
    const s = _slots[_slotIdx];
    if (!s) return;
    s.name = String(nameEl?.value || "");
    s.desc = String(descEl?.value || "");
    s.price = String(priceEl?.value || "");
    s.currency = String(currencyEl?.value || "USD");
    s.inv = String(invEl?.value || "");
    s.invUnlimited = !!(invUnlimitedEl?.checked);
    s.showAvailScarcity = !!(showAvailScarcityEl?.checked);
    s.allowQtyChoice = allowQtyChoiceEl ? !!allowQtyChoiceEl.checked : true;
    s.ship = String(shipFlatEl?.value || "");
    s.region = String(shipRegionEl?.value || "");
    s.shipGlobal = String(shipGlobalFlatEl?.value || "");
    s.shipGlobalExcluded = String(shipGlobalExcludedEl?.value || "");
    s.shipMode = shipModeGlobalEl?.checked ? "global" : "region";
    // Media is already held by reference in s.media via _media.
    persistSlot(_slotIdx);
  };

  const syncShippingModeUi = () => {
    const mode = shipModeGlobalEl?.checked ? "global" : "region";
    try {
      if (shipByRegionWrapEl) shipByRegionWrapEl.hidden = mode !== "region";
      if (shipGlobalWrapEl) shipGlobalWrapEl.hidden = mode !== "global";
    } catch {}
    try {
      if (shipFlatEl) shipFlatEl.disabled = mode !== "region";
      if (shipRegionEl) shipRegionEl.disabled = mode !== "region";
      if (shipGlobalFlatEl) shipGlobalFlatEl.disabled = mode !== "global";
      if (shipGlobalExcludedEl) shipGlobalExcludedEl.disabled = mode !== "global";
    } catch {}
    if (mode !== "global") setExcludedMenuOpen(false);
    if (mode === "global") renderExcludedCountriesUi();
  };

  let _variantsPersistT = null;
  /** Refresh modal preview immediately on variant edits; persist on a debounce. */
  const scheduleVariantsPersist = () => {
    applyProductToPopup();
    try {
      window.clearTimeout(_variantsPersistT);
    } catch {}
    _variantsPersistT = window.setTimeout(() => {
      saveSlotFromForm();
    }, 220);
  };

  let _variantsAfterGalleryT = null;
  const scheduleVariantsUiAfterGalleryChange = () => {
    try {
      window.clearTimeout(_variantsAfterGalleryT);
    } catch {}
    _variantsAfterGalleryT = window.setTimeout(() => {
      renderVariantsUi();
    }, 120);
  };

  /** Small thumbnails + radios: link this variant value to gallery slot 1–5 (or Auto). */
  const buildVariantMediaPicker = (gi, oi) => {
    const wrap = document.createElement("div");
    wrap.className = "bb-products-variant-media-picker";
    const cap = document.createElement("div");
    cap.className = "bb-products-variant-media-picker__caption";
    cap.textContent = "Preview image";
    wrap.appendChild(cap);

    const row = document.createElement("div");
    row.className = "bb-products-variant-media-picker__thumbs";
    row.setAttribute("role", "radiogroup");
    row.setAttribute("aria-label", "Gallery slot for this variant value");

    const optPtr = () => _slots[_slotIdx]?.variants?.[gi]?.options?.[oi];
    const radioName = `bb-var-media-${_slotIdx}-${gi}-${oi}`;
    let cur = normalizeMediaIndex(optPtr()?.mediaIndex);
    const m0 = _media[cur === "" ? -1 : cur];
    if (cur !== "" && !m0) cur = "";

    const addChoice = (valueStr, disabled, inner, extraClass, ariaLabel) => {
      const lab = document.createElement("label");
      lab.className =
        "bb-products-variant-media-opt" +
        (extraClass ? ` ${extraClass}` : "") +
        (disabled ? " bb-products-variant-media-opt--disabled" : "");
      const inp = document.createElement("input");
      inp.type = "radio";
      inp.name = radioName;
      inp.value = valueStr;
      if (ariaLabel) inp.setAttribute("aria-label", ariaLabel);
      inp.checked =
        valueStr === ""
          ? cur === ""
          : cur !== "" && String(cur) === valueStr;
      inp.disabled = !!disabled;
      inp.addEventListener("change", () => {
        if (!inp.checked) return;
        const o = optPtr();
        if (!o) return;
        o.mediaIndex = valueStr === "" ? "" : Number.parseInt(valueStr, 10);
        scheduleVariantsPersist();
      });
      lab.appendChild(inp);
      lab.appendChild(inner);
      row.appendChild(lab);
    };

    const autoLbl = document.createElement("span");
    autoLbl.className = "bb-products-variant-media-opt-fallback";
    autoLbl.textContent = "Auto";
    addChoice(
      "",
      false,
      autoLbl,
      "bb-products-variant-media-opt--auto",
      "Auto — use default gallery position for this variant value"
    );

    const slotCount = Math.min(_media.length, MAX_VARIANT_MEDIA_SLOTS);
    for (let mi = 0; mi < slotCount; mi++) {
      const m = _media[mi];
      const thumb = document.createElement("span");
      thumb.className = "bb-products-variant-media-thumb";
      if (m?.kind === "video") {
        const v = document.createElement("video");
        v.src = m.url;
        v.muted = true;
        v.playsInline = true;
        v.preload = "metadata";
        thumb.appendChild(v);
      } else {
        const img = document.createElement("img");
        img.src = m.url;
        img.alt = "";
        img.decoding = "async";
        thumb.appendChild(img);
      }
      const idxStr = String(mi);
      const slotLabel = `gallery slot ${mi + 1}`;
      addChoice(
        idxStr,
        false,
        thumb,
        "",
        `When this value is selected, show ${slotLabel} in the preview`
      );
    }

    wrap.appendChild(row);
    return wrap;
  };

  const renderVariantsUi = () => {
    if (!variantsRoot) return;
    if (!Array.isArray(_slots[_slotIdx]?.variants)) _slots[_slotIdx].variants = [];
    let groups = _slots[_slotIdx].variants;
    if (groups.length > MAX_VARIANT_GROUPS) {
      groups = groups.slice(0, MAX_VARIANT_GROUPS);
      _slots[_slotIdx].variants = groups;
    }
    ensureVariantDraftsForGroups(groups.length);

    variantsRoot.innerHTML = "";
    groups.forEach((g, gi) => {
      /* Default existing/persisted groups to collapsed; freshly added groups (see add-group handler)
         pre-set __collapseInit=true so they stay expanded for the user to fill in. */
      if (!g.__collapseInit) {
        if (typeof g.__collapsed === "undefined") g.__collapsed = true;
        g.__collapseInit = true;
      }
      const card = document.createElement("div");
      card.className = "bb-products-variant-card";
      card.dataset.gi = String(gi);
      if (g.__collapsed) card.classList.add("bb-products-variant-card--collapsed");

      const top = document.createElement("div");
      top.className = "bb-products-variant-card__top";

      /* Drag handle (Shopify-style 6 dots) — only this element starts a group reorder. */
      const handle = document.createElement("button");
      handle.type = "button";
      handle.className = "bb-products-variant-handle";
      handle.setAttribute("aria-label", "Drag to reorder option");
      handle.title = "Drag to reorder";
      handle.innerHTML =
        '<span class="bb-products-variant-handle__dots" aria-hidden="true">' +
        '<span></span><span></span><span></span>' +
        '<span></span><span></span><span></span>' +
        "</span>";
      handle.addEventListener("pointerdown", () => {
        card.setAttribute("draggable", "true");
      });
      handle.addEventListener("pointerup", () => {
        card.removeAttribute("draggable");
      });
      handle.addEventListener("pointerleave", () => {
        card.removeAttribute("draggable");
      });

      const tit = document.createElement("span");
      tit.className = "bb-products-variant-card__title";
      const updateVariantCardTitle = () => {
        const title = String(_slots[_slotIdx]?.variants?.[gi]?.name || g.name || "").trim();
        tit.textContent = title || `Option ${gi + 1}`;
      };
      updateVariantCardTitle();

      /* Collapse / expand chevron. */
      const collapseBtn = document.createElement("button");
      collapseBtn.type = "button";
      collapseBtn.className = "bb-products-variant-collapse";
      const expanded = !g.__collapsed;
      collapseBtn.setAttribute("aria-expanded", String(expanded));
      collapseBtn.setAttribute(
        "aria-label",
        expanded ? "Collapse option" : "Expand option"
      );
      collapseBtn.title = expanded ? "Collapse" : "Expand";
      collapseBtn.innerHTML = '<span class="bb-products-variant-collapse__chev" aria-hidden="true"></span>';
      collapseBtn.addEventListener("click", () => {
        const row = _slots[_slotIdx].variants?.[gi];
        if (!row) return;
        row.__collapsed = !row.__collapsed;
        renderVariantsUi();
      });

      const rmG = document.createElement("button");
      rmG.type = "button";
      rmG.className = "bb-products-variant-remove";
      rmG.textContent = "Remove";
      rmG.addEventListener("click", () => {
        groups.splice(gi, 1);
        if (Array.isArray(_slots[_slotIdx].variantAddDrafts))
          _slots[_slotIdx].variantAddDrafts.splice(gi, 1);
        _slots[_slotIdx].variants = groups;
        renderVariantsUi();
        scheduleVariantsPersist();
      });
      top.appendChild(handle);
      top.appendChild(tit);
      top.appendChild(collapseBtn);
      top.appendChild(rmG);
      card.appendChild(top);

      /* Click anywhere on the header (except the handle / remove / chevron buttons, which do
         their own thing) toggles collapsed/expanded — same gesture both ways. */
      top.addEventListener("click", (e) => {
        const row = _slots[_slotIdx].variants?.[gi];
        if (!row) return;
        if (e.target?.closest?.(".bb-products-variant-handle, .bb-products-variant-remove, .bb-products-variant-collapse")) return;
        row.__collapsed = !row.__collapsed;
        renderVariantsUi();
      });

      /* Body wrapper so collapse can hide everything below the header. */
      const body = document.createElement("div");
      body.className = "bb-products-variant-card__body";
      card.appendChild(body);

      /* Group drag/drop reorder (handle gates draggable=true above). */
      card.addEventListener("dragstart", (e) => {
        if (card.getAttribute("draggable") !== "true") {
          e.preventDefault();
          return;
        }
        card.classList.add("bb-products-variant-card--dragging");
        try {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", String(gi));
        } catch {}
      });
      card.addEventListener("dragend", () => {
        card.classList.remove("bb-products-variant-card--dragging");
        card.removeAttribute("draggable");
        variantsRoot
          .querySelectorAll(".bb-products-variant-card--drop-before, .bb-products-variant-card--drop-after")
          .forEach((el) =>
            el.classList.remove(
              "bb-products-variant-card--drop-before",
              "bb-products-variant-card--drop-after"
            )
          );
      });
      card.addEventListener("dragover", (e) => {
        if (!variantsRoot.querySelector(".bb-products-variant-card--dragging")) return;
        e.preventDefault();
        try {
          e.dataTransfer.dropEffect = "move";
        } catch {}
        const r = card.getBoundingClientRect();
        const before = e.clientY < r.top + r.height / 2;
        card.classList.toggle("bb-products-variant-card--drop-before", before);
        card.classList.toggle("bb-products-variant-card--drop-after", !before);
      });
      card.addEventListener("dragleave", () => {
        card.classList.remove(
          "bb-products-variant-card--drop-before",
          "bb-products-variant-card--drop-after"
        );
      });
      card.addEventListener("drop", (e) => {
        e.preventDefault();
        const fromStr = (() => {
          try {
            return e.dataTransfer.getData("text/plain");
          } catch {
            return "";
          }
        })();
        const from = Number.parseInt(fromStr, 10);
        const r = card.getBoundingClientRect();
        const before = e.clientY < r.top + r.height / 2;
        let to = gi + (before ? 0 : 1);
        if (!Number.isFinite(from) || from === gi) return;
        if (from < to) to -= 1;
        const arr = _slots[_slotIdx].variants;
        if (!Array.isArray(arr)) return;
        const [moved] = arr.splice(from, 1);
        arr.splice(to, 0, moved);
        if (Array.isArray(_slots[_slotIdx].variantAddDrafts)) {
          const drafts = _slots[_slotIdx].variantAddDrafts;
          const [movedD] = drafts.splice(from, 1);
          drafts.splice(to, 0, movedD ?? { label: "", price: "" });
        }
        renderVariantsUi();
        scheduleVariantsPersist();
      });

      const nameIn = document.createElement("input");
      nameIn.type = "text";
      nameIn.className = "bb-products-input bb-products-variant-name";
      nameIn.placeholder = "Option title (e.g. Size)";
      nameIn.value = g.name || "";
      nameIn.autocomplete = "off";
      body.appendChild(nameIn);

      nameIn.addEventListener("input", () => {
        const row = _slots[_slotIdx].variants?.[gi];
        if (!row) return;
        row.name = nameIn.value;
        updateVariantCardTitle();
        scheduleVariantsPersist();
      });

      const chips = document.createElement("div");
      chips.className = "bb-products-variant-chips";
      if (!Array.isArray(g.options)) g.options = [];
      g.options.forEach((opt, oi) => {
        const chip = document.createElement("div");
        chip.className = "bb-products-variant-chip bb-products-variant-chip--edit";

        const labEdit = document.createElement("input");
        labEdit.type = "text";
        labEdit.className = "bb-products-input bb-products-variant-chip-value";
        labEdit.placeholder = "Value";
        labEdit.autocomplete = "off";
        labEdit.value = String(opt?.label ?? "");

        const prEdit = document.createElement("input");
        prEdit.type = "number";
        prEdit.inputMode = "decimal";
        prEdit.className =
          "bb-products-input bb-products-input--sm bb-products-variant-chip-price-input";
        prEdit.placeholder = "Price";
        prEdit.value = String(opt?.price ?? "").trim();

        /* SKU is admin-only: stored on the option, never emitted into popup data attrs. */
        const skuEdit = document.createElement("input");
        skuEdit.type = "text";
        skuEdit.className =
          "bb-products-input bb-products-input--sm bb-products-variant-chip-sku-input";
        skuEdit.placeholder = "SKU";
        skuEdit.autocomplete = "off";
        skuEdit.value = String(opt?.sku ?? "");
        skuEdit.title = "SKU (admin only — not shown in popup)";
        skuEdit.setAttribute("aria-label", "SKU (admin only)");
        skuEdit.addEventListener("input", () => {
          const row = _slots[_slotIdx].variants[gi]?.options?.[oi];
          if (!row) return;
          row.sku = String(skuEdit.value || "");
          scheduleVariantsPersist();
        });

        const xr = document.createElement("button");
        xr.type = "button";
        xr.className = "bb-products-variant-chip-remove";
        xr.setAttribute("aria-label", "Remove option");
        xr.textContent = "×";
        xr.addEventListener("click", () => {
          if (!_slots[_slotIdx].variants[gi]?.options) return;
          _slots[_slotIdx].variants[gi].options.splice(oi, 1);
          renderVariantsUi();
          scheduleVariantsPersist();
        });

        labEdit.addEventListener("input", () => {
          const row = _slots[_slotIdx].variants[gi]?.options?.[oi];
          if (!row) return;
          row.label = labEdit.value;
          scheduleVariantsPersist();
        });
        labEdit.addEventListener("blur", () => {
          const opts = _slots[_slotIdx].variants[gi]?.options;
          if (!opts?.[oi]) return;
          const t = String(labEdit.value || "").trim();
          if (!t) {
            opts.splice(oi, 1);
            renderVariantsUi();
            scheduleVariantsPersist();
            return;
          }
          opts[oi].label = t;
          scheduleVariantsPersist();
        });
        prEdit.addEventListener("input", () => {
          const row = _slots[_slotIdx].variants[gi]?.options?.[oi];
          if (!row) return;
          row.price = String(prEdit.value || "").trim();
          scheduleVariantsPersist();
        });

        chip.appendChild(labEdit);
        chip.appendChild(prEdit);
        chip.appendChild(skuEdit);
        chip.appendChild(xr);
        chip.appendChild(buildVariantMediaPicker(gi, oi));
        chips.appendChild(chip);
      });
      body.appendChild(chips);

      const row = document.createElement("div");
      row.className = "bb-products-variant-add-row";
      const labIn = document.createElement("input");
      labIn.className = "bb-products-input";
      labIn.placeholder = "Add value";
      labIn.autocomplete = "off";
      {
        const d = coerceVariantDraft(_slots[_slotIdx].variantAddDrafts[gi] || {});
        labIn.value = d.label;
      }
      const prIn = document.createElement("input");
      prIn.className = "bb-products-input bb-products-input--sm";
      prIn.type = "number";
      prIn.inputMode = "decimal";
      prIn.placeholder = "Price";
      {
        const d = coerceVariantDraft(_slots[_slotIdx].variantAddDrafts[gi] || {});
        prIn.value = d.price;
      }
      const addB = document.createElement("button");
      addB.type = "button";
      addB.className = "bb-products-variant-add-btn";
      addB.textContent = "Add";
      row.appendChild(labIn);
      row.appendChild(prIn);
      row.appendChild(addB);
      body.appendChild(row);

      const hintPill = document.createElement("p");
      hintPill.className = "bb-products-variant-activate-pill";
      hintPill.setAttribute("role", "alert");
      hintPill.textContent = "Enter a title and value to activate this option";
      body.appendChild(hintPill);

      const clearVariantHint = () => {
        hintPill.classList.remove("bb-products-variant-activate-pill--show");
        nameIn.classList.remove("bb-products-input--warn");
        labIn.classList.remove("bb-products-input--warn");
        try {
          window.clearTimeout(hintPill.__hideT);
        } catch {}
      };
      const flashVariantHint = () => {
        hintPill.classList.add("bb-products-variant-activate-pill--show");
        if (!String(nameIn.value || "").trim()) nameIn.classList.add("bb-products-input--warn");
        if (!String(labIn.value || "").trim()) labIn.classList.add("bb-products-input--warn");
        try {
          window.clearTimeout(hintPill.__hideT);
        } catch {}
        hintPill.__hideT = window.setTimeout(() => clearVariantHint(), 5000);
      };
      const syncDraftInputs = () => {
        ensureVariantDraftsForGroups(groups.length);
        _slots[_slotIdx].variantAddDrafts[gi] = coerceVariantDraft({
          label: labIn.value,
          price: prIn.value,
        });
      };
      nameIn.addEventListener("input", () => {
        if (!_slots[_slotIdx].variants[gi]) return;
        _slots[_slotIdx].variants[gi].name = nameIn.value;
        updateVariantCardTitle();
        clearVariantHint();
        scheduleVariantsPersist();
      });
      labIn.addEventListener("input", () => {
        syncDraftInputs();
        clearVariantHint();
        scheduleVariantsPersist();
      });
      prIn.addEventListener("input", () => {
        syncDraftInputs();
        scheduleVariantsPersist();
      });

      addB.addEventListener("click", () => {
        const optTitle = String(nameIn.value || "").trim();
        const lab = String(labIn.value || "").trim();
        if (!optTitle || !lab) {
          flashVariantHint();
          return;
        }
        const pr = String(prIn.value || "").trim();
        if (!_slots[_slotIdx].variants[gi]) return;
        _slots[_slotIdx].variants[gi].name = optTitle;
        updateVariantCardTitle();
        if (!_slots[_slotIdx].variants[gi].options) _slots[_slotIdx].variants[gi].options = [];
        _slots[_slotIdx].variants[gi].options.push({ label: lab, price: pr, sku: "", mediaIndex: "" });
        _slots[_slotIdx].variantAddDrafts[gi] = { label: "", price: "" };
        labIn.value = "";
        prIn.value = "";
        clearVariantHint();
        renderVariantsUi();
        scheduleVariantsPersist();
      });

      variantsRoot.appendChild(card);
    });

    const addGroup = document.createElement("button");
    addGroup.type = "button";
    addGroup.className = "bb-products-variant-add-btn";
    addGroup.textContent = groups.length ? "+ another variant" : "+ variant";
    /* When at max we keep the button clickable (so we can flash the limit pill) but style it muted. */
    const atMax = groups.length >= MAX_VARIANT_GROUPS;
    if (atMax) addGroup.classList.add("bb-products-variant-add-btn--max");
    addGroup.setAttribute("aria-disabled", String(atMax));

    const maxPill = document.createElement("p");
    maxPill.className = "bb-products-variant-activate-pill bb-products-variant-max-pill";
    maxPill.setAttribute("role", "alert");
    maxPill.textContent = `Max of ${MAX_VARIANT_GROUPS} product variants`;

    addGroup.addEventListener("click", () => {
      if (groups.length >= MAX_VARIANT_GROUPS) {
        maxPill.classList.add("bb-products-variant-activate-pill--show");
        try { window.clearTimeout(maxPill.__hideT); } catch {}
        maxPill.__hideT = window.setTimeout(() => {
          maxPill.classList.remove("bb-products-variant-activate-pill--show");
        }, 5000);
        return;
      }
      groups.push({ name: "", options: [], __collapsed: false, __collapseInit: true });
      _slots[_slotIdx].variants = groups;
      ensureVariantDraftsForGroups(groups.length);
      renderVariantsUi();
      scheduleVariantsPersist();
    });
    variantsRoot.appendChild(addGroup);
    variantsRoot.appendChild(maxPill);
  };

  /** Clears the per-select touch tick so the next product starts at "no user action yet"
      (last-changed-wins falls back to first-linked-option on first paint). */
  const resetVariantTouchTicks = () => {
    try {
      const popup = getPopup?.();
      if (!popup) return;
      popup
        .querySelectorAll(".selectors-row select.bb-products-variant-select")
        .forEach((sel) => {
          try { sel.__bbVariantTouchTick = 0; } catch {}
        });
    } catch {}
  };

  const loadSlotToForm = (i) => {
    const s = _slots[i];
    if (!s) return;
    resetVariantTouchTicks();
    if (nameEl) nameEl.value = s.name || "";
    if (descEl) descEl.value = s.desc || "";
    if (priceEl) priceEl.value = s.price || "";
    if (currencyEl) currencyEl.value = s.currency || "USD";
    syncShippingRatePlaceholders();
    if (invEl) invEl.value = s.inv || "";
    if (invUnlimitedEl) invUnlimitedEl.checked = !!s.invUnlimited;
    if (showAvailScarcityEl) showAvailScarcityEl.checked = !!s.showAvailScarcity;
    if (allowQtyChoiceEl) allowQtyChoiceEl.checked = s.allowQtyChoice !== false;
    if (shipFlatEl) shipFlatEl.value = s.ship || "";
    if (shipRegionEl) shipRegionEl.value = s.region || "";
    if (shipGlobalFlatEl) shipGlobalFlatEl.value = s.shipGlobal || "";
    if (shipGlobalExcludedEl) {
      const prevExcluded = String(s.shipGlobalExcluded || "");
      shipGlobalExcludedEl.value = prevExcluded;
      setExcludedCodesToHiddenInput(parseExcludedCodes(shipGlobalExcludedEl.value));
      s.shipGlobalExcluded = String(shipGlobalExcludedEl.value || "");
      if (s.shipGlobalExcluded !== prevExcluded) persistSlot(i);
    }
    const mode = String(s.shipMode || "region") === "global" ? "global" : "region";
    if (shipModeRegionEl) shipModeRegionEl.checked = mode === "region";
    if (shipModeGlobalEl) shipModeGlobalEl.checked = mode === "global";
    syncShippingModeUi();
    renderExcludedCountriesUi();
    if (!s.media) s.media = [];
    _media = s.media;
    // Avoid "added" animation when switching slots.
    try {
      _media.forEach((m) => {
        if (m && typeof m === "object") m.justAdded = false;
      });
    } catch {}
    const hydratePersistedMedia = async () => {
      const list = Array.isArray(_media) ? _media : [];
      const tasks = list.map(async (m) => {
        if (!m || typeof m !== "object") return;
        if (m.url) return;
        const id = String(m.persistId || "");
        if (!id) return;
        try {
          const url = await MediaStore.getObjectUrl(id);
          if (url) m.url = url;
        } catch {}
      });
      try {
        await Promise.all(tasks);
      } catch {}
    };
    renderVariantsUi();
    hydratePersistedMedia().finally(() => {
      renderMediaUi();
      syncPopupGalleryFromMedia();
      renderVariantsUi();
      applyProductToPopup();
      applyThemeToPopup();
    });
  };

  const getProductPagerEl = () => document.querySelector(".bb-products-modal-pager");

  const syncLeftPanelSlotPill = () => {
    const el = document.getElementById("bbProductsActiveSlotPill");
    if (!el) return;
    el.textContent = `Product ${_slotIdx + 1}`;
  };

  const syncPreviewPill = (pulseOnProductChange) => {
    const el = document.querySelector(".bb-products-preview-pill");
    if (!el) return;
    el.textContent = `You're previewing Product ${_slotIdx + 1}`;
    if (!pulseOnProductChange) return;
    try {
      window.clearTimeout(el.__bbPillTickClear);
      if (el.__bbPillTickOnEnd) {
        try {
          el.removeEventListener("animationend", el.__bbPillTickOnEnd);
        } catch (_) {}
        el.__bbPillTickOnEnd = null;
      }
      el.classList.remove("bb-products-preview-pill--tick");
      void el.offsetWidth;
      el.classList.add("bb-products-preview-pill--tick");
      const clearTick = () => {
        try {
          el.classList.remove("bb-products-preview-pill--tick");
        } catch (_) {}
      };
      el.__bbPillTickOnEnd = (e) => {
        if (e.target !== el) return;
        const n = String(e.animationName || "");
        if (!n.includes("change-pulse")) return;
        window.clearTimeout(el.__bbPillTickClear);
        clearTick();
        try {
          el.removeEventListener("animationend", el.__bbPillTickOnEnd);
        } catch (_) {}
        el.__bbPillTickOnEnd = null;
      };
      el.addEventListener("animationend", el.__bbPillTickOnEnd);
      el.__bbPillTickClear = window.setTimeout(() => {
        clearTick();
        try {
          el.removeEventListener("animationend", el.__bbPillTickOnEnd);
        } catch (_) {}
        el.__bbPillTickOnEnd = null;
      }, 900);
    } catch (_) {}
  };

  const setActiveSlotUi = (hostRoot, opts) => {
    const pulsePill = !!(opts && opts.pulsePill);
    const host = hostRoot?.querySelector?.(".bb-products-modal-pager") || hostRoot || getProductPagerEl();
    if (!host) return;
    host.querySelectorAll("button[data-slot]").forEach((b) => {
      const idx = Number(b.getAttribute("data-slot"));
      b.classList.toggle("bb-products-modal-dot--active", idx === _slotIdx);
    });
    syncPreviewPill(pulsePill);
    syncLeftPanelSlotPill();
  };

  const isProductsPreviewNarrow = () => {
    try {
      return window.matchMedia("(max-width: 840px)").matches;
    } catch {
      return typeof window.innerWidth === "number" && window.innerWidth <= 840;
    }
  };

  const ACTIVE_SLOT_KEY = "bbProducts:activeSlot:v1";
  const SLOT_KEY = (i) => `bbProducts:slot:${i}:v1`;
  const persistActiveSlot = () => {
    try {
      localStorage.setItem(ACTIVE_SLOT_KEY, String(_slotIdx));
    } catch {}
    Sync.post({ type: "activeSlotChanged", idx: _slotIdx, src: SOURCE_ID });
    bumpSync({ type: "activeSlotChanged", idx: _slotIdx });
  };

  const persistSlot = (i) => {
    const s = _slots[i];
    if (!s) return;
    // Persist form fields + media references.
    // Media may include:
    // - stable urls (relative/https)
    // - persisted IDs (IndexedDB)
    const safeMedia = Array.isArray(s.media)
      ? s.media
          .map((m) => {
            if (!m || typeof m !== "object") return null;
            const id = String(m.persistId || "");
            if (id) return { id, kind: m.kind };
            const url = typeof m.url === "string" ? m.url : "";
            if (!url || url.startsWith("blob:")) return null;
            return { url, kind: m.kind };
          })
          .filter(Boolean)
      : [];
    try {
      localStorage.setItem(
        SLOT_KEY(i),
        JSON.stringify({
          name: s.name || "",
          desc: s.desc || "",
          price: s.price || "",
          currency: s.currency || "USD",
          inv: s.inv || "",
          invUnlimited: !!s.invUnlimited,
          showAvailScarcity: !!s.showAvailScarcity,
          allowQtyChoice: s.allowQtyChoice !== false,
          ship: s.ship || "",
          region: s.region || "",
          shipGlobal: s.shipGlobal || "",
          shipGlobalExcluded: s.shipGlobalExcluded || "",
          shipMode: String(s.shipMode || "region"),
          variants: normalizeVariantGroups(s.variants || []),
          variantSelections: normalizeVariantSelections(s.variantSelections),
          previewQty: String(s.previewQty || "1"),
          qtyUnlocked: !!s.qtyUnlocked,
          variantAddDrafts: Array.isArray(s.variantAddDrafts)
            ? s.variantAddDrafts.map((d) => coerceVariantDraft(d))
            : [],
          media: safeMedia,
        })
      );
    } catch {}
    Sync.post({ type: "productSlotUpdated", idx: i, src: SOURCE_ID });
    bumpSync({ type: "productSlotUpdated", idx: i });
  };

  const hydrateSlotsFromStorage = () => {
    for (let i = 0; i < PRODUCT_SLOTS; i++) {
      try {
        const raw = localStorage.getItem(SLOT_KEY(i));
        if (!raw) continue;
        const o = JSON.parse(raw);
        const s = _slots[i];
        if (!s || !o || typeof o !== "object") continue;
        s.name = String(o.name || "");
        s.desc = String(o.desc || "");
        s.price = String(o.price || "");
        s.currency = String(o.currency || "USD");
        s.inv = String(o.inv || "");
        s.invUnlimited = !!o.invUnlimited;
        s.showAvailScarcity = !!o.showAvailScarcity;
        s.allowQtyChoice = o.allowQtyChoice !== false;
        s.ship = String(o.ship || "");
        s.region = String(o.region || "");
        s.shipGlobal = String(o.shipGlobal || "");
        s.shipGlobalExcluded = Object.prototype.hasOwnProperty.call(o, "shipGlobalExcluded")
          ? merchantExcludedCsvFromRaw(o.shipGlobalExcluded)
          : "";
        s.shipMode = String(o.shipMode || "region") === "global" ? "global" : "region";
        s.variants = migrateVariantsFromObj(o);
        s.variantSelections = normalizeVariantSelections(o.variantSelections);
        s.previewQty = String(o.previewQty != null ? o.previewQty : "1");
        s.qtyUnlocked = !!o.qtyUnlocked;
        s.variantAddDrafts = Array.isArray(o.variantAddDrafts)
          ? o.variantAddDrafts.map((d) => coerceVariantDraft(d))
          : [];
        const media = Array.isArray(o.media) ? o.media : [];
        s.media = media
          .map((m) => {
            const kind = m?.kind === "video" ? "video" : "image";
            const id = typeof m?.id === "string" ? m.id : "";
            const url = typeof m?.url === "string" ? m.url : "";
            if (id) return { file: null, url: "", kind, persistId: id };
            if (url && !url.startsWith("blob:")) return { file: null, url, kind };
            return null;
          })
          .filter(Boolean);
      } catch {}
    }
  };

  const readInitialActiveSlot = () => {
    try {
      const n = Number(localStorage.getItem(ACTIVE_SLOT_KEY));
      if (!Number.isFinite(n)) return 0;
      return Math.max(0, Math.min(PRODUCT_SLOTS - 1, n));
    } catch {
      return 0;
    }
  };

  // Theme Design scopes its settings per theme slot; Products must apply the matching slot theme.
  const THEME_KEYS = [
    "bbTheme:accent:v1",
    "bbTheme:background:v1",
    "bbTheme:video:v1",
    "bbTheme:customBgPersist:v1",
    "bbTheme:typography:v1",
    "bbTheme:adsPreview:v1",
    "bbTheme:adminGallery:v1",
  ];
  const scopedThemeKey = (baseKey, themeIdx) => `${baseKey}:themeSlot:${themeIdx}:v1`;

  const THEME_DEFAULTS = {
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
      brandIconFillHex: "#1030f5",
      brandIconBorderHex: "#1030f5",
      brandIconFillOpacity: 100,
      brandIconBorderOpacity: 100,
      lockLogoHex: "#1030f5",
      buyButtonBgHex: "#1030f5",
      buyButtonLabelHex: "#ffffff",
    }),
    "bbTheme:video:v1": "1",
    "bbTheme:customBgPersist:v1": null,
    "bbTheme:typography:v1": JSON.stringify({ family: "Roboto", weight: 400, italic: false }),
    "bbTheme:adsPreview:v1": JSON.stringify({ enabled: false }),
    "bbTheme:adminGallery:v1": null,
  };

  const ensureThemeSlotsInitialized = () => {
    // Products should not depend on Theme Design page having run first.
    for (let i = 0; i < PRODUCT_SLOTS; i++) {
      for (const k of THEME_KEYS) {
        const sk = scopedThemeKey(k, i);
        let has = false;
        try {
          has = localStorage.getItem(sk) != null;
        } catch {}
        if (has) continue;
        try {
          const def = Object.prototype.hasOwnProperty.call(THEME_DEFAULTS, k) ? THEME_DEFAULTS[k] : null;
          if (def == null) localStorage.removeItem(sk);
          else localStorage.setItem(sk, String(def));
        } catch {}
      }
    }
  };

  // (Reverted) No message/hash based theme import.
  const nudgeThemeListeners = (idx) => {
    // Same-tab localStorage updates do not fire `storage`, but the popup/theme code listens for it.
    // Dispatch synthetic storage events for the keys we swap so background/video updates apply immediately.
    const keys = THEME_KEYS;
    keys.forEach((k) => {
      try {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: k,
            newValue: localStorage.getItem(k),
            oldValue: null,
            storageArea: localStorage,
            url: location.href,
          })
        );
      } catch {}
    });
    try {
      window.dispatchEvent(new CustomEvent("bb-products-theme-slot-applied", { detail: { idx } }));
    } catch {
      try {
        window.dispatchEvent(new Event("bb-products-theme-slot-applied"));
      } catch {}
    }
  };
  const applyThemeSlotToBase = (idx) => {
    THEME_KEYS.forEach((k) => {
      try {
        const v = localStorage.getItem(scopedThemeKey(k, idx));
        if (v != null) localStorage.setItem(k, v);
      } catch {}
    });
    nudgeThemeListeners(idx);
    Sync.post({ type: "themeSlotApplied", idx, src: SOURCE_ID });
    bumpSync({ type: "themeSlotApplied", idx });
  };

  const switchSlot = (i) => {
    if (!Number.isFinite(i)) return;
    const next = Math.max(0, Math.min(PRODUCT_SLOTS - 1, i));
    if (next === _slotIdx) return;
    saveSlotFromForm();
    persistSlot(_slotIdx);
    _slotIdx = next;
    persistActiveSlot();
    applyThemeSlotToBase(_slotIdx);
    loadSlotToForm(_slotIdx);
    setActiveSlotUi(getProductPagerEl(), { pulsePill: true });
    try {
      slidePopupGalleryTo(0);
    } catch {}
  };

  const animateSwitchSlot = (i) => {
    const btn = document.querySelector(`.bb-products-modal-dot[data-slot="${i}"]`);
    if (btn) {
      btn.classList.remove("bb-products-modal-dot--pulse");
      try {
        void btn.offsetWidth;
      } catch {}
      btn.classList.add("bb-products-modal-dot--pulse");
    }

    /* 3D flip is unreliable / heavy on narrow viewports — swap immediately */
    if (isProductsPreviewNarrow()) {
      switchSlot(i);
      window.setTimeout(() => {
        try {
          btn?.classList.remove("bb-products-modal-dot--pulse");
        } catch {}
      }, 450);
      return;
    }

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
    const FLIP_MS = 350; /* must match `.bb-products-popup-flip` duration in Products.css */
    // Swap at edge-on hinge (tie to keyframe midpoint ~50%)
    window.setTimeout(() => {
      switchSlot(i);
    }, Math.round(FLIP_MS * 0.5));
    window.setTimeout(() => {
      try {
        wrap?.classList.remove("bb-products-popup-flip");
      } catch {}
      try {
        mount?.classList.remove("bb-products-popup-flip-active");
      } catch {}
    }, FLIP_MS + 50);
  };

  const pulseProductPagerDotOnly = (i) => {
    if (!Number.isFinite(i)) return;
    const idx = Math.max(0, Math.min(PRODUCT_SLOTS - 1, i));
    const btn = document.querySelector(`.bb-products-modal-dot[data-slot="${idx}"]`);
    if (!btn) return;
    btn.classList.remove("bb-products-modal-dot--pulse");
    try {
      void btn.offsetWidth;
    } catch {}
    btn.classList.add("bb-products-modal-dot--pulse");
    window.setTimeout(() => {
      try {
        btn.classList.remove("bb-products-modal-dot--pulse");
      } catch {}
    }, 520);
  };

  /** Deep-link `?slot=3` / `?product=3` (1–7 or 0-based): Product Scheduling → Products. */
  const parseProductSlotFromUrl = () => {
    try {
      const q = new URLSearchParams(location.search);
      const raw = q.get("slot") ?? q.get("product");
      if (raw == null || String(raw).trim() === "") return null;
      const n = Number(String(raw).trim());
      if (!Number.isFinite(n)) return null;
      if (Number.isInteger(n) && n >= 1 && n <= PRODUCT_SLOTS) return Math.floor(n) - 1;
      if (Number.isInteger(n) && n >= 0 && n < PRODUCT_SLOTS) return Math.floor(n);
      return null;
    } catch {
      return null;
    }
  };

  /** Drag reorder: shared state + single list listener (avoid stacking listeners on re-render). */
  let galleryDragIdx = -1;
  let galleryLastToIdx = -1;
  const DROP_ROW_PAD_PX = 28;

  const runPulse = (el) => {
    if (!el) return;
    el.classList.remove("bb-products-gallery-item--pulse");
    try {
      void el.offsetWidth;
    } catch {}
    el.classList.add("bb-products-gallery-item--pulse");
  };

  const shakeLimitPill = () => {
    if (!limitEl) return;
    limitEl.classList.remove("bb-products-media-limit--shake");
    try {
      void limitEl.offsetWidth;
    } catch {}
    limitEl.classList.add("bb-products-media-limit--shake");
  };

  const syncPopupGalleryFromMedia = () => {
    const popup = getPopup();
    const thumbWrap = popup?.querySelector(".swiper-thumb .swiper-wrapper");
    const closeWrap = popup?.querySelector(".slider-close-up-swiper .swiper-wrapper");
    const updateSwiper = (rootSel) => {
      const el = popup?.querySelector(rootSel);
      const sw = el && typeof el === "object" ? el.swiper : null;
      if (!sw) return;
      try {
        // Ensure Swiper recalculates slides + pagination count (works better than update() alone for some configs).
        sw.updateSlides?.();
      } catch {}
      try {
        sw.update();
      } catch {}
      try {
        sw.pagination?.render?.();
      } catch {}
      try {
        sw.pagination?.update?.();
      } catch {}
    };
    const fillWrap = (wrap) => {
      if (!wrap) return;
      wrap.innerHTML = "";
      const list = _media.length ? _media : [{ url: PRODUCT_PLACEHOLDER_IMAGE, kind: "image" }];
      list.forEach((m) => {
        const slide = document.createElement("div");
        slide.className = "swiper-slide";

        /* iOS-style activity indicator: 12 thin bars rotating with staggered fade.
           Positioned absolutely-center inside the slide; removed once the media loads. */
        const spinner = document.createElement("span");
        spinner.className = "bb-products-ios-spinner";
        spinner.setAttribute("aria-hidden", "true");
        for (let i = 0; i < 12; i++) {
          const bar = document.createElement("i");
          bar.style.transform = `rotate(${i * 30}deg) translate(0, -130%)`;
          bar.style.animationDelay = `${(i - 12) * 0.083}s`;
          spinner.appendChild(bar);
        }
        const removeSpinner = () => {
          try { spinner.remove(); } catch {}
        };

        const url = String(m.url || "").trim();

        /* No URL yet (IndexedDB hydration in flight): render the spinner only — the next
           syncPopupGalleryFromMedia() pass after hydration will rebuild this slide with the
           real image. Avoids a flash of <img src=""> that would error instantly. */
        if (!url) {
          slide.appendChild(spinner);
          wrap.appendChild(slide);
          return;
        }

        if (m.kind === "video") {
          const v = document.createElement("video");
          v.src = url;
          v.muted = true;
          v.loop = true;
          v.playsInline = true;
          v.autoplay = true;
          v.preload = "metadata";
          /* HAVE_CURRENT_DATA (2) is enough for the first frame to be paintable. */
          if (v.readyState >= 2) {
            slide.appendChild(v);
          } else {
            slide.appendChild(spinner);
            v.addEventListener("loadeddata", removeSpinner, { once: true });
            v.addEventListener("error", removeSpinner, { once: true });
            slide.appendChild(v);
          }
        } else {
          const img = document.createElement("img");
          img.src = url;
          img.alt = "";
          img.decoding = "async";
          if (url.includes("BB-Product-Image-Placeholder")) {
            img.classList.add("bb-product-placeholder-img");
          }
          /* If the image is already cached we skip the spinner entirely so a re-render doesn't flash. */
          if (img.complete && img.naturalWidth > 0) {
            slide.appendChild(img);
          } else {
            slide.appendChild(spinner);
            img.addEventListener("load", removeSpinner, { once: true });
            img.addEventListener("error", removeSpinner, { once: true });
            /* decode() resolves only after the bitmap is paint-ready, which is what we actually
               want for very large images where `load` may fire before the decode completes. */
            try {
              img.decode?.().then(removeSpinner, removeSpinner);
            } catch {}
            slide.appendChild(img);
          }
        }
        wrap.appendChild(slide);
      });
    };
    fillWrap(thumbWrap);
    fillWrap(closeWrap);
    // Swiper instances are created by vendor-bb-smart-ui; after changing slides, force pagination to re-render.
    updateSwiper(".swiper-thumb");
    updateSwiper(".slider-close-up-swiper");
    // Match swiper active slide to variant-linked media (also covers paths that rebuild gallery without applyProductToPopup).
    try {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => syncVariantLinkedGallerySlide(popup));
      });
    } catch {}
  };

  const nudgeDockedPopupLayout = () => {
    if (!isDockEnabled()) return;
    const popup = getPopup();
    const mount = document.getElementById("bbThemePopupMount");
    if (!popup || !mount) return;
    // Force a layout pass; helps Swiper compute correct widths after docking.
    try {
      void mount.offsetWidth;
    } catch {}
    const update = (rootSel) => {
      const el = popup?.querySelector(rootSel);
      const sw = el && typeof el === "object" ? el.swiper : null;
      if (!sw) return;
      try {
        sw.updateSlides?.();
      } catch {}
      try {
        sw.update?.();
      } catch {}
      try {
        sw.pagination?.render?.();
      } catch {}
      try {
        sw.pagination?.update?.();
      } catch {}
    };
    update(".swiper-thumb");
    update(".slider-close-up-swiper");
  };

  const slidePopupGalleryTo = (idx) => {
    const popup = getPopup();
    const slide = (rootSel) => {
      const el = popup?.querySelector(rootSel);
      const sw = el && typeof el === "object" ? el.swiper : null;
      if (!sw) return;
      try {
        sw.slideTo?.(idx, 250);
      } catch {}
    };
    // Keep both galleries aligned (thumb + close-up)
    slide(".swiper-thumb");
    slide(".slider-close-up-swiper");
    try {
      // Some configs have controller links; nudging update helps.
      popup?.querySelector(".swiper-thumb")?.swiper?.update?.();
    } catch {}
  };

  /** Last-changed wins: the variant dropdown with the highest "touch tick" whose currently selected
      option carries `data-bb-variant-media` drives the preview swiper. Selects whose current value
      has no link are ignored entirely (so picking an Auto value preserves an older linked winner).
      On first paint nothing has a tick → fall back to the first selected linked option (left → right). */
  const syncVariantLinkedGallerySlide = (popup) => {
    if (!popup) return;
    try {
      const selects = popup.querySelectorAll(
        ".selectors-row select.bb-products-variant-select:not(.bb-products-variant-select--hidden)"
      );
      const count = Math.max(1, Array.isArray(_media) ? _media.length : 0);
      const maxIdx = Math.max(0, count - 1);
      const linkedFromSel = (sel) => {
        if (!sel || sel.selectedIndex <= 0) return null;
        const opt = sel.options[sel.selectedIndex];
        if (!opt || opt.disabled) return null;
        const raw = String(opt.getAttribute("data-bb-variant-media") ?? "").trim();
        if (raw === "") return null;
        const n = Number.parseInt(raw, 10);
        if (!Number.isFinite(n)) return null;
        return Math.min(Math.max(0, n), maxIdx);
      };

      /* Pass 1: pick the linked select with the highest user-touch tick. */
      let bestTick = -1;
      let bestIdx = null;
      for (const sel of selects) {
        const linked = linkedFromSel(sel);
        if (linked == null) continue;
        const tick = Number(sel.__bbVariantTouchTick || 0);
        if (tick > bestTick) {
          bestTick = tick;
          bestIdx = linked;
        }
      }

      /* Pass 2 (initial paint): no select has been touched yet but multiple may carry links —
         keep the old "first linked option wins" so the gallery still reflects the default
         variant selection. */
      if (bestIdx == null) {
        for (const sel of selects) {
          const linked = linkedFromSel(sel);
          if (linked != null) {
            bestIdx = linked;
            break;
          }
        }
      }

      const idx = bestIdx == null ? 0 : bestIdx;
      window.requestAnimationFrame(() => slidePopupGalleryTo(idx));
    } catch {}
  };

  const ensureProductPager = () => {
    const mount = document.getElementById("bbThemePopupMount");
    const popup = getPopup();
    if (!mount || !popup) return;
    const stack = mount.closest?.(".bb-preview-modal-stack") || document.querySelector(".bb-preview-modal-stack");
    const stage = document.querySelector(".bb-preview-stage");
    /* Always mount under `.bb-preview-stage` after the sim stack — never inside the stack as `position:absolute`
       (first paint at wide widths used to park dots over the sim on phones). */
    const attachParent = stage || stack;
    if (!attachParent) return;
    if (attachParent.__bbProductsPager) return;

    try {
      document.querySelectorAll(".bb-products-preview-controls").forEach((n) => n.remove());
      document.querySelectorAll(".bb-products-modal-pager.bb-products-modal-pager--below-stack").forEach((n) => {
        if (!n.closest(".bb-products-preview-controls")) n.remove();
      });
      if (stack) delete stack.__bbProductsPager;
      if (stage) delete stage.__bbProductsPager;
    } catch {}
    attachParent.__bbProductsPager = true;

    const controls = document.createElement("div");
    controls.className =
      "bb-products-preview-controls bb-products-preview-controls--intro";

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
      b.addEventListener("click", () => animateSwitchSlot(i));
      pager.appendChild(b);
    }

    const pill = document.createElement("p");
    pill.className = "bb-products-preview-pill";
    pill.setAttribute("role", "status");
    pill.setAttribute("aria-live", "polite");

    controls.appendChild(pager);
    controls.appendChild(pill);
    attachParent.appendChild(controls);
    setActiveSlotUi(pager, { pulsePill: false });
  };

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

  const pickGalleryDropIndex = (clientX) => {
    const items = Array.from(listEl.querySelectorAll(".bb-products-gallery-item"));
    if (!items.length) return -1;
    const rects = items.map((el) => el.getBoundingClientRect());
    const left = rects[0].left - DROP_ROW_PAD_PX;
    const right = rects[rects.length - 1].right + DROP_ROW_PAD_PX;
    const span = Math.max(1, right - left);
    let t = (clientX - left) / span;
    t = Math.max(0, Math.min(1, t));
    if (items.length === 1) return 0;
    const idx = Math.round(t * (items.length - 1));
    return Math.min(items.length - 1, Math.max(0, idx));
  };

  const commitGalleryReorder = (fromIdx, toIdx) => {
    if (!Number.isFinite(fromIdx) || !Number.isFinite(toIdx)) return;
    if (fromIdx < 0 || toIdx < 0) return;
    if (fromIdx === toIdx) return;
    const [moved] = _media.splice(fromIdx, 1);
    _media.splice(toIdx, 0, moved);
    renderMediaUi();
    syncPopupGalleryFromMedia();
    scheduleVariantsUiAfterGalleryChange();
  };

  const endGalleryDragSession = () => {
    galleryDragIdx = -1;
    galleryLastToIdx = -1;
    try {
      listEl?.classList.remove("bb-products-gallery-list--drag-session");
    } catch {}
  };

  const bindGalleryListDnDOnce = () => {
    if (!listEl || listEl.__bbProductsGalleryDnD) return;
    listEl.__bbProductsGalleryDnD = true;

    listEl.addEventListener("dragover", (e) => {
      if (galleryDragIdx < 0) return;
      e.preventDefault();
      // Important: do NOT rely on dataTransfer after we've already reordered once.
      // The original index becomes stale; always move the currently-dragged index.
      const fromIdx = galleryDragIdx;
      const toIdx = pickGalleryDropIndex(e.clientX);
      if (toIdx < 0) return;
      if (toIdx !== galleryLastToIdx) {
        galleryLastToIdx = toIdx;
        commitGalleryReorder(fromIdx, toIdx);
        galleryDragIdx = toIdx;
      }
    });
    listEl.addEventListener("drop", (e) => {
      e.preventDefault();
      showZoomToast();
    });
  };

  bindGalleryListDnDOnce();
  document.addEventListener(
    "dragend",
    () => {
      endGalleryDragSession();
    },
    true
  );

  const renderMediaUi = () => {
    if (!listEl) return;
    listEl.innerHTML = "";
    let hadJustAdded = false;
    _media.forEach((m, idx) => {
      const item = document.createElement("div");
      item.className = "bb-products-gallery-item";
      item.setAttribute("data-i", String(idx));
      item.draggable = true;
      if (m.justAdded) {
        item.classList.add("bb-products-gallery-item--added");
        hadJustAdded = true;
      }

      const del = document.createElement("button");
      del.type = "button";
      del.className = "bb-products-gallery-del";
      del.setAttribute("aria-label", "Remove media");
      del.textContent = "×";
      del.addEventListener("pointerdown", (e) => e.stopPropagation());
      del.addEventListener("click", () => {
        const removed = _media.splice(idx, 1)[0];
        try {
          if (removed?.url && String(removed.url).startsWith("blob:")) URL.revokeObjectURL(removed.url);
        } catch {}
        try {
          const pid = String(removed?.persistId || "");
          if (pid) MediaStore.revoke(pid);
        } catch {}
        persistSlot(_slotIdx);
        renderMediaUi();
        syncPopupGalleryFromMedia();
        scheduleVariantsUiAfterGalleryChange();
        showZoomToast();
      });

      item.appendChild(del);

      const mediaWrap = document.createElement("div");
      mediaWrap.className = "bb-products-gallery-media";
      mediaWrap.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        runPulse(item);
      });
      mediaWrap.addEventListener("click", () => {
        slidePopupGalleryTo(idx);
        showZoomToast();
      });

      if (m.kind === "video") {
        const v = document.createElement("video");
        v.src = m.url;
        v.muted = true;
        v.loop = true;
        v.playsInline = true;
        v.preload = "metadata";
        v.autoplay = true;
        mediaWrap.appendChild(v);
      } else {
        const img = document.createElement("img");
        img.src = m.url;
        img.alt = "";
        img.decoding = "async";
        mediaWrap.appendChild(img);
      }
      item.appendChild(mediaWrap);
      listEl.appendChild(item);
    });
    // Clear "justAdded" flags after the first paint cycle.
    if (hadJustAdded) {
      _media.forEach((m) => {
        if (m.justAdded) m.justAdded = false;
      });
    }

    listEl.querySelectorAll(".bb-products-gallery-item").forEach((el) => {
      el.addEventListener("dragstart", (e) => {
        const i = Number(el.getAttribute("data-i"));
        galleryDragIdx = Number.isFinite(i) ? i : -1;
        galleryLastToIdx = -1;
        runPulse(el);
        try {
          listEl.classList.add("bb-products-gallery-list--drag-session");
        } catch {}
        try {
          e.dataTransfer?.setData("text/plain", String(galleryDragIdx));
          e.dataTransfer?.setDragImage(el, 24, 24);
          e.dataTransfer.effectAllowed = "move";
        } catch {}
        el.classList.add("bb-products-gallery-item--dragging");
      });
      el.addEventListener("dragend", () => {
        el.classList.remove("bb-products-gallery-item--dragging");
        el.classList.remove("bb-products-gallery-item--pulse");
        try {
          listEl.classList.remove("bb-products-gallery-list--drag-session");
        } catch {}
        endGalleryDragSession();
        showZoomToast();
      });
      el.addEventListener("animationend", (evt) => {
        if (evt.target !== el) return;
        const n = String(evt.animationName || "");
        if (n === "bb-products-gallery-pulse" || n.endsWith("bb-products-gallery-pulse")) {
          el.classList.remove("bb-products-gallery-item--pulse");
        }
        if (n === "bb-products-gallery-added" || n.endsWith("bb-products-gallery-added")) {
          el.classList.remove("bb-products-gallery-item--added");
        }
      });
    });
  };

  const addMediaFiles = (files) => {
    const incoming = Array.from(files || []);
    const remaining = Math.max(0, MAX_MEDIA - _media.length);
    if (incoming.length > remaining) shakeLimitPill();
    const jobs = [];
    for (const f of incoming) {
      if (_media.length >= MAX_MEDIA) break;
      const kind = f.type && f.type.startsWith("video/") ? "video" : "image";
      const id = `bbpm_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const job = (async () => {
        try {
          await MediaStore.put({ id, blob: f.slice ? f.slice(0, f.size, f.type) : f, kind, type: f.type || "" });
          const url = await MediaStore.getObjectUrl(id);
          _media.push({ file: null, url: url || "", kind, justAdded: true, persistId: id });
        } catch {
          // fallback: session-only blob url
          const url = URL.createObjectURL(f);
          _media.push({ file: f, url, kind, justAdded: true });
        }
      })();
      jobs.push(job);
    }
    Promise.all(jobs)
      .catch(() => {})
      .finally(() => {
        persistSlot(_slotIdx);
        Sync.post({ type: "productSlotUpdated", idx: _slotIdx });
        renderMediaUi();
        syncPopupGalleryFromMedia();
        scheduleVariantsUiAfterGalleryChange();
        showZoomToast();
      });
  };

  const wire = (el) => {
    if (!el) return;
    let t = null;
    const schedulePersist = () => {
      try {
        window.clearTimeout(t);
      } catch {}
      t = window.setTimeout(() => {
        saveSlotFromForm();
      }, 200);
    };
    el.addEventListener("input", () => {
      applyProductToPopup();
      if (el === shipModeRegionEl || el === shipModeGlobalEl) syncShippingModeUi();
      if (el === currencyEl) syncShippingRatePlaceholders();
      schedulePersist();
    });
    el.addEventListener("change", () => {
      applyProductToPopup();
      if (el === shipModeRegionEl || el === shipModeGlobalEl) syncShippingModeUi();
      if (el === currencyEl) syncShippingRatePlaceholders();
      schedulePersist();
    });
  };

  [
    nameEl,
    descEl,
    priceEl,
    currencyEl,
    invEl,
    invUnlimitedEl,
    showAvailScarcityEl,
    allowQtyChoiceEl,
    shipFlatEl,
    shipRegionEl,
    shipGlobalFlatEl,
    shipGlobalExcludedEl,
    shipGlobalExcludedBtnEl,
    shipModeRegionEl,
    shipModeGlobalEl,
  ].forEach(wire);

  uploadEl?.addEventListener("change", () => {
    addMediaFiles(uploadEl.files);
    // allow selecting the same file again later
    try {
      uploadEl.value = "";
    } catch {}
    applyProductToPopup();
  });

  // Global excluded countries dropdown (checkbox menu)
  if (shipGlobalExcludedBtnEl && shipGlobalExcludedMenuEl) {
    shipGlobalExcludedBtnEl.addEventListener("click", () => {
      const isOpen = shipGlobalExcludedBtnEl.getAttribute("aria-expanded") === "true";
      setExcludedMenuOpen(!isOpen);
    });
    document.addEventListener(
      "pointerdown",
      (e) => {
        const t = e.target;
        if (!(t instanceof Element)) return;
        if (t.closest("#bbProductGlobalShipExcludedMenu")) return;
        if (t.closest("#bbProductGlobalShipExcludedBtn")) return;
        setExcludedMenuOpen(false);
      },
      true
    );
  }

  // The popup may mount after a delay (vendor-bb-smart-ui). Keep poking briefly.
  let n = 0;
  let didInitialGallerySync = false;
  let didDockedLayoutNudge = false;
  const id = window.setInterval(() => {
    n += 1;
    applyProductToPopup();
    ensureProductPager();
    if (isProductsPreviewNarrow()) {
      const m = document.getElementById("bbThemePopupMount");
      const wrap = m?.querySelector(":scope > .bb-products-popup-flip-wrap");
      const pop = wrap?.querySelector(".popup");
      if (m && wrap && pop) {
        try {
          m.insertBefore(pop, wrap);
          wrap.remove();
        } catch (_) {}
      }
    } else if (isDockEnabled()) ensurePopupFlipWrap();
    // If user clicks thumbnails, show the toast.
    const popup = getPopup();
    if (popup && !didInitialGallerySync) {
      didInitialGallerySync = true;
      syncPopupGalleryFromMedia();
      // Dots/pill parity: keep Theme Design page in sync via storage.
      persistActiveSlot();
    }
    // After docking completes, Swiper sometimes needs an explicit update to avoid a narrow first paint.
    const mounted = !!document.querySelector("#bbThemePopupMount .popup");
    if (mounted && isDockEnabled() && !didDockedLayoutNudge && !isProductsPreviewNarrow()) {
      didDockedLayoutNudge = true;
      // Do a couple of passes to catch "swiper init after dock" timing.
      window.setTimeout(nudgeDockedPopupLayout, 0);
      window.setTimeout(nudgeDockedPopupLayout, 120);
      window.setTimeout(nudgeDockedPopupLayout, 420);
    }
    const thumb = popup?.querySelector(".swiper-thumb");
    if (thumb && !thumb.__bbProductsToastBound) {
      thumb.__bbProductsToastBound = true;
      thumb.addEventListener("click", (e) => {
        const t = e.target;
        if (!(t instanceof Element)) return;
        if (t.closest("img,video,.swiper-slide")) showZoomToast();
      });
    }
    const selRow = popup?.querySelector(".selectors-row");
    if (selRow && !selRow.__bbSelectorsRefresh) {
      selRow.__bbSelectorsRefresh = true;
      const onVariantSelectChange = () => applyProductToPopup();
      selRow.addEventListener("change", onVariantSelectChange);
      selRow.addEventListener("input", onVariantSelectChange);
    }
    // Don't stop the boot loop just because a body-level `.popup` exists.
    // Wait until the popup has been docked into #bbThemePopupMount (desktop), otherwise first paint can be narrow.
    if ((mounted && didDockedLayoutNudge && !isProductsPreviewNarrow()) || n > 60) window.clearInterval(id);
  }, 350);

  // Variant dropdowns: keep Buy button price in sync even if inner markup reloads.
  const mountEl = document.getElementById("bbThemePopupMount");
  if (mountEl && !mountEl.__bbProductsVariantPriceDelegated) {
    mountEl.__bbProductsVariantPriceDelegated = true;
    mountEl.addEventListener(
      "change",
      (e) => {
        const t = e.target;
        if (!t || typeof t.closest !== "function") return;
        if (t.closest(".selectors-row")) applyProductToPopup();
      },
      true
    );
  }

  // Start on slot 1 and bind media to that slot
  seedDefaultMediaIfEmpty();
  _slots[0].media = _media;
  hydrateSlotsFromStorage();
  ensureThemeSlotsInitialized();

  let pendingProductUrlPulseIdx = null;
  const urlSlotIdx = parseProductSlotFromUrl();
  if (urlSlotIdx != null) {
    _slotIdx = urlSlotIdx;
    pendingProductUrlPulseIdx = urlSlotIdx;
    persistActiveSlot();
    try {
      const u = new URL(location.href);
      u.searchParams.delete("slot");
      u.searchParams.delete("product");
      const qs = u.searchParams.toString();
      history.replaceState({}, "", `${u.pathname}${qs ? `?${qs}` : ""}${u.hash}`);
    } catch {}
  } else {
    _slotIdx = readInitialActiveSlot();
    persistActiveSlot();
  }

  applyThemeSlotToBase(_slotIdx);
  loadSlotToForm(_slotIdx);
  renderMediaUi();
  syncPopupGalleryFromMedia();
  syncShippingModeUi();
  syncShippingRatePlaceholders();

  if (pendingProductUrlPulseIdx != null) {
    const pulseIdx = pendingProductUrlPulseIdx;
    pendingProductUrlPulseIdx = null;
    window.setTimeout(() => {
      ensureProductPager();
      pulseProductPagerDotOnly(pulseIdx);
      setActiveSlotUi(getProductPagerEl(), { pulsePill: true });
    }, 650);
  }

  // Realtime: if Theme Design updates the active theme or theme slot, refresh immediately.
  Sync.on((msg) => {
    if (!msg || typeof msg !== "object") return;
    if (msg.src && msg.src === SOURCE_ID) return;
    if (msg.type === "activeSlotChanged") {
      const i = Number(msg.idx);
      if (Number.isFinite(i)) switchSlot(i);
      return;
    }
    if (msg.type === "themeSlotSaved" || msg.type === "themeSlotApplied") {
      // If Theme Design saved/applied for this slot, re-apply to popup.
      const i = Number(msg.idx);
      if (!Number.isFinite(i) || i !== _slotIdx) return;
      // Do NOT re-write base theme keys here (causes feedback loops / flashes).
      // Just nudge the popup/theme listeners to re-read, and repaint text/icon colours.
      nudgeThemeListeners(_slotIdx);
      applyThemeToPopup();
      return;
    }
  });

  // Polling fallback: react to sync version changes (event-driven; avoid full rehydrate loops).
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
        const i = Number(evt.idx);
        if (Number.isFinite(i) && i !== _slotIdx) switchSlot(i);
        return;
      }
      if (evt.type === "themeSlotSaved" || evt.type === "themeSlotApplied") {
        const i = Number(evt.idx);
        if (Number.isFinite(i) && i === _slotIdx) {
          // Theme keys already swapped by the other page; just nudge listeners + repaint.
          nudgeThemeListeners(_slotIdx);
          applyThemeToPopup();
        }
        return;
      }
      if (evt.type === "productSlotUpdated") {
        const i = Number(evt.idx);
        if (Number.isFinite(i) && i === _slotIdx) loadSlotToForm(_slotIdx);
      }
    } catch {}
  }, 350);
})();

