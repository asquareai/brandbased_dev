/**
 * Account plan / subscription helpers (freemium vs premium).
 * Requires auth_token and BB_APP.apiBaseUrl.
 */
(function (global) {
  const LS_PLAN = "plan_type";
  const LS_SUBSCRIPTION = "bbAccountSubscription";

  function routes() {
    const r = (global.BB_APP && global.BB_APP.routes) || {};
    return {
      login: r.login || "index.html",
      landing: r.landing || "landing.html",
      subscription: r.subscription || "premium-subscription.html",
      startNow: r.startNow || "brand-modules-bundle/start-now/Start-Now.html",
      freemiumBrandCreate:
        r.freemiumBrandCreate ||
        "brand-modules-bundle/freemium/Freemium-Logo-upload-and-Crop-module.html",
      premiumBrandCreate:
        r.premiumBrandCreate ||
        "brand-modules-bundle/logo-upload/Logo-upload-and-Crop-module.html",
      console: r.console || "brand-console-final/brand-console-dashboard.html",
    };
  }

  function moduleRoutes() {
    const r = routes();
    return {
      login: r.loginFromModules || "../../index.html",
      landing: "../../landing.html",
      subscription: "../../premium-subscription.html",
      startNow: "../start-now/Start-Now.html",
      freemiumBrandCreate:
        "../freemium/Freemium-Logo-upload-and-Crop-module.html",
      premiumBrandCreate: "../logo-upload/Logo-upload-and-Crop-module.html",
      console: "../../brand-console-final/brand-console-dashboard.html",
    };
  }

  function resolveRoutes(fromModules) {
    return fromModules ? moduleRoutes() : routes();
  }

  function persistSubscription(subscription) {
    if (!subscription || typeof subscription !== "object") return;
    try {
      if (subscription.plan_type) {
        global.localStorage.setItem(LS_PLAN, subscription.plan_type);
      }
      global.localStorage.setItem(LS_SUBSCRIPTION, JSON.stringify(subscription));
      try {
        global.dispatchEvent(new CustomEvent("bb-account-plan-updated"));
      } catch (_e2) { /* ignore */ }
    } catch (_e) { /* ignore */ }
  }

  function clearSubscriptionCache() {
    try {
      global.localStorage.removeItem(LS_PLAN);
      global.localStorage.removeItem(LS_SUBSCRIPTION);
    } catch (_e) { /* ignore */ }
  }

  function readCachedSubscription() {
    try {
      const raw = global.localStorage.getItem(LS_SUBSCRIPTION);
      if (raw) return JSON.parse(raw);
    } catch (_e) { /* ignore */ }
    const plan = global.localStorage.getItem(LS_PLAN);
    if (plan) {
      return {
        plan_type: plan,
        is_premium: plan === "premium",
      };
    }
    return null;
  }

  /** True only when the API reports an active paid Premium subscription. */
  function isPremium(subscription) {
    const sub = subscription || readCachedSubscription();
    if (!sub) return false;
    const ap = sub.active_premium;
    if (ap && (ap.id || ap.starts_at)) return true;
    return false;
  }

  function brandCreateUrl(tier, fromModules, fresh) {
    const r = resolveRoutes(fromModules);
    const base =
      tier === "premium" ? r.premiumBrandCreate : r.freemiumBrandCreate;
    const q = fresh === false ? "" : (base.indexOf("?") >= 0 ? "&" : "?") + "fresh=1";
    return base + (fresh === false ? "" : q);
  }

  function subscriptionUrl(fromModules) {
    return resolveRoutes(fromModules).subscription;
  }

  async function startPremiumCheckout(options) {
    options = options || {};
    const fromModules = !!options.fromModules;
    if (!global.localStorage.getItem("auth_token")) {
      global.location.href = resolveRoutes(fromModules).login;
      return;
    }
    if (global.BBStripeBilling && global.BBStripeBilling.startPremiumCheckout) {
      try {
        return await global.BBStripeBilling.startPremiumCheckout();
      } catch (err) {
        if (err && err.alreadyPremium) {
          navigateToPremiumBrandCreate(fromModules, true);
          return { alreadyPremium: true };
        }
        console.error(err);
        const msg = (err && err.message) || "Unable to open Stripe checkout.";
        if (/already have an active Premium/i.test(msg)) {
          navigateToPremiumBrandCreate(fromModules, true);
          return { alreadyPremium: true };
        }
        if (typeof global.bbShowSyncPopup === "function") {
          global.bbShowSyncPopup({
            label: msg,
            doneLabel: msg,
            duration: 2200,
          });
        } else {
          global.alert(msg);
        }
        throw err;
      }
    }
    throw new Error("Stripe billing is not loaded on this page.");
  }

  async function fetchAccountPlan(options) {
    options = options || {};
    const token = global.localStorage.getItem("auth_token");
    if (!token) {
      if (!options.silent) {
        global.location.href = resolveRoutes(options.fromModules).login;
      }
      return null;
    }

    const apiBase =
      (global.BB_APP && global.BB_APP.apiBaseUrl) ||
      "https://api.brandbased.ai/api";

    const response = await fetch(apiBase + "/auth/me", {
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/json",
      },
    });

    let data = {};
    try {
      data = await response.json();
    } catch (_e) {
      data = {};
    }

    if (!response.ok || !data.status) {
      if (!options.silent) {
        try {
          global.localStorage.removeItem("auth_token");
          clearSubscriptionCache();
        } catch (_e2) { /* ignore */ }
        global.location.href = resolveRoutes(options.fromModules).login;
      }
      return null;
    }

    if (data.subscription) {
      persistSubscription(data.subscription);
    } else if (data.account && data.account.plan_type) {
      persistSubscription({
        plan_type: data.account.plan_type,
        is_premium: false,
        active_premium: null,
      });
    }

    return {
      account: data.account,
      subscription: data.subscription || readCachedSubscription(),
    };
  }

  function detectBrandTierFromPath() {
    const path = String(global.location.pathname || "").toLowerCase();
    if (path.indexOf("/freemium/") >= 0) return "freemium";
    if (path.indexOf("/logo-upload/") >= 0) return "premium";
    const params = new URLSearchParams(global.location.search || "");
    const tier = params.get("tier");
    if (tier === "premium" || tier === "freemium") return tier;
    return "freemium";
  }

  function navigateToPremiumBrandCreate(fromModules, fresh) {
    global.location.href = brandCreateUrl(
      "premium",
      !!fromModules,
      fresh !== false
    );
  }

  /**
   * Go Premium: active Premium → premium brand creation; otherwise → Stripe Checkout.
   */
  async function navigateGoPremium(options) {
    options = options || {};
    const fromModules = !!options.fromModules;

    const result = await fetchAccountPlan({ fromModules: fromModules, silent: true });
    const sub = result && result.subscription;

    if (sub && isPremium(sub)) {
      navigateToPremiumBrandCreate(fromModules, options.fresh);
      return { alreadyPremium: true };
    }

    return startPremiumCheckout({ fromModules: fromModules });
  }

  function subscriptionMenuLabel(subscription) {
    return isPremium(subscription) ? "Manage Subscription" : "Go Premium";
  }

  async function openManageSubscription(options) {
    options = options || {};
    const fromModules = !!options.fromModules;
    if (!global.localStorage.getItem("auth_token")) {
      global.location.href = resolveRoutes(fromModules).login;
      return;
    }
    if (global.BBStripeBilling && global.BBStripeBilling.openBillingPortal) {
      try {
        return await global.BBStripeBilling.openBillingPortal();
      } catch (err) {
        console.error(err);
        const msg = (err && err.message) || "Unable to open billing portal.";
        if (typeof global.bbShowSyncPopup === "function") {
          global.bbShowSyncPopup({ label: msg, doneLabel: msg, duration: 2200 });
        } else {
          global.alert(msg);
        }
        throw err;
      }
    }
    throw new Error("Stripe billing is not loaded on this page.");
  }

  /** Profile menu: Premium → billing portal; otherwise → Go Premium flow. */
  async function handleSubscriptionMenuAction(options) {
    options = options || {};
    const fromModules = !!options.fromModules;
    const result = await fetchAccountPlan({ fromModules: fromModules, silent: true });
    const sub = result && result.subscription;
    if (sub && isPremium(sub)) {
      return openManageSubscription({ fromModules: fromModules });
    }
    return navigateGoPremium({ fromModules: fromModules });
  }

  function navigateStartFree(options) {
    options = options || {};
    global.location.href = brandCreateUrl(
      "freemium",
      !!options.fromModules,
      options.fresh !== false
    );
  }

  function bindTierCtaLinks(root, options) {
    options = options || {};
    const scope = root || global.document;
    const fromModules = !!options.fromModules;

    scope.querySelectorAll("[data-bb-tier-cta]").forEach(function (el) {
      if (el.__bbTierBound) return;
      el.__bbTierBound = true;
      el.addEventListener(
        "click",
        function (e) {
          const tier = el.getAttribute("data-bb-tier-cta");
          if (tier === "premium") {
            e.preventDefault();
            e.stopPropagation();
            navigateGoPremium({ fromModules: fromModules }).catch(function (err) {
              console.error(err);
            });
            return;
          }
          if (tier === "freemium") {
            e.preventDefault();
            navigateStartFree({ fromModules: fromModules });
          }
        },
        true
      );
    });
  }

  global.BBAccountPlan = {
    routes: routes,
    moduleRoutes: moduleRoutes,
    fetchAccountPlan: fetchAccountPlan,
    readCachedSubscription: readCachedSubscription,
    persistSubscription: persistSubscription,
    clearSubscriptionCache: clearSubscriptionCache,
    isPremium: isPremium,
    brandCreateUrl: brandCreateUrl,
    subscriptionUrl: subscriptionUrl,
    navigateGoPremium: navigateGoPremium,
    subscriptionMenuLabel: subscriptionMenuLabel,
    openManageSubscription: openManageSubscription,
    handleSubscriptionMenuAction: handleSubscriptionMenuAction,
    startPremiumCheckout: startPremiumCheckout,
    navigateStartFree: navigateStartFree,
    bindTierCtaLinks: bindTierCtaLinks,
    detectBrandTierFromPath: detectBrandTierFromPath,
  };
})(typeof window !== "undefined" ? window : globalThis);
