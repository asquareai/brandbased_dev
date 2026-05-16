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

  function getBrandName(trigger) {
    const card = trigger.closest(".bb-brands-card");
    if (!card) return "Brand";
    const nameEl = card.querySelector(".bb-brands-name");
    return nameEl && nameEl.textContent ? nameEl.textContent.trim() : "Brand";
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
      const brand = getBrandName(activeTrigger);
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
      '<button type="button" class="bb-brands-action-item" data-tier="freemium" role="menuitem">Freemium</button>',
      '<button type="button" class="bb-brands-action-item" data-tier="premium" role="menuitem">Premium</button>',
    ].join("");
    document.body.appendChild(tierPopover);

    tierPopover.addEventListener("click", function (e) {
      const item = e.target.closest(".bb-brands-action-item");
      if (!item || !tierTrigger) return;
      const tier = item.getAttribute("data-tier");
      closeTierPopover();
      if (tier === "freemium") {
        window.location.href = "../freemium/Freemium-Logo-upload-and-Crop-module.html";
        return;
      }
      if (tier === "premium") {
        if (devFreemiumSimOn() && requestParentUpgradeGate()) return;
        window.location.href = "../logo-upload/Logo-upload-and-Crop-module.html";
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

  function runAction(action, brand) {
    if (action === "publish") {
      if (typeof window.bbShowSyncPopup === "function") {
        window.bbShowSyncPopup({
          label: "Publishing",
          barColor: "#635bff",
          logoSrc: "../brandbased-logo.svg",
          shineLabel: true,
          duration: 3000,
          doneHoldMs: 1200,
        });
      }
      return;
    }
    if (action === "unpublish") {
      if (typeof window.bbShowSyncPopup === "function") {
        /* Trailing "..." is stripped by the shared module before deriving
           the done label, so "Unpublishing..." cleanly becomes "Unpublished". */
        window.bbShowSyncPopup({
          label: "Unpublishing...",
          barColor: "#635bff",
          logoSrc: "../brandbased-logo.svg",
          shineLabel: true,
          duration: 3000,
          doneHoldMs: 1200,
        });
      }
      return;
    }
    if (action === "delete") {
      showDeleteConfirm(brand).then(function (confirmed) {
        if (!confirmed) return;
        if (typeof window.bbShowSyncPopup === "function") {
          window.bbShowSyncPopup({
            label: "Deleting",
            barColor: "#e74c3c",
            logoSrc: "../brandbased-logo.svg",
            shineLabel: true,
            duration: 3000,
            doneHoldMs: 1500,
          });
        }
      });
      return;
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

  function bindTriggers() {
    const triggers = document.querySelectorAll(".bb-brands-publish-trigger");
    triggers.forEach(function (trigger) {
      trigger.addEventListener("click", function (e) {
        e.stopPropagation();
        const isOpen = trigger.getAttribute("aria-expanded") === "true";
        if (isOpen) {
          closePopover();
        } else {
          openPopover(trigger);
        }
      });
    });

    /* Outside click closes whichever floating menu is open. */
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

    /* Re-anchor on scroll / resize while open. */
    window.addEventListener("scroll", function () {
      if (activeTrigger) positionPopover(activeTrigger);
      if (tierTrigger && tierPopover) positionFixedPopover(tierPopover, tierTrigger);
    }, { passive: true });
    window.addEventListener("resize", function () {
      if (activeTrigger) positionPopover(activeTrigger);
      if (tierTrigger && tierPopover) positionFixedPopover(tierPopover, tierTrigger);
    });
  }

  /* Make every real brand card (not the "Add brand" CTA) act as a link
     into the Brand Verification (meta-verification) page. Clicks on
     the inner URL pill, the publish-menu trigger and the popover are
     left alone so those continue to behave as expected. */
  function bindCardLinks() {
    const BRAND_TARGET = "../logo-upload/Meta-Verification.html";
    const cards = document.querySelectorAll(
      ".bb-brands-card:not(.bb-brands-card--add)"
    );

    function isInteractiveTarget(el) {
      if (!el || !el.closest) return false;
      return !!(
        el.closest(".bb-brands-url") ||
        el.closest(".bb-brands-publish-menu") ||
        el.closest(".bb-brands-publish-trigger") ||
        el.closest(".bb-brands-action-popover") ||
        el.closest(".bb-brands-confirm-backdrop")
      );
    }

    function navigate(card) {
      const circle = card.querySelector(".bb-brands-circle");
      if (circle) {
        circle.classList.remove("bb-brands-circle--bump");
        void circle.offsetWidth;
        circle.classList.add("bb-brands-circle--bump");
      }
      window.setTimeout(function () {
        window.location.href = BRAND_TARGET;
      }, 160);
    }

    cards.forEach(function (card) {
      card.setAttribute("role", "link");
      card.setAttribute("tabindex", "0");
      card.setAttribute("aria-label",
        (card.querySelector(".bb-brands-name") || {}).textContent
          ? "Open " + card.querySelector(".bb-brands-name").textContent.trim()
          : "Open brand"
      );

      card.addEventListener("click", function (e) {
        if (isInteractiveTarget(e.target)) return;
        if (popover && popover.contains(e.target)) return;
        if (tierPopover && tierPopover.contains(e.target)) return;
        e.preventDefault();
        navigate(card);
      });

      card.addEventListener("keydown", function (e) {
        if (isInteractiveTarget(e.target)) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(card);
        }
      });
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

  function init() {
    try {
      bindDevPreviewFlags();
      const syncBtn = document.getElementById("bbBrandsSyncBtn");
      if (syncBtn) {
        syncBtn.addEventListener("click", function () {
          if (typeof window.bbShowSyncPopup === "function") {
            window.bbShowSyncPopup();
          }
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

      bindTriggers();
      bindCardLinks();
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
