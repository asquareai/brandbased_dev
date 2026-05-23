/**
 * Brand Console — sidebar / mobile footer nav visibility by plan tier.
 *
 * Freemium: Start Now, Brands, Brand Settings, Theme Styles, Platforms, Hotspots.
 * Premium: all routes in the dashboard router.
 *
 * Does not change nav styling — only toggles the `hidden` attribute.
 */
(function (global) {
  if (global.bbConsoleNavPlanInit) return;
  global.bbConsoleNavPlanInit = true;

  const FREEMIUM_ROUTE_IDS = new Set([
    "start",
    "brands",
    "brand-settings",
    "theme-design",
    "platforms",
    "hotspots",
  ]);

  const DEFAULT_ROUTE = "start";

  let navPremium = null;

  function isPremiumSubscription(subscription) {
    if (global.BBAccountPlan && typeof global.BBAccountPlan.isPremium === "function") {
      return global.BBAccountPlan.isPremium(subscription);
    }
    return false;
  }

  function readSubscription() {
    if (global.BBAccountPlan && typeof global.BBAccountPlan.readCachedSubscription === "function") {
      return global.BBAccountPlan.readCachedSubscription();
    }
    return null;
  }

  function isRouteAllowed(routeId, premium) {
    if (!routeId) return false;
    if (premium) return true;
    return FREEMIUM_ROUTE_IDS.has(routeId);
  }

  function resolveRoute(routeId) {
    const id = String(routeId || "").trim();
    if (navPremium === true) return id || DEFAULT_ROUTE;
    if (isRouteAllowed(id, false)) return id || DEFAULT_ROUTE;
    return DEFAULT_ROUTE;
  }

  function setNavItemVisible(el, visible) {
    if (!el) return;
    if (visible) el.removeAttribute("hidden");
    else el.setAttribute("hidden", "");
  }

  function applyConsoleNavPlan(isPremium) {
    navPremium = !!isPremium;
    const body = document.body;
    if (body) {
      body.classList.toggle("bb-freemium-mode", !navPremium);
      body.classList.toggle("bb-premium-mode", navPremium);
    }
    document.querySelectorAll("[data-route]").forEach(function (el) {
      const routeId = el.getAttribute("data-route");
      if (!routeId) return;
      setNavItemVisible(el, isRouteAllowed(routeId, navPremium));
    });
    try {
      global.dispatchEvent(
        new CustomEvent("bb-console-nav-plan-applied", {
          detail: { isPremium: navPremium },
        })
      );
    } catch (_e) { /* ignore */ }
  }

  function applyFromSubscription(subscription) {
    applyConsoleNavPlan(isPremiumSubscription(subscription));
  }

  function applyFromCache() {
    applyFromSubscription(readSubscription());
  }

  async function refreshConsoleNavPlan(options) {
    options = options || {};
    if (!global.BBAccountPlan || typeof global.BBAccountPlan.fetchAccountPlan !== "function") {
      applyFromCache();
      return { isPremium: navPremium === true };
    }
    try {
      const result = await global.BBAccountPlan.fetchAccountPlan({
        fromModules: false,
        silent: !!options.silent,
      });
      const sub = result && result.subscription;
      applyFromSubscription(sub);
      return { isPremium: navPremium === true, subscription: sub };
    } catch (_e) {
      applyFromCache();
      return { isPremium: navPremium === true };
    }
  }

  function isNavPremium() {
    return navPremium === true;
  }

  global.BBConsoleNavPlan = {
    FREEMIUM_ROUTE_IDS: FREEMIUM_ROUTE_IDS,
    DEFAULT_ROUTE: DEFAULT_ROUTE,
    isRouteAllowed: isRouteAllowed,
    resolveRoute: resolveRoute,
    isNavPremium: isNavPremium,
    applyConsoleNavPlan: applyConsoleNavPlan,
    applyFromSubscription: applyFromSubscription,
    applyFromCache: applyFromCache,
    refreshConsoleNavPlan: refreshConsoleNavPlan,
  };

  function bind() {
    applyFromCache();
    global.addEventListener("bb-account-plan-updated", applyFromCache);
    refreshConsoleNavPlan({ silent: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind, { once: true });
  } else {
    bind();
  }
})(typeof window !== "undefined" ? window : globalThis);
