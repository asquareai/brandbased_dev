/**
 * BrandBased front-end — static UI only.
 *
 * USE_PRODUCTION_BACKEND = true  → local UI at :5500, API + Stripe webhooks on production.
 * USE_PRODUCTION_BACKEND = false → full local stack (API :8000, worker, smart-size :8001).
 */
(function (global) {
  /** Local frontend + production API (Stripe webhook → api.brandbased.ai) */
  const USE_PRODUCTION_BACKEND = false;

  const PRODUCTION_API = "https://api.brandbased.ai/api";
  const LOCAL_API = "http://127.0.0.1:8000/api";
  const PRODUCTION_SMART_SIZE = "https://api.brandbased.ai/smart";
  const LOCAL_SMART_SIZE = "http://127.0.0.1:8001";

  const host =
    typeof location !== "undefined" && location.hostname
      ? location.hostname
      : "";
  const isLocal =
    !host ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".local");

  const useProduction = USE_PRODUCTION_BACKEND || !isLocal;

  const API_BASE_URL = useProduction ? PRODUCTION_API : LOCAL_API;
  const SMART_SIZE_ORIGIN = useProduction ? PRODUCTION_SMART_SIZE : LOCAL_SMART_SIZE;

  const frontendOrigin =
    typeof location !== "undefined" && location.origin
      ? location.origin
      : "http://127.0.0.1:5500";

  global.BB_APP = {
    apiBaseUrl: API_BASE_URL,
    smartSizeOrigin: SMART_SIZE_ORIGIN,
    frontendOrigin: frontendOrigin,
    useProductionBackend: useProduction,
    syncPopupLogoSrc: "brand-modules-bundle/brandbased-logo.svg",
    brandRuntimeScriptUrl:
      "https://cdn.brandbased.ai/runtime/v1.js",
    isLocal: isLocal,
    routes: {
      login: "index.html",
      landing: "landing.html",
      signout: "signout.html",
      console: "brand-console-final/brand-console-dashboard.html",
      subscription: "premium-subscription.html",
      startNow: "brand-modules-bundle/start-now/Start-Now.html",
      freemiumBrandCreate:
        "brand-modules-bundle/freemium/Freemium-Logo-upload-and-Crop-module.html",
      premiumBrandCreate:
        "brand-modules-bundle/logo-upload/Logo-upload-and-Crop-module.html",
    },
    signoutFromConsole: "../signout.html",
    signoutFromAdminConsole: "../../signout.html",
    loginFromModules: "../../index.html",
  };
})(typeof window !== "undefined" ? window : globalThis);
