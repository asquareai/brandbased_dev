/**
 * Brand Console — dashboard router.
 *
 * Wires every sidebar / mobile-footer nav item with [data-route] to a
 * matching module HTML page that loads into the #bbDashFrame iframe
 * inside .content-block. While the iframe is loading we show the
 * blurred glass overlay (.bb-dash-loader) with the B icon + sweep
 * line, then hide it on the iframe's `load` event.
 *
 * Deep links: ?page=<route-id> on the dashboard URL preselects a
 * module on initial load. Default route is `start` (Start Now).
 */
(function () {
  if (window.bbDashRouterInit) return;
  window.bbDashRouterInit = true;

  /* Module URLs are written relative to the dashboard HTML file
     (brand-console-final/brand-console-dashboard.html). */
  const ROUTES = {
    start: {
      url: "../brand-modules-bundle/start-now/Start-Now.html",
      title: "Start Now",
    },
    brands: {
      url: "../brand-modules-bundle/brands/Brands.html",
      title: "Brands",
    },
    "brand-settings": {
      url: "../brand-modules-bundle/Brand-Settings-Module.html",
      title: "Brand Settings",
    },
    "theme-design": {
      url: "../brand-modules-bundle/Brand-Theme-Settings-Module.html",
      title: "Theme Styles",
    },
    products: {
      url: "../brand-modules-bundle/products/Products.html",
      title: "Products",
    },
    scheduling: {
      url: "../brand-modules-bundle/Product-Scheduling-Module.html",
      title: "Scheduling",
    },
    payments: {
      url: "../brand-modules-bundle/payments/Payments.html",
      title: "Payments",
    },
    platforms: {
      url: "../brand-modules-bundle/platforms/Platforms.html",
      title: "Platforms",
    },
    hotspots: {
      url: "../brand-modules-bundle/hotspots/Hotspots.html",
      title: "Hotspots",
    },
    "ai-logic": {
      url: "../brand-modules-bundle/ai-logic/AI-Logic.html",
      title: "AI Logic",
    },
    campaigns: {
      url: "../brand-modules-bundle/ad-campaigns/Ad-Campaigns.html",
      title: "Campaigns",
    },
    metrics: {
      url: "../brand-modules-bundle/metrics/Metrics.html",
      title: "Metrics",
    },
  };

  const DEFAULT_ROUTE = "start";

  /* Minimum time the blurred glass loader stays visible after a nav,
     so the user actually gets to see the breathing B + sweep line on
     fast local file:// loads. The iframe `load` event still controls
     when we *can* hide it — this is just a floor.
     Combined with the +280ms trailing fade after the iframe load
     fires, the perceived nav floor is ~800ms. */
  const MIN_LOADER_MS = 520;

  /* CSS injected into every loaded module so its page background, page
     "shards" decoration and native scrollbars disappear — the dashboard
     already provides those — without having to edit each module file.

     Selectors include `body[class]` so they tie the specificity of
     module CSS rules like `body.bb-start-now-page { background: … }`
     (which beat plain `body` selectors). Because this stylesheet is
     appended last in the cascade, an equal-specificity tie resolves
     in its favour and dark-mode page backgrounds collapse cleanly. */
  const EMBEDDED_CSS = [
    "html, html body, body, body[class] {",
    "  background: transparent !important;",
    "  background-color: transparent !important;",
    "  background-image: none !important;",
    "}",
    "html .bb-theme-shell, html .bb-theme-shell--root,",
    "body .bb-theme-shell, body .bb-theme-shell--root {",
    "  background: transparent !important;",
    "  background-color: transparent !important;",
    "  background-image: none !important;",
    "}",
    "html, body { scrollbar-width: none !important; }",
    "html::-webkit-scrollbar, body::-webkit-scrollbar {",
    "  width: 0 !important;",
    "  height: 0 !important;",
    "  display: none !important;",
    "}",
    /* All decorative bg layers used by the module pages. */
    ".light-shard-ui-base,",
    ".light-shard-ui-theme,",
    ".light-shard-ui-base *,",
    ".bb-bg-shards,",
    ".bb-bg-wash,",
    ".video-bg-content-header {",
    "  display: none !important;",
    "  visibility: hidden !important;",
    "  opacity: 0 !important;",
    "}",
    "html::before, html::after,",
    "body::before, body::after {",
    "  background: transparent !important;",
    "  background-color: transparent !important;",
    "  background-image: none !important;",
    "}",
    /* On mobile (≤1440px) the iframe's own page-level <h1> reads as
       redundant alongside the dashboard's #content-heading. Desktop
       keeps each module's <h1> visible by default. */
    "@media (max-width: 1440px) {",
    "  h1 { display: none !important; }",
    "}",
    /* On phone-sized screens the dashboard's `.content-block` runs
       nearly edge-to-edge, so any horizontal page padding the module
       sets just eats usable width. Zero left/right padding on the
       shared wrappers AND on html/body so the page content stretches
       the full iframe width. Vertical padding is preserved so headers
       and CTAs keep their breathing room. */
    "@media (max-width: 740px) {",
    "  html, body, body[class],",
    "  .bb-theme-shell,",
    "  .bb-theme-shell--root,",
    "  .bb-module-head,",
    "  .bb-startnow-main,",
    "  .bb-bts-layout,",
    "  .bb-plat-dash-layout {",
    "    padding-left: 0 !important;",
    "    padding-right: 0 !important;",
    "  }",
    "}",
  ].join("\n");

  function init() {
    const frame   = document.getElementById("bbDashFrame");
    const loader  = document.querySelector(".bb-dash-loader");
    if (!frame) return;

    let safetyTimer  = 0;
    let currentRoute = null;
    let loaderShownAt = 0;
    /* Freemium Hotspots arrives from the purple panel link inside
       Freemium-Theme-Styles via an in-iframe `window.location.href`
       navigation. That path is not bfcache-friendly for this page and
       it lands partway down the first time, so we force a one-shot
       reload of the iframe on arrival to reset scroll. Flag is
       cleared whenever we navigate to anything else. */
    let forcedFreemiumHotspotsReload = false;

    function showLoader() {
      /* `bb-dash-loading` on <body> drives both the overlay visibility
         (full-viewport blur) AND the iframe fade-out, so we never see
         the iframe's first paint behind the glass. The
         `.bb-dash-loader--show` class is kept on the loader element
         for any external selector that still expects it. */
      document.body && document.body.classList.add("bb-dash-loading");
      if (loader) loader.classList.add("bb-dash-loader--show");
      loaderShownAt = Date.now();
    }
    function hideLoader() {
      document.body && document.body.classList.remove("bb-dash-loading");
      if (loader) loader.classList.remove("bb-dash-loader--show");
    }

    /* `_shared/sync-popup.js` always appends its backdrop to
       `document.body`. The dashboard's `.screen` div is `position:
       fixed` and therefore forms its own stacking context, so chrome
       (which lives INSIDE `.screen` at z-index 100001) only competes
       with siblings inside that context. A popup landing in `<body>`
       is a sibling of `.screen` (z-index auto) and paints above the
       whole stacking context regardless of its own z-index.

       Solution mirrors what we already do for the Loader: keep the
       popup inside `.screen` so chrome paints above it. We move the
       most-recently appended `.bb-sync-popup-backdrop` immediately
       after `bbShowSyncPopup` returns (the helper appends
       synchronously, so the node is already in the DOM here). The
       move happens before the next paint, so there's no visible
       flicker. */
    function relocateLatestSyncPopupIntoScreen() {
      try {
        const screen = document.querySelector(".screen");
        if (!screen) return;
        const backdrops = document.body.querySelectorAll(":scope > .bb-sync-popup-backdrop");
        if (!backdrops.length) return;
        const latest = backdrops[backdrops.length - 1];
        if (latest && !screen.contains(latest)) {
          screen.appendChild(latest);
        }
      } catch (_e) { /* ignore */ }
    }

    /* Reset the iframe's own document scroll so internal link
       navigations (purple CTA buttons like
       `<a class="bb-bts-cta-btn" href="../platforms/Platforms.html">`)
       start at the top of the new page. Cross-origin throws — ignore. */
    function resetIframeDocumentScroll() {
      try {
        if (frame.contentWindow && typeof frame.contentWindow.scrollTo === "function") {
          frame.contentWindow.scrollTo(0, 0);
        }
        const idoc = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
        if (idoc) {
          if (idoc.scrollingElement) idoc.scrollingElement.scrollTop = 0;
          if (idoc.documentElement) idoc.documentElement.scrollTop = 0;
          if (idoc.body) idoc.body.scrollTop = 0;
        }
      } catch (_e) { /* cross-origin: ignore */ }
    }

    /* Theme Styles + Products have a desktop "fixed page, inner-panel
       scroll" layout (`.bb-bts-left` is the scrollport, `html`/`body`
       are overflow:hidden). In-iframe navigations and bfcache restores
       can leave those pages painting partway down the first time, and
       only a full browser refresh clears it. So instead of fighting the
       inner scroll state, we hard-reload the whole dashboard at
       `?page=<id>` for these two routes — equivalent to the manual
       refresh the user was already doing. */
    function isHardRefreshRoute(routeId) {
      return routeId === "theme-design" || routeId === "products";
    }

    function hardRefreshToRoute(routeId) {
      try {
        const q = new URL(window.location.href);
        q.searchParams.set("page", routeId);
        const target = q.toString();
        /* Same-URL clicks (re-clicking the active nav item) need an
           explicit `reload()` because `assign()` of the current URL is
           a no-op in some browsers. */
        if (target === window.location.href) {
          window.location.reload();
        } else {
          window.location.assign(target);
        }
      } catch (_e) {
        try { window.location.reload(); } catch (_e2) { /* ignore */ }
      }
    }

    function applyEmbeddedStyles() {
      /* Same-origin only — file:// → file:// and http://host → same
         host both work; cross-origin throws and we silently skip. */
      let doc;
      try { doc = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document); }
      catch (_e) { return false; }
      if (!doc || !doc.documentElement) return false;

      let style = doc.getElementById("bb-dash-embedded-style");
      if (!style) {
        style = doc.createElement("style");
        style.id = "bb-dash-embedded-style";
        (doc.head || doc.documentElement).appendChild(style);
      }
      style.textContent = EMBEDDED_CSS;

      /* Hard-remove the decorative shard layer used by every module
         so it can't paint at all (CSS-hiding it would still leave a
         brief flash before our stylesheet attaches). */
      try {
        const drop = doc.querySelectorAll(
          ".light-shard-ui-base, .bb-bg-shards, .bb-bg-wash, .video-bg-content-header"
        );
        drop.forEach(function (el) {
          if (el && el.parentNode) el.parentNode.removeChild(el);
        });
      } catch (_e) { /* ignore */ }

      return true;
    }

    /* Inject styles as early as we can — without waiting for `load`,
       so the shards never get a chance to flash. We poll the iframe
       with rAF until it has a parseable document, then keep applying
       through the full load lifecycle (HTML stream → DOMContentLoaded
       → load) so any late-loaded module CSS still gets overridden. */
    let earlyInjectAbort = false;
    function startEarlyStyleInjection() {
      earlyInjectAbort = false;
      const startedAt = Date.now();
      function tick() {
        if (earlyInjectAbort) return;
        let doc = null;
        try { doc = frame.contentDocument; } catch (_e) { return; }
        if (doc && doc.documentElement && (doc.head || doc.body)) {
          applyEmbeddedStyles();
        }
        if (Date.now() - startedAt < 6000) {
          window.requestAnimationFrame(tick);
        }
      }
      window.requestAnimationFrame(tick);
    }

    function setActive(routeId) {
      const targets = document.querySelectorAll("[data-route]");
      targets.forEach(function (el) {
        el.classList.toggle("is-active", el.getAttribute("data-route") === routeId);
      });
    }

    /* Build a tail-match table for reverse-lookup (iframe path → route
       id). Each entry is the absolute pathname of the route's URL,
       resolved against the dashboard's own URL. Used when the iframe
       navigates internally (link click inside a module page) and
       postMessages us its new location. */
    const ROUTE_PATHS = (function () {
      const map = [];
      for (const id in ROUTES) {
        try {
          const abs = new URL(ROUTES[id].url, window.location.href).pathname;
          map.push({ id: id, path: abs.toLowerCase() });
        } catch (_e) { /* ignore */ }
      }
      return map;
    })();

    /* Sub-flow → parent-route aliases. Pages inside the module bundle
       that are NOT directly in the sidebar but conceptually belong to
       one of the sidebar sections (e.g. Logo Upload + Meta Verification
       are the "Add new brand" flow under Brands). When the iframe lands
       on one of these, we light up the parent route so the sidebar
       still gives the user a "you are here" cue.

       Match is by last 1-2 path segments, case-insensitive. */
    const ROUTE_ALIASES = [
      { tail: "logo-upload/logo-upload-and-crop-module.html",            id: "brands" },
      { tail: "logo-upload/meta-verification.html",                      id: "brands" },
      { tail: "freemium/freemium-logo-upload-and-crop-module.html",      id: "brands" },
      { tail: "freemium/freemium-meta-verification.html",                id: "brands" },
      { tail: "freemium/freemium-brand-settings.html",                   id: "brand-settings" },
      { tail: "freemium/freemium-theme-styles.html",                     id: "theme-design" },
      { tail: "freemium/freemium-hotspots.html",                         id: "hotspots" },
      { tail: "admin-team-console-brand-settings-ai-rules.html",         id: "ai-logic" },
    ];

    /* ----------------------------------------------------------------
       Dashboard heading + header video visibility
       ----------------------------------------------------------------
       The dashboard's #content-heading + .video-bg-content-header now
       only show on the Start Now page (and only on desktop / >1440px
       there — Start Now keeps its mobile-collapsed chrome). Every
       other route, including Brands and any /logo-upload/* sub-flow,
       hides them at every viewport size.

       Driven by the route id we already track in `currentRoute`, which
       includes alias resolution for sub-flows like Logo Upload / Meta
       Verification. Falls back to the path when no id is known yet. */
    function dashContentHeaderModeForRouteId(routeId) {
      if (routeId === "start") return "mobile";
      return "always";
    }

    function dashContentHeaderModeForPath(path) {
      const p = String(path || "").replace(/\\/g, "/").toLowerCase();
      if (!p) return "always";
      if (p.endsWith("/start-now/start-now.html")) return "mobile";
      return "always";
    }

    function setDashContentHeaderMode(mode) {
      try {
        if (!document.body) return;
        document.body.classList.toggle("bb-dash-hide-content-header", mode === "always");
        document.body.classList.toggle("bb-dash-hide-content-header-mobile", mode === "mobile");
      } catch (_e) { /* ignore */ }
    }

    function applyDashContentHeaderChromeForRouteId(routeId) {
      setDashContentHeaderMode(dashContentHeaderModeForRouteId(routeId));
    }

    function applyDashContentHeaderChromeFromPath(path) {
      setDashContentHeaderMode(dashContentHeaderModeForPath(path));
    }

    function getIframePathForChrome() {
      try {
        const cw = frame.contentWindow;
        if (cw && cw.location && cw.location.pathname) {
          return cw.location.pathname + (cw.location.search || "");
        }
      } catch (_e) { /* cross-origin */ }
      try {
        const u = new URL(frame.src, window.location.href);
        return u.pathname + u.search;
      } catch (_e2) {
        return "";
      }
    }

    function syncDashContentHeaderChrome() {
      /* Prefer the resolved route id (covers aliases like Logo Upload
         + Meta Verification → "brands"); fall back to the raw iframe
         path if we couldn't resolve one. */
      if (currentRoute) {
        applyDashContentHeaderChromeForRouteId(currentRoute);
        return;
      }
      const path = getIframePathForChrome();
      const aliasRouteId = findRouteByPath(path);
      if (aliasRouteId) {
        applyDashContentHeaderChromeForRouteId(aliasRouteId);
        return;
      }
      applyDashContentHeaderChromeFromPath(path);
    }

    function findRouteByPath(path) {
      if (!path) return null;
      const needle = String(path).toLowerCase();
      /* 1. Exact pathname match (same-origin / clean URL case). */
      for (let i = 0; i < ROUTE_PATHS.length; i++) {
        if (ROUTE_PATHS[i].path === needle) return ROUTE_PATHS[i].id;
      }
      /* 2. Endswith of the route's own 2-segment tail. Covers file://
         where pathname may carry an OS-specific prefix the dashboard
         URL doesn't, and host/port differences in dev vs prod. */
      for (let i = 0; i < ROUTE_PATHS.length; i++) {
        const tail = ROUTE_PATHS[i].path.split("/").slice(-2).join("/");
        if (tail && needle.endsWith(tail)) return ROUTE_PATHS[i].id;
      }
      /* 3. Sub-flow alias — page is not in ROUTES but belongs to a
         section (e.g. Logo Upload → Brands). */
      for (let i = 0; i < ROUTE_ALIASES.length; i++) {
        if (needle.endsWith(ROUTE_ALIASES[i].tail)) return ROUTE_ALIASES[i].id;
      }
      return null;
    }

    /* Sync UI state to a route the iframe just announced via
       postMessage — does NOT re-navigate the iframe (it already is
       at the right URL). Pages that aren't in ROUTES (sub-flows like
       Meta-Verification, Logo-Upload as a "create brand" step) leave
       the previously active sidebar item highlighted, which reads as
       "you're still in this section". */
    function syncToIframeRoute(path, href) {
      const p = path || "";
      const routeId = findRouteByPath(p);
      if (routeId) {
        applyDashContentHeaderChromeForRouteId(routeId);
      } else {
        applyDashContentHeaderChromeFromPath(p);
      }

      /* Freemium Hotspots one-shot reload: when the iframe lands on
         Freemium-Hotspots.html (typically via the purple "Enable
         Hotspots" CTA in Freemium-Theme-Styles), force the iframe to
         reload once so the page paints from the top instead of from
         a stale inner-scroll offset. The flag is cleared the first
         time we sync to *anything else*, so the next visit reloads
         again. */
      const isFreemiumHotspotsLanding =
        /\/freemium\/freemium-hotspots\.html/i.test(p);
      if (isFreemiumHotspotsLanding) {
        if (!forcedFreemiumHotspotsReload) {
          forcedFreemiumHotspotsReload = true;
          showLoader();
          /* Reload the iframe at its *current* document URL — NOT
             `frame.src`, which still reflects the last URL the
             dashboard programmatically assigned (usually Start Now or
             whatever the user clicked from the sidebar). Source of
             truth, in order of preference:
               1. data.href from the page's own bb-dash-route message
               2. frame.contentWindow.location.href (same-origin only)
               3. reload() — bare in-place reload, no URL needed
             Fallback 3 is safe even cross-origin. */
          let target = String(href || "");
          if (!target) {
            try { target = frame.contentWindow.location.href || ""; }
            catch (_e) { target = ""; }
          }
          if (target) {
            try { frame.src = target; return; } catch (_e) { /* ignore */ }
          }
          try {
            frame.contentWindow.location.reload();
          } catch (_e) { /* cross-origin reload not permitted — give up
                            silently rather than jumping to a stale src */ }
          return;
        }
      } else {
        forcedFreemiumHotspotsReload = false;
      }

      if (!routeId) return;
      if (currentRoute === routeId) return;
      /* Purple-button nav into Theme Styles or Products: do a full
         dashboard refresh at `?page=<id>` so the page lands at the top
         the same way a manual browser refresh does.

         Skip the hard refresh when the iframe just landed on a freemium
         variant of the page — hard refresh would re-resolve `?page=<id>`
         through ROUTES, which points at the premium URL, and silently
         redirect the user out of the freemium flow back into the
         premium page. The freemium pages have their own scroll layout
         and don't need the hard-refresh fix the premium ones do. */
      const isFreemiumPath = /\/freemium\//i.test(p);
      if (isHardRefreshRoute(routeId) && !isFreemiumPath) {
        hardRefreshToRoute(routeId);
        return;
      }
      currentRoute = routeId;
      setActive(routeId);
      try {
        const q = new URL(window.location.href);
        q.searchParams.set("page", routeId);
        history.replaceState(null, "", q);
      } catch (_e) { /* ignore */ }
    }

    function navigate(routeId, opts) {
      opts = opts || {};
      const route = ROUTES[routeId];
      if (!route) return;

      const isSameRoute = (currentRoute === routeId);

      /* Sidebar / footer click into Theme Styles or Products: hard
         refresh the whole dashboard at `?page=<id>` instead of swapping
         the iframe in place. The boot path below (currentRoute === null)
         is exempt so the initial `?page=theme-design` deep link does NOT
         loop reload. Same-route re-clicks also funnel through here so
         clicking the active nav item refreshes those pages. */
      if (currentRoute !== null && isHardRefreshRoute(routeId)) {
        hardRefreshToRoute(routeId);
        return;
      }
      currentRoute = routeId;

      setActive(routeId);
      showLoader();

      try {
        if (isSameRoute && !opts.force) {
          /* Re-clicking the active nav item: reload the iframe content
             so the page returns to its default state, exactly like a
             manual reload. `contentWindow.location.reload()` works in
             same-origin contexts; fall back to reassigning `src` for
             cross-origin or detached frames. */
          try {
            frame.contentWindow.location.reload();
          } catch (_e1) {
            frame.src = route.url;
          }
        } else {
          frame.src = route.url;
        }
      } catch (_e) { /* ignore */ }

      applyDashContentHeaderChromeForRouteId(routeId);

      /* Begin polling the iframe document so we can strip the module's
         backgrounds + shards before they get a chance to paint. */
      startEarlyStyleInjection();

      if (!opts.suppressHistory) {
        try {
          const q = new URL(window.location.href);
          q.searchParams.set("page", routeId);
          history.replaceState(null, "", q);
        } catch (_e) { /* ignore */ }
      }

      /* Safety net — if the iframe never fires `load` (file not found,
         CSP block etc.) we don't want the loader to stay up forever. */
      window.clearTimeout(safetyTimer);
      safetyTimer = window.setTimeout(hideLoader, 9000);

      /* Close the mobile slide-up nav if it's currently open. */
      const footerNav  = document.querySelector(".mobile-footer-nav");
      const closeBtn   = document.querySelector(".close-mobile-nav");
      if (footerNav && footerNav.classList.contains("active")) {
        footerNav.classList.remove("active");
        if (closeBtn) closeBtn.classList.add("minus");
      }
    }

    frame.addEventListener("load", function () {
      window.clearTimeout(safetyTimer);

      /* Reset the iframe document scroll for normal in-iframe link
         navigations (purple buttons that land on routes other than
         Theme Styles + Products, which take the hard-refresh path). */
      resetIframeDocumentScroll();

      /* One last sweep to strip backgrounds + shards in case anything
         was added late in the module's startup. The rAF poller stops
         on its own after 6 s; we leave it running through `load` so
         late style sheets get overridden too. */
      applyEmbeddedStyles();

      syncDashContentHeaderChrome();

      /* Enforce a minimum visible time for the loader so the breathing
         B + sweep line actually get to play through, even when the
         module loads in <100 ms off disk. */
      const elapsed   = Date.now() - loaderShownAt;
      const remaining = Math.max(0, MIN_LOADER_MS - elapsed);
      window.setTimeout(function () {
        hideLoader();
        earlyInjectAbort = true;
      }, remaining + 280);
    });

    /* Cross-frame nav protocol — module pages running inside the
       iframe postMessage to us at two points in their lifecycle:
         "bb-dash-nav-start"  → fires from `pagehide` just before the
                                iframe navigates away. We pop the
                                loader so the in-between flash is
                                covered, exactly like a sidebar click.
         "bb-dash-route"      → fires from the new page's
                                `DOMContentLoaded`. We reverse-lookup
                                the route id from the URL and update
                                sidebar / heading / ?page= to match.
       Works in same-origin (HTTPS prod) and cross-origin (file://)
       environments alike. */
    window.addEventListener("message", function (e) {
      const data = e && e.data;
      if (!data || typeof data !== "object") return;
      /* Only act on messages from our own iframe. e.source is the
         iframe's contentWindow on modern browsers; fall back to
         loose-trust for older ones. */
      if (e.source && frame && frame.contentWindow && e.source !== frame.contentWindow) {
        return;
      }
      if (data.type === "bb-dash-nav-start") {
        /* Heading + video: show host chrome while the next page loads so
           we never keep the previous route's hide state during the swap. */
        applyDashContentHeaderChromeFromPath("");
        showLoader();
        window.clearTimeout(safetyTimer);
        safetyTimer = window.setTimeout(hideLoader, 9000);
        return;
      }
      if (data.type === "bb-dash-route") {
        syncToIframeRoute(data.path || data.href || "", data.href || "");
        return;
      }
      /* Sync / Publish / Verify popups — module pages inside the
         iframe forward their bbShowSyncPopup() calls to us so the
         popup renders at the dashboard level. We call our own
         bbShowSyncPopup (loaded from _shared/sync-popup.js in the
         dashboard) and postMessage a "done" reply back to the iframe
         so its `then(...)` callbacks (navigations, button state
         resets etc.) still fire.

         IMPORTANT — chrome layering: dashboard chrome (.header-nav,
         .nav-container, .mobile-footer-nav, .footer-bar-brand-console)
         all live INSIDE the `.screen` div. Since `.screen` is
         position:fixed it forms its own stacking context, so chrome's
         z-index only competes with other elements inside `.screen`
         (which is why the Loader — also nested in `.screen` — paints
         correctly under chrome). The shared sync-popup helper
         appends to `document.body` by default, which lands the popup
         OUTSIDE that stacking context and lets it cover chrome. We
         re-parent the popup into `.screen` so it shares the chrome's
         stacking context and the chrome paints above the popup blur
         — exactly the same way the Loading screen behaves. */
      if (data.type === "bb-dash-sync-popup") {
        if (typeof window.bbShowSyncPopup !== "function") return;
        const id = data.id;
        const opts = Object.assign({}, data.opts || {});
        /* Iframe's relative logoSrc may not resolve from the dashboard
           document; fall back to the dashboard's own B icon. */
        if (!opts.logoSrc) {
          opts.logoSrc = "./images/b-white.svg";
        }
        const source = e.source;
        const result = window.bbShowSyncPopup(opts);
        relocateLatestSyncPopupIntoScreen();
        result.then(function () {
          try {
            if (source) source.postMessage({
              type: "bb-dash-sync-popup-done",
              id: id
            }, "*");
          } catch (_e) { /* ignore */ }
        });
        return;
      }

      /* Confirm popup forwarded up from an iframe. Render at the
         dashboard level so its blur covers chrome + iframe (just
         like sync/publish popups), then post the user's choice
         back to the source frame. */
      if (data.type === "bb-dash-confirm-popup") {
        if (typeof window.bbShowConfirmPopup !== "function") return;
        const id = data.id;
        const opts = Object.assign({}, data.opts || {});
        const source = e.source;
        const result = window.bbShowConfirmPopup(opts);
        relocateLatestSyncPopupIntoScreen();
        result.then(function (confirmed) {
          try {
            if (source) source.postMessage({
              type: "bb-dash-confirm-popup-done",
              id: id,
              result: !!confirmed
            }, "*");
          } catch (_e) { /* ignore */ }
        });
        return;
      } else if (data.type === "bb-dash-metrics-insight-close") {
        try {
          document.querySelectorAll(".bb-metrics-insight-host").forEach(function (el) {
            try { el.remove(); } catch (_r) { /* ignore */ }
          });
        } catch (_e2) { /* ignore */ }
        return;
      } else if (data.type === "bb-dash-metrics-insight") {
        try {
          document.querySelectorAll(".bb-metrics-insight-host").forEach(function (el) {
            try { el.remove(); } catch (_r2) { /* ignore */ }
          });
        } catch (_e3) { /* ignore */ }
        const wrap = document.createElement("div");
        wrap.innerHTML = String(data.html || "").trim();
        const backdrop = wrap.firstElementChild;
        if (!backdrop || !backdrop.classList.contains("bb-sync-popup-backdrop")) return;
        if (!backdrop.classList.contains("bb-metrics-insight-host")) {
          backdrop.classList.add("bb-metrics-insight-host");
        }
        document.body.appendChild(backdrop);
        relocateLatestSyncPopupIntoScreen();
        function closeInsight() {
          backdrop.classList.remove("bb-sync-popup-backdrop--show");
          if (backdrop._bbInsightEsc) {
            document.removeEventListener("keydown", backdrop._bbInsightEsc, true);
            backdrop._bbInsightEsc = null;
          }
          window.setTimeout(function () {
            try { backdrop.remove(); } catch (_x) { /* ignore */ }
          }, 220);
        }
        function onInsightEsc(ev) {
          if (ev.key === "Escape") closeInsight();
        }
        backdrop._bbInsightEsc = onInsightEsc;
        document.addEventListener("keydown", onInsightEsc, true);
        backdrop.addEventListener("click", function (ev) {
          if (ev.target === backdrop) closeInsight();
        });
        const insightClose = backdrop.querySelector(".bb-metrics-insight-close");
        if (insightClose) insightClose.addEventListener("click", closeInsight);
        const insightCard = backdrop.querySelector(".bb-sync-popup");
        if (insightCard) {
          insightCard.addEventListener("click", function (ev) {
            ev.stopPropagation();
          });
        }
        window.requestAnimationFrame(function () {
          backdrop.classList.add("bb-sync-popup-backdrop--show");
        });
        return;
      }
    });

    /* Wire every clickable element that opts in via data-route.
       This covers the desktop sidebar (.nav-item) and the mobile
       slide-up footer (.footer-item). */
    document.querySelectorAll("[data-route]").forEach(function (el) {
      el.style.cursor = "pointer";
      el.addEventListener("click", function (e) {
        const id = el.getAttribute("data-route");
        if (!id || !ROUTES[id]) return;
        if (e && typeof e.preventDefault === "function") e.preventDefault();
        navigate(id);
      });
    });

    /* First load — preselect from ?page= or default to Start Now. */
    let firstId = DEFAULT_ROUTE;
    try {
      const params = new URLSearchParams(window.location.search);
      const requested = params.get("page");
      if (requested && ROUTES[requested]) firstId = requested;
    } catch (_e) { /* ignore */ }

    navigate(firstId, { suppressHistory: true, force: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
