/**
 * Dev-only: Freemium dashboard simulation.
 *
 * When `localStorage.bbDevDashSimulateFreemium === "1"` (toggled from
 * `brand-modules-bundle/dev/export-settings.html`), every non-freemium
 * module loaded in `#bbDashFrame` is covered by a frosted glass panel
 * (same visual language as Account → Preferences) with the Premium
 * upgrade message — so stakeholders can preview the paywall in-context.
 *
 * Paths under `/freemium/` (or `\freemium\` on Windows) are excluded.
 */
(function () {
  if (window.bbDevFreemiumGateInit) return;
  window.bbDevFreemiumGateInit = true;

  const LS_KEY = "bbDevDashSimulateFreemium";

  function simulateFreemiumOn() {
    try {
      return localStorage.getItem(LS_KEY) === "1";
    } catch (_e) {
      return false;
    }
  }

  /* Routes the gate must NOT cover. Anything under a `freemium`
     folder is excluded because those pages already ARE the freemium
     UI. Start Now is excluded — it's the upgrade entry point — and
     Brands is excluded because a Freemium user still needs to be
     able to see/manage their own brand entries. */
  function isExcludedPath(p) {
    const s = String(p || "").toLowerCase();
    if (/[/\\]freemium[/\\]/.test(s)) return true;
    if (/[/\\]start-now[/\\]/.test(s)) return true;
    if (/start-now\.html(\?|$|#)/.test(s)) return true;
    if (/[/\\]brands[/\\]/.test(s)) return true;
    if (/\bbrands\.html(\?|$|#)/.test(s)) return true;
    return false;
  }

  function hasRealModule(src) {
    if (!src || src === "about:blank") return false;
    return true;
  }

  function getFrame() {
    return document.getElementById("bbDashFrame");
  }

  function getGate() {
    return document.getElementById("bbDevFreemiumGate");
  }

  /** Last path the iframe announced via `postMessage` (bb-dash-route). */
  let lastPostedPath = "";

  /** One-shot override: when an embedded module (e.g. the Brands
   *  page's Add-Brand → Premium flow) explicitly asks for the gate
   *  even on an otherwise-excluded route, we honour it until the
   *  iframe navigates somewhere else. */
  let forceShowUntilNextRoute = false;

  function effectiveModulePath(frame) {
    if (!frame) return "";
    try {
      const cw = frame.contentWindow;
      if (cw && cw.location && cw.location.pathname) {
        const p = cw.location.pathname + (cw.location.search || "");
        if (p && p !== "/") return p;
      }
    } catch (_e) {
      /* cross-origin — fall through */
    }
    if (lastPostedPath) return lastPostedPath;
    const src = frame.getAttribute("src") || "";
    try {
      const u = new URL(src, window.location.href);
      return u.pathname + u.search;
    } catch (_e2) {
      return src;
    }
  }

  function updateGate() {
    const frame = getFrame();
    const gate = getGate();
    if (!frame || !gate) return;

    const src = frame.getAttribute("src") || "";
    const path = effectiveModulePath(frame);
    const simOn = simulateFreemiumOn();
    const excluded = isExcludedPath(path) || isExcludedPath(src);
    const loaded = hasRealModule(src);

    /* Standard rule + one-shot override from `bb-dev-show-upgrade`:
       the override is gated on the dev flag itself being on, so it
       can never unintentionally surface the gate in Premium mode. */
    const show = simOn && loaded && (!excluded || forceShowUntilNextRoute);
    gate.classList.toggle("bb-dev-freemium-gate--visible", show);
    gate.toggleAttribute("hidden", !show);
    gate.setAttribute("aria-hidden", show ? "false" : "true");
    if (document.body) {
      document.body.classList.toggle("bb-dev-freemium-gated", show);
      /* Separate from "is the gate currently up?" — this just tracks
         "is the user simulated as Freemium right now?". Dashboard
         chrome (e.g. the `.get-premium` CTA) uses this to decide
         whether to reveal Freemium-only upsells. */
      document.body.classList.toggle("bb-dev-freemium-mode", simOn);
    }
  }

  window.addEventListener("message", function (e) {
    const data = e && e.data;
    if (!data || typeof data !== "object") return;
    const frame = getFrame();
    if (!frame) return;
    if (e.source && frame.contentWindow && e.source !== frame.contentWindow) {
      return;
    }
    if (data.type === "bb-dash-route") {
      lastPostedPath = String(data.path || data.href || "");
      /* Any genuine route announcement from the iframe means the
         user has moved on from the page that asked for the override,
         so retire it. */
      forceShowUntilNextRoute = false;
      updateGate();
    } else if (data.type === "bb-dev-show-upgrade") {
      /* Explicit request from an embedded module (e.g. Brands' Add
         Brand → Premium flow under Freemium sim). Only meaningful
         when the dev flag is on — otherwise it's a no-op. */
      if (simulateFreemiumOn()) {
        forceShowUntilNextRoute = true;
        updateGate();
      }
    }
  });

  /* Public API for dashboard chrome (e.g. the Account menu's
     "Subscriptions" item) to force-show the gate without going
     through the iframe-scoped postMessage path. Same semantics as
     `bb-dev-show-upgrade`: only takes effect when the dev Freemium
     simulation flag is on; otherwise it's a no-op. The override
     auto-retires on the next iframe route announcement / load. */
  window.bbDevForceShowUpgradeGate = function () {
    if (!simulateFreemiumOn()) return false;
    forceShowUntilNextRoute = true;
    updateGate();
    return true;
  };

  function bind() {
    const frame = getFrame();
    if (!frame) return;
    frame.addEventListener("load", function () {
      /* Fresh document — path from the previous iframe is stale until
         the new page posts `bb-dash-route`. Any prior one-shot
         "force-show" request retires on navigation. */
      lastPostedPath = "";
      forceShowUntilNextRoute = false;
      updateGate();
    });
    window.addEventListener("storage", function (ev) {
      if (!ev || ev.key === null || ev.key === LS_KEY) updateGate();
    });
    window.addEventListener("focus", updateGate);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) updateGate();
    });
    updateGate();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind, { once: true });
  } else {
    bind();
  }
})();
