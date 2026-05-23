/**
 * Stripe subscription checkout (BrandBased Premium).
 */
(function (global) {
  const LS_PORTAL_SNAPSHOT = "bbStripePortalSnapshot";

  function apiBase() {
    return (global.BB_APP && global.BB_APP.apiBaseUrl) || "https://api.brandbased.ai/api";
  }

  function authHeaders() {
    const token = global.localStorage.getItem("auth_token");
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (token) headers.Authorization = "Bearer " + token;
    return headers;
  }

  async function parseJson(response) {
    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch (_e) {
      return {};
    }
  }

  /** Brand Console dashboard with Start Now module (?page=start). */
  function dashboardStripeReturnUrl() {
    const origin =
      (global.BB_APP && global.BB_APP.frontendOrigin) ||
      (typeof location !== "undefined" ? location.origin : "http://127.0.0.1:5500");
    const path =
      (global.BB_APP && global.BB_APP.routes && global.BB_APP.routes.console) ||
      "brand-console-final/brand-console-dashboard.html";
    const url = new URL(String(path).replace(/^\//, ""), origin.replace(/\/$/, "") + "/");
    url.searchParams.set("page", "start");
    return url.href;
  }

  function frontendReturnUrls() {
    const base = dashboardStripeReturnUrl();
    const joiner = base.indexOf("?") >= 0 ? "&" : "?";
    return {
      success_url: base + joiner + "stripe=success",
      cancel_url: base + joiner + "stripe=cancel",
      portal_url: base + joiner + "stripe=portal",
    };
  }

  function cleanStripeQueryFromUrl() {
    try {
      const url = new URL(global.location.href);
      url.searchParams.delete("stripe");
      url.searchParams.delete("session_id");
      if (!url.searchParams.get("page")) {
        url.searchParams.set("page", "start");
      }
      const qs = url.searchParams.toString();
      global.history.replaceState(
        {},
        "",
        url.pathname + (qs ? "?" + qs : "")
      );
    } catch (_e) { /* ignore */ }
  }

  async function createCheckoutSession() {
    const urls = frontendReturnUrls();
    const response = await fetch(apiBase() + "/billing/checkout-session", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        success_url: urls.success_url,
        cancel_url: urls.cancel_url,
      }),
    });
    const data = await parseJson(response);
    if (!response.ok || !data.status) {
      const err = new Error(data.message || "Unable to start checkout.");
      if (
        response.status === 409 &&
        /already have an active Premium/i.test(String(data.message || ""))
      ) {
        err.alreadyPremium = true;
      }
      throw err;
    }
    return data;
  }

  async function createPortalSession() {
    const urls = frontendReturnUrls();
    const response = await fetch(apiBase() + "/billing/portal-session", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ return_url: urls.portal_url }),
    });
    const data = await parseJson(response);
    if (!response.ok || !data.status) {
      throw new Error(data.message || "Unable to open billing portal.");
    }
    return data;
  }

  async function syncCheckoutSession(sessionId) {
    const response = await fetch(apiBase() + "/billing/sync-checkout-session", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ session_id: sessionId }),
    });
    const data = await parseJson(response);
    if (!response.ok || !data.status) {
      throw new Error(data.message || "Unable to confirm subscription.");
    }
    if (data.subscription && global.BBAccountPlan) {
      global.BBAccountPlan.persistSubscription(data.subscription);
    }
    return data;
  }

  function isInIframe() {
    try {
      return global.self !== global.top;
    } catch (_e) {
      return true;
    }
  }

  /** Stripe cannot run in an iframe — redirect the parent (same tab). */
  function navigateToStripeUrl(url) {
    const target = isInIframe() ? global.top : global;
    target.location.href = url;
  }

  async function startPremiumCheckout() {
    const data = await createCheckoutSession();
    if (data.checkout_url) {
      navigateToStripeUrl(data.checkout_url);
      return data;
    }
    throw new Error("Checkout URL missing.");
  }

  function snapshotSubscription(sub) {
    const ap = sub && sub.active_premium;
    const isPremium = !!(ap && (ap.id || ap.starts_at));
    return {
      is_premium: isPremium,
      plan_type: (sub && sub.plan_type) || "freemium",
      stripe_status: ap && ap.stripe_status ? String(ap.stripe_status) : "",
      cancel_at_period_end: !!(ap && ap.cancel_at_period_end),
      ends_at: ap && ap.ends_at ? String(ap.ends_at) : "",
    };
  }

  function savePortalSnapshot() {
    try {
      const sub =
        global.BBAccountPlan && global.BBAccountPlan.readCachedSubscription
          ? global.BBAccountPlan.readCachedSubscription()
          : null;
      global.sessionStorage.setItem(
        LS_PORTAL_SNAPSHOT,
        JSON.stringify(snapshotSubscription(sub))
      );
    } catch (_e) { /* ignore */ }
  }

  function readPortalSnapshot() {
    try {
      const raw = global.sessionStorage.getItem(LS_PORTAL_SNAPSHOT);
      return raw ? JSON.parse(raw) : null;
    } catch (_e) {
      return null;
    }
  }

  function clearPortalSnapshot() {
    try {
      global.sessionStorage.removeItem(LS_PORTAL_SNAPSHOT);
    } catch (_e) { /* ignore */ }
  }

  function subscriptionSnapshotChanged(before, after) {
    if (!before || !after) return false;
    return (
      before.is_premium !== after.is_premium ||
      before.plan_type !== after.plan_type ||
      before.stripe_status !== after.stripe_status ||
      before.cancel_at_period_end !== after.cancel_at_period_end ||
      before.ends_at !== after.ends_at
    );
  }

  function portalChangeMessage(before, after) {
    if (!after.is_premium && before.is_premium) {
      return "Your Premium subscription has ended.";
    }
    if (after.is_premium && !before.is_premium) {
      return "Payment received — Premium is now active.";
    }
    if (after.cancel_at_period_end && !before.cancel_at_period_end) {
      return "Premium will cancel at the end of your billing period.";
    }
    if (!after.cancel_at_period_end && before.cancel_at_period_end) {
      return "Premium subscription renewed — billing will continue.";
    }
    if (after.stripe_status === "past_due") {
      return "Payment issue — update your billing in Stripe.";
    }
    return "Your subscription was updated.";
  }

  async function openBillingPortal() {
    savePortalSnapshot();
    const data = await createPortalSession();
    if (data.portal_url) {
      navigateToStripeUrl(data.portal_url);
      return data;
    }
    throw new Error("Portal URL missing.");
  }

  async function refreshSubscription() {
    const response = await fetch(apiBase() + "/billing/refresh-subscription", {
      method: "POST",
      headers: authHeaders(),
    });
    const data = await parseJson(response);
    if (!response.ok || !data.status) {
      throw new Error(data.message || "Unable to refresh subscription.");
    }
    if (data.subscription && global.BBAccountPlan) {
      global.BBAccountPlan.persistSubscription(data.subscription);
    }
    return data;
  }

  async function handleCheckoutReturn() {
    const params = new URLSearchParams(global.location.search || "");
    const stripeFlag = params.get("stripe");
    if (stripeFlag === "cancel") {
      return { cancelled: true };
    }
    if (stripeFlag === "portal") {
      const before = readPortalSnapshot();
      clearPortalSnapshot();
      try {
        const data = await refreshSubscription();
        const after = snapshotSubscription(data.subscription);
        const changed = before
          ? subscriptionSnapshotChanged(before, after)
          : false;
        return {
          portal: true,
          synced: true,
          changed: changed,
          data: data,
          message: changed ? portalChangeMessage(before, after) : "",
        };
      } catch (err) {
        return { portal: true, synced: false, changed: false, error: err };
      }
    }
    if (stripeFlag !== "success") {
      return null;
    }
    const sessionId = params.get("session_id");
    if (!sessionId) {
      return { success: true, synced: false };
    }
    const data = await syncCheckoutSession(sessionId);
    return { success: true, synced: true, data: data };
  }

  /**
   * Run on brand-console-dashboard.html when URL contains ?stripe=...
   * Shows a dashboard-level popup, then cleans the query string.
   */
  async function handleDashboardCheckoutReturn() {
    const result = await handleCheckoutReturn();
    if (!result) return null;

    let label = "";
    if (result.cancelled) {
      label = "Checkout cancelled — you can upgrade anytime from Start Now.";
    } else if (result.success) {
      if (result.synced) {
        label = "Payment received — Premium is now active.";
        if (global.BBAccountPlan) {
          await global.BBAccountPlan.fetchAccountPlan({ fromModules: false, silent: true });
        }
      } else {
        label = "Thanks! Confirming your Premium subscription…";
      }
    } else if (result.portal && result.changed && result.message) {
      label = result.message;
      if (global.BBAccountPlan) {
        await global.BBAccountPlan.fetchAccountPlan({ fromModules: false, silent: true });
      }
      if (typeof global.bbRefreshAccountSubscriptionMenu === "function") {
        global.bbRefreshAccountSubscriptionMenu();
      }
    }

    if (label && typeof global.bbShowSyncPopup === "function") {
      await global.bbShowSyncPopup({
        label: label,
        doneLabel: label,
        duration: 2200,
        doneHoldMs: 1400,
        barColor: "#635bff",
        logoSrc:
          (global.BB_APP && global.BB_APP.syncPopupLogoSrc) ||
          "../brand-modules-bundle/brandbased-logo.svg",
      });
    } else if (label) {
      global.alert(label);
    }

    cleanStripeQueryFromUrl();
    return result;
  }

  global.BBStripeBilling = {
    createCheckoutSession: createCheckoutSession,
    createPortalSession: createPortalSession,
    syncCheckoutSession: syncCheckoutSession,
    dashboardStripeReturnUrl: dashboardStripeReturnUrl,
    cleanStripeQueryFromUrl: cleanStripeQueryFromUrl,
    isInIframe: isInIframe,
    startPremiumCheckout: startPremiumCheckout,
    openBillingPortal: openBillingPortal,
    refreshSubscription: refreshSubscription,
    handleCheckoutReturn: handleCheckoutReturn,
    handleDashboardCheckoutReturn: handleDashboardCheckoutReturn,
  };
})(typeof window !== "undefined" ? window : globalThis);
