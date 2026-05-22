/**
 * BrandBased front-end — static UI only.
 *
 * UI-only / client handoff: set USE_PRODUCTION_BACKEND = true
 *   → localhost still calls live API + smart-size (no local Laravel/Python).
 *
 * Full local dev: USE_PRODUCTION_BACKEND = false + run API :8000, worker, :8001.
 */
(function (global) {
  /** Set true when sharing frontend-only zip for UI work against live backend */
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

  global.BB_APP = {
    apiBaseUrl: API_BASE_URL,
    smartSizeOrigin: SMART_SIZE_ORIGIN,
    brandRuntimeScriptUrl:
      "https://cdn.brandbased.ai/runtime/v1.js",
    isLocal: isLocal,
    routes: {
      login: "index.html",
      landing: "landing.html",
      signout: "signout.html",
      console: "brand-console-final/brand-console-dashboard.html",
    },
    signoutFromConsole: "../signout.html",
    signoutFromAdminConsole: "../../signout.html",
    loginFromModules: "../../index.html",
  };
})(typeof window !== "undefined" ? window : globalThis);
