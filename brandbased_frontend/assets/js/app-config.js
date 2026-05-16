/**
 * BrandBased front-end routes and API base URL.
 * All paths are relative to the brandbased_frontend root.
 */
(function (global) {
  global.BB_APP = {
    apiBaseUrl: "http://127.0.0.1:8000/api",
    routes: {
      login: "index.html",
      landing: "landing.html",
      signout: "signout.html",
      console: "brand-console-final/brand-console-dashboard.html",
    },
    signoutFromConsole: "../signout.html",
    signoutFromAdminConsole: "../../signout.html",
  };
})(typeof window !== "undefined" ? window : globalThis);
