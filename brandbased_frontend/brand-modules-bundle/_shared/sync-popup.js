/**
 * Shared sync popup. Use from any Sync / Publish / Verify button:
 *
 *   bbShowSyncPopup({ logoSrc: "../brandbased-logo.svg", barColor: "#635bff" })
 *     .then(() => console.info("done"));
 *
 * Lifecycle:
 *   1. Show the popup with `label` (default "Syncing") and a bar that
 *      fills over `duration` ms.
 *   2. At `duration` ms the popup transitions to its "done" state:
 *      label swaps to `doneLabel` (auto-derived from `label` —
 *      "Syncing" → "Synced", "Publishing" → "Published",
 *      "Validating…" → "Validated", etc.) and the logo fires a
 *      one-shot pulse via the `.bb-sync-popup__logo--done` class.
 *   3. After `doneHoldMs` ms (default 1200) the popup fades out and
 *      the returned Promise resolves.
 *
 * Two execution contexts:
 *
 *   - Top-level (the dashboard or a standalone page): builds the
 *     popup DOM directly inside `document.body` and runs the
 *     animation here. This is the original behaviour.
 *
 *   - Inside an iframe (e.g. a Brand Console module): the script
 *     does NOT build any DOM. Instead it postMessages the call up
 *     to the parent window, which renders the popup at the
 *     dashboard level (full-viewport, above all chrome). When the
 *     parent fires its "done" message back, the Promise resolves.
 *     This lets sync popups feel like a single dashboard concern
 *     rather than something that happens "inside" each module.
 *
 * Options:
 *   - logoSrc:    path to brandbased logo SVG (relative to current page).
 *   - label:      text shown under the logo. Default "Syncing".
 *   - doneLabel:  text shown for the finishing beat. Defaults to
 *                 deriving from `label` (strip trailing ellipsis/dots,
 *                 then replace a trailing "ing" with "ed").
 *   - barColor:   progress bar colour (CSS colour). Default brand purple.
 *   - duration:   ms the bar takes to fill. Default 3000.
 *   - doneHoldMs: ms to hold the "done" state before dismissing.
 *                 Default 1200.
 *   - shineLabel: true to add a subtle moving shine to the label.
 *
 * Returns a Promise that resolves once the popup has fully dismissed.
 */
(function () {
  if (window.bbShowSyncPopup && window.bbShowConfirmPopup && window.bbOpenSyncProgressModal) {
    return;
  }

  function clampProgress(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, n));
  }

  /** Brand B icon for the white circle (resolved from sync-popup.css location). */
  function resolveDefaultSyncLogoSrc() {
    if (typeof global.BB_APP !== "undefined" && global.BB_APP.syncPopupLogoSrc) {
      try {
        return new URL(String(global.BB_APP.syncPopupLogoSrc), location.href).href;
      } catch (_e) {
        return String(global.BB_APP.syncPopupLogoSrc);
      }
    }
    try {
      const link = document.querySelector('link[href*="sync-popup.css"]');
      if (link && link.href) {
        return new URL("../brandbased-logo.svg", link.href).href;
      }
    } catch (_e) { /* ignore */ }
    try {
      return new URL("brand-modules-bundle/brandbased-logo.svg", location.href).href;
    } catch (_e2) {
      return "../brand-modules-bundle/brandbased-logo.svg";
    }
  }

  function resolveSyncLogoUrl(src) {
    const raw = String(src || resolveDefaultSyncLogoSrc());
    if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
    try {
      return new URL(raw, location.href).href;
    } catch (_e) {
      return raw;
    }
  }

  function cleanProgressModalOpts(opts) {
    const cleaned = {};
    const o = opts || {};
    if (typeof o.label === "string") cleaned.label = o.label;
    if (typeof o.barColor === "string") cleaned.barColor = o.barColor;
    if (Number.isFinite(o.progress)) cleaned.progress = o.progress;
    if (o.shineLabel) cleaned.shineLabel = true;
    if (typeof o.logoSrc === "string" && o.logoSrc) {
      try {
        cleaned.logoSrc = new URL(o.logoSrc, location.href).href;
      } catch (_e) {
        cleaned.logoSrc = o.logoSrc;
      }
    }
    return cleaned;
  }

  function dismissOverlayParts(parts) {
    return new Promise(function (resolve) {
      try {
        parts.backdrop.classList.remove("bb-sync-popup-backdrop--show");
      } catch (_e) { /* ignore */ }
      window.setTimeout(function () {
        try { parts.backdrop.remove(); } catch (_e2) { /* ignore */ }
        resolve();
      }, 240);
    });
  }

  function openSyncProgressModalTopLevel(opts) {
    const o = opts || {};
    const parts = buildOverlay(o);
    parts.fill.classList.add("bb-sync-popup__bar-fill--driven");
    parts.fill.style.animation = "none";
    parts.fill.style.transition = "width 0.5s cubic-bezier(0.45, 0.05, 0.55, 0.95)";
    parts.fill.style.width = clampProgress(o.progress) + "%";

    if (o.shineLabel) {
      parts.label.classList.add("bb-sync-popup__label--shine");
    }

    document.body.appendChild(parts.backdrop);
    parts.backdrop.setAttribute("aria-busy", "true");

    requestAnimationFrame(function () {
      parts.backdrop.classList.add("bb-sync-popup-backdrop--show");
    });

    let closed = false;

    function update(updateOpts) {
      if (closed || !updateOpts) return;
      if (typeof updateOpts.label === "string") {
        parts.label.textContent = updateOpts.label;
        if (!parts.label.classList.contains("bb-sync-popup__label--done")) {
          parts.label.classList.add("bb-sync-popup__label--shine");
        }
      }
      if (Number.isFinite(updateOpts.progress)) {
        parts.fill.style.width = clampProgress(updateOpts.progress) + "%";
      }
      if (typeof updateOpts.barColor === "string") {
        parts.popup.style.setProperty("--bb-sync-popup-bar-color", updateOpts.barColor);
      }
    }

    function dismiss() {
      if (closed) return Promise.resolve();
      closed = true;
      return dismissOverlayParts(parts);
    }

    function finish(finishOpts) {
      if (closed) return Promise.resolve();
      const fo = finishOpts || {};
      const doneLabel = String(fo.doneLabel || deriveDoneLabel(fo.label || parts.label.textContent));
      const doneHoldMs = Number.isFinite(fo.doneHoldMs) ? fo.doneHoldMs : 1200;

      if (typeof fo.label === "string") {
        parts.label.textContent = fo.label;
      }

      try {
        parts.label.classList.remove("bb-sync-popup__label--shine");
        parts.label.classList.add("bb-sync-popup__label--done");
        parts.fill.style.width = "100%";
        parts.logoWrap.classList.add("bb-sync-popup__logo--done");
        parts.backdrop.setAttribute("aria-busy", "false");
        parts.backdrop.setAttribute("aria-label", doneLabel);
        window.setTimeout(function () {
          parts.label.textContent = doneLabel;
        }, 120);
      } catch (_e) { /* ignore */ }

      return new Promise(function (resolve) {
        window.setTimeout(function () {
          closed = true;
          dismissOverlayParts(parts).then(resolve);
        }, doneHoldMs);
      });
    }

    return { update: update, finish: finish, dismiss: dismiss, _parts: parts };
  }

  /* --------------------------------------------------------------
     Iframe forwarding mode.
     If we're rendered inside an iframe, every bbShowSyncPopup AND
     every bbShowConfirmPopup call becomes a postMessage to the
     parent dashboard. We never touch this document's DOM, so the
     popup visually escapes the iframe and covers the whole viewport
     (chrome included), matching the dashboard's loader behaviour.
     -------------------------------------------------------------- */
  if (window.self !== window.top) {
    var pending = {};        /* sync popups */
    var nextId = 0;
    var confirmPending = {}; /* confirm popups */
    var confirmNextId = 0;

    window.addEventListener("message", function (e) {
      var d = e && e.data;
      if (!d) return;
      if (d.type === "bb-dash-sync-popup-done") {
        var cb = pending[d.id];
        if (cb) {
          delete pending[d.id];
          cb();
        }
        return;
      }
      if (d.type === "bb-dash-confirm-popup-done") {
        var ccb = confirmPending[d.id];
        if (ccb) {
          delete confirmPending[d.id];
          ccb(!!d.result);
        }
      }
    });

    window.bbShowSyncPopup = function (opts) {
      return new Promise(function (resolve) {
        var id = ++nextId;
        pending[id] = resolve;
        try {
          var cleaned = {};
          if (opts) {
            if (typeof opts.label === "string") cleaned.label = opts.label;
            if (typeof opts.doneLabel === "string") cleaned.doneLabel = opts.doneLabel;
            if (typeof opts.barColor === "string") cleaned.barColor = opts.barColor;
            if (Number.isFinite(opts.duration)) cleaned.duration = opts.duration;
            if (Number.isFinite(opts.doneHoldMs)) cleaned.doneHoldMs = opts.doneHoldMs;
            if (opts.shineLabel) cleaned.shineLabel = true;
            if (typeof opts.logoSrc === "string" && opts.logoSrc) {
              /* Resolve to an absolute URL so the dashboard (which
                 has a different document base than this iframe) can
                 still fetch the logo if it chooses to use it. */
              try {
                cleaned.logoSrc = new URL(opts.logoSrc, location.href).href;
              } catch (_resolveErr) {
                cleaned.logoSrc = opts.logoSrc;
              }
            }
          }
          window.parent.postMessage({
            type: "bb-dash-sync-popup",
            id: id,
            opts: cleaned
          }, "*");
        } catch (_e) {
          /* PostMessage failed (no parent / blocked) — don't hang
             the caller; resolve immediately and let the calling
             code's `.then(...)` chain run with no visible popup. */
          delete pending[id];
          resolve();
        }
      });
    };

    /* Forwarded confirm popup. Resolves with the user's choice
       (true = confirmed, false = cancelled / dismissed). Same
       postMessage shape as sync popup so the dashboard router can
       handle both via a single message listener. */
    window.bbShowConfirmPopup = function (opts) {
      return new Promise(function (resolve) {
        var id = ++confirmNextId;
        confirmPending[id] = resolve;
        try {
          var cleaned = {};
          if (opts) {
            if (typeof opts.title === "string") cleaned.title = opts.title;
            if (typeof opts.body === "string") cleaned.body = opts.body;
            if (typeof opts.confirmLabel === "string") cleaned.confirmLabel = opts.confirmLabel;
            if (typeof opts.cancelLabel === "string") cleaned.cancelLabel = opts.cancelLabel;
            if (opts.danger) cleaned.danger = true;
          }
          window.parent.postMessage({
            type: "bb-dash-confirm-popup",
            id: id,
            opts: cleaned
          }, "*");
        } catch (_e) {
          delete confirmPending[id];
          /* No parent / blocked — treat as cancelled rather than
             hanging so callers don't stall mid-action. */
          resolve(false);
        }
      });
    };

    /* Verification progress modal — render inside the iframe so it is
       always visible over the module (parent postMessage was unreliable
       and could sit behind the iframe). Timed bbShowSyncPopup still
       forwards to the dashboard. */
    window.bbOpenSyncProgressModal = function (opts) {
      return openSyncProgressModalTopLevel(cleanProgressModalOpts(opts || {}));
    };

    return;
  }

  /* --------------------------------------------------------------
     Top-level (dashboard / standalone) mode — original behaviour.
     -------------------------------------------------------------- */
  function deriveDoneLabel(rawLabel) {
    const cleaned = String(rawLabel || "Syncing")
      .replace(/[\s\u2026.…]+$/u, "")
      .trim();
    if (!cleaned) return "Synced";
    if (/ing$/i.test(cleaned)) return cleaned.replace(/ing$/i, "ed");
    return cleaned + " ✓";
  }

  function buildOverlay(opts) {
    const o = opts || {};
    const backdrop = document.createElement("div");
    backdrop.className = "bb-sync-popup-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-label", String(o.label || "Syncing"));

    const popup = document.createElement("div");
    popup.className = "bb-sync-popup";
    if (o.barColor) popup.style.setProperty("--bb-sync-popup-bar-color", String(o.barColor));
    if (Number.isFinite(o.duration)) {
      popup.style.setProperty("--bb-sync-popup-duration", String(o.duration) + "ms");
    }

    const logoWrap = document.createElement("span");
    logoWrap.className = "bb-sync-popup__logo";
    const img = document.createElement("img");
    img.src = resolveSyncLogoUrl(o.logoSrc);
    img.alt = "";
    img.decoding = "async";
    logoWrap.appendChild(img);
    popup.appendChild(logoWrap);

    const label = document.createElement("p");
    label.className = "bb-sync-popup__label";
    if (o.shineLabel) label.classList.add("bb-sync-popup__label--shine");
    label.textContent = String(o.label || "Syncing");
    popup.appendChild(label);

    const bar = document.createElement("div");
    bar.className = "bb-sync-popup__bar";
    const fill = document.createElement("div");
    fill.className = "bb-sync-popup__bar-fill";
    bar.appendChild(fill);
    popup.appendChild(bar);

    backdrop.appendChild(popup);
    return { backdrop: backdrop, popup: popup, label: label, fill: fill, logoWrap: logoWrap };
  }

  function bbShowSyncPopup(opts) {
    const o = opts || {};
    const duration = Number.isFinite(o.duration) ? o.duration : 3000;
    const doneHoldMs = Number.isFinite(o.doneHoldMs) ? o.doneHoldMs : 1200;
    const doneLabel = String(o.doneLabel || deriveDoneLabel(o.label));
    const parts = buildOverlay(o);
    document.body.appendChild(parts.backdrop);

    parts.backdrop.setAttribute("aria-busy", "true");

    /* Trigger fade-in on the next frame so transitions actually run. */
    requestAnimationFrame(function () {
      parts.backdrop.classList.add("bb-sync-popup-backdrop--show");
    });

    return new Promise(function (resolve) {
      /* Phase 1: bar fill complete → swap to the "done" beat. */
      window.setTimeout(function () {
        try {
          parts.label.textContent = doneLabel;
          parts.label.classList.remove("bb-sync-popup__label--shine");
          parts.label.classList.add("bb-sync-popup__label--done");
          parts.fill.style.animation = "none";
          parts.fill.style.width = "100%";
          parts.logoWrap.classList.add("bb-sync-popup__logo--done");
          parts.backdrop.setAttribute("aria-busy", "false");
          parts.backdrop.setAttribute("aria-label", doneLabel);
        } catch {}

        /* Phase 2: hold the "done" beat, then dismiss. */
        window.setTimeout(function () {
          parts.backdrop.classList.remove("bb-sync-popup-backdrop--show");
          window.setTimeout(function () {
            try { parts.backdrop.remove(); } catch {}
            resolve();
          }, 240);
        }, doneHoldMs);
      }, duration);
    });
  }

  window.bbShowSyncPopup = bbShowSyncPopup;
  window.bbOpenSyncProgressModal = openSyncProgressModalTopLevel;

  /* ------------------------------------------------------------
     Top-level confirm popup. Same glass / full-viewport language
     as bbShowSyncPopup but with two action buttons. Returns a
     Promise<boolean> — `true` if the user clicks the confirm
     button, `false` on cancel / Esc / backdrop click / dismissal.
     ------------------------------------------------------------ */
  function bbShowConfirmPopup(opts) {
    const o = opts || {};
    const title        = String(o.title || "Are you sure?");
    const body         = String(o.body || "");
    const confirmLabel = String(o.confirmLabel || "Confirm");
    const cancelLabel  = String(o.cancelLabel || "Cancel");
    const isDanger     = !!o.danger;

    const backdrop = document.createElement("div");
    /* Re-use the sync-popup backdrop class so the dashboard router's
       `relocateLatestSyncPopupIntoScreen()` re-parents this popup
       into `.screen` the same way it does for sync popups (keeps
       dashboard chrome painting above the popup's blur). */
    backdrop.className = "bb-sync-popup-backdrop bb-confirm-popup-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-label", title);

    const popup = document.createElement("div");
    popup.className = "bb-sync-popup bb-confirm-popup";
    if (isDanger) popup.classList.add("bb-confirm-popup--danger");

    /* Brand B icon at the top of the card — same circle / breathing
       pulse the sync popups use. We inline the B as SVG (rather than
       <img>) so the silhouette's fill is under our direct control
       and the danger variant can paint it red without needing a
       separate red SVG asset. Path data lifted from b-white.svg.
       The halo colour is driven by --bb-sync-popup-bar-color, which
       .bb-confirm-popup--danger flips to red below. */
    const logoWrap = document.createElement("span");
    logoWrap.className = "bb-sync-popup__logo bb-confirm-popup__logo";
    logoWrap.innerHTML =
      '<svg class="bb-confirm-popup__logo-svg" viewBox="0 0 30 43"' +
      ' xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">' +
      '<path d="M 14.082157,43.029444 C 11.486276,42.89346 8.7470742,41.989394 6.5481027,40.545644 3.009681,38.221044 0.76669177,34.647238 0.29724018,30.586288 0.22651188,29.980305 0.21739218,28.185467 0.21739218,14.997931 V 0.09673646 H 0.45824335 C 1.0837329,0.09774976 2.2762244,0.20834124 2.7583827,0.30402712 5.5982762,0.87464651 7.7319406,2.6517915 8.2862154,4.9106389 c 0.0762,0.3120656 0.087043,1.2618712 0.1116048,10.3299471 l 0.026751,9.985692 0.3011729,1.467339 c 0.1982217,0.97068 0.2853047,1.49185 0.253558,1.539475 -0.024927,0.03901 -0.8522863,0.602366 -1.8374769,1.25099 -0.9851906,0.648623 -2.5904293,1.704572 -3.5669968,2.347754 -0.9938036,0.653619 -1.7485699,1.183412 -1.7149993,1.201094 0.03354,0.01631 0.1859708,0.04631 0.3401849,0.06404 1.8479138,0.212722 8.518789,1.06138 8.54554,1.087696 0.01956,0.01956 0.629137,1.591164 1.355319,3.4926 1.647888,4.312228 1.541745,4.03965 1.577119,4.037826 0.01773,0 0.910805,-1.601621 1.984426,-3.559751 1.073651,-1.957665 1.972195,-3.570169 1.994872,-3.584233 0.0231,-0.01398 2.058833,-0.04762 4.523613,-0.07448 2.462976,-0.02675 4.488228,-0.05674 4.500479,-0.0689 0.01034,-0.01034 -0.524353,-0.485796 -1.190668,-1.054592 -0.666315,-0.568805 -2.127767,-1.817514 -3.247676,-2.774576 l -2.037492,-1.739957 1.335803,-3.798779 c 0.73526,-2.088755 1.332185,-3.811019 1.327199,-3.828712 -0.01034,-0.02675 -2.002138,0.901726 -7.71278,3.591479 l -0.281667,0.132914 -2.870292,-1.800289 0.01398,-3.800582 c 0.0091,-2.090579 0.02635,-3.812844 0.04266,-3.826908 0.03719,-0.03901 0.944355,-0.173721 1.566227,-0.235856 0.768831,-0.07448 2.237537,-0.06212 3.084382,0.02675 1.942242,0.203663 3.660889,0.713941 5.432593,1.615676 2.257489,1.14666 4.062764,2.735574 5.437578,4.785773 1.188854,1.771704 1.858797,3.508033 2.191726,5.691146 0.117006,0.766997 0.1188,2.680674 0.001,3.446333 -0.361505,2.400375 -1.261426,4.544466 -2.710627,6.450898 -0.462652,0.611425 -1.786224,1.956307 -2.404469,2.445305 -1.973988,1.562609 -4.348058,2.622115 -6.885411,3.073945 -1.077269,0.191413 -2.457525,0.265789 -3.694003,0.20185 z"/>' +
      '</svg>';
    popup.appendChild(logoWrap);

    const h = document.createElement("h3");
    h.className = "bb-confirm-popup__title";
    h.textContent = title;
    popup.appendChild(h);

    if (body) {
      const p = document.createElement("p");
      p.className = "bb-confirm-popup__body";
      p.textContent = body;
      popup.appendChild(p);
    }

    const actions = document.createElement("div");
    actions.className = "bb-confirm-popup__actions";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "bb-confirm-popup__btn bb-confirm-popup__btn--cancel";
    cancelBtn.setAttribute("data-confirm", "cancel");
    cancelBtn.textContent = cancelLabel;
    actions.appendChild(cancelBtn);

    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "bb-confirm-popup__btn bb-confirm-popup__btn--confirm";
    if (isDanger) confirmBtn.classList.add("bb-confirm-popup__btn--danger");
    confirmBtn.setAttribute("data-confirm", "yes");
    confirmBtn.textContent = confirmLabel;
    actions.appendChild(confirmBtn);

    popup.appendChild(actions);
    backdrop.appendChild(popup);
    document.body.appendChild(backdrop);

    requestAnimationFrame(function () {
      backdrop.classList.add("bb-sync-popup-backdrop--show");
    });
    try { confirmBtn.focus({ preventScroll: true }); } catch {}

    return new Promise(function (resolve) {
      function close(result) {
        backdrop.classList.remove("bb-sync-popup-backdrop--show");
        document.removeEventListener("keydown", onKey);
        window.setTimeout(function () {
          try { backdrop.remove(); } catch {}
          resolve(!!result);
        }, 240);
      }
      function onKey(e) {
        if (e.key === "Escape") close(false);
        if (e.key === "Enter") {
          /* If the user has focus inside the action row, let the
             button's own click handler fire instead of resolving
             twice. */
          const t = e.target;
          if (t && t.closest && t.closest(".bb-confirm-popup__actions")) return;
          close(true);
        }
      }
      backdrop.addEventListener("click", function (e) {
        const btn = e.target.closest && e.target.closest("[data-confirm]");
        if (btn) {
          close(btn.getAttribute("data-confirm") === "yes");
          return;
        }
        if (e.target === backdrop) close(false);
      });
      document.addEventListener("keydown", onKey);
    });
  }

  window.bbShowConfirmPopup = bbShowConfirmPopup;
})();
