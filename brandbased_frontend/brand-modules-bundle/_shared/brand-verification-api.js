/**
 * Brand verification API — submit to Laravel and poll identity status.
 * Requires auth_token in localStorage (same as signup / landing).
 */
(function (global) {
  const LS_CURRENT_REQUEST = "bbCurrentBrandVerificationRequest";

  const TERMINAL_IDENTITY = new Set([
    "verified",
    "under_review",
    "rejected",
    "flagged",
  ]);

  function apiBase() {
    return (global.BB_APP && global.BB_APP.apiBaseUrl) || "https://api.brandbased.ai/api";
  }

  function authHeaders() {
    const token = localStorage.getItem("auth_token");
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (token) headers.Authorization = "Bearer " + token;
    return headers;
  }

  function dataUrlToSvgString(dataUrl) {
    const raw = String(dataUrl || "").trim();
    if (!raw) return "";
    if (raw.startsWith("<svg") || raw.startsWith("<?xml")) return raw;
    if (!raw.startsWith("data:")) return "";

    const comma = raw.indexOf(",");
    if (comma < 0) return "";

    const meta = raw.slice(0, comma);
    const payload = raw.slice(comma + 1);

    if (/;base64/i.test(meta)) {
      try {
        return atob(payload);
      } catch (_e) {
        return "";
      }
    }

    try {
      return decodeURIComponent(payload);
    } catch (_e2) {
      return payload;
    }
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  async function parseJsonResponse(response) {
    let data = {};
    try {
      data = await response.json();
    } catch (_e) {
      data = {};
    }
    return data;
  }

  async function submitBrandVerificationRequest(payload) {
    const response = await fetch(apiBase() + "/brand-verification-requests", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        brand_name: payload.brandName,
        website_url: payload.websiteUrl,
        light_logo_svg: payload.lightLogoSvg,
        dark_logo_svg: payload.darkLogoSvg,
      }),
    });

    const data = await parseJsonResponse(response);

    if (!response.ok || !data.status) {
      const message =
        data.message ||
        (data.errors && Object.values(data.errors).flat().join(" ")) ||
        "Brand submission failed.";
      throw new Error(message);
    }

    try {
      localStorage.setItem(
        LS_CURRENT_REQUEST,
        JSON.stringify(data.brand_request)
      );
    } catch (_e) { /* ignore */ }

    return data.brand_request;
  }

  async function fetchBrandVerificationStatus(requestId) {
    const response = await fetch(
      apiBase() + "/brand-verification-requests/" + encodeURIComponent(requestId) + "/status",
      {
        headers: authHeaders(),
      }
    );

    const data = await parseJsonResponse(response);

    if (!response.ok || !data.status) {
      throw new Error(data.message || "Unable to load verification status.");
    }

    return data.brand_request;
  }

  async function pollBrandVerificationUntilTerminal(requestId, options) {
    options = options || {};
    const pollIntervalMs = options.pollIntervalMs || 3000;
    const maxMs = options.maxMs || 300000;
    const onUpdate = options.onUpdate;
    const started = Date.now();

    while (Date.now() - started < maxMs) {
      const brandRequest = await fetchBrandVerificationStatus(requestId);
      if (onUpdate) onUpdate(brandRequest);
      if (TERMINAL_IDENTITY.has(brandRequest.identity_status)) {
        return brandRequest;
      }
      await sleep(pollIntervalMs);
    }

    throw new Error(
      "Verification is taking longer than expected. Please try again in a few minutes."
    );
  }

  function canProceedToMetaVerification(identityStatus) {
    return identityStatus === "verified";
  }

  function isIdentityRejected(identityStatus) {
    return identityStatus === "rejected" || identityStatus === "flagged";
  }

  function identityStatusLabel(identityStatus) {
    switch (identityStatus) {
      case "pending":
        return "Waiting to start…";
      case "processing":
        return "AI verification in progress…";
      case "verified":
        return "Identity verification completed";
      case "under_review":
        return "Verification requires manual review";
      case "rejected":
        return "Identity verification rejected";
      case "flagged":
        return "Potential fraud detected";
      default:
        return "Processing verification…";
    }
  }

  global.BBBrandVerification = {
    LS_CURRENT_REQUEST: LS_CURRENT_REQUEST,
    apiBase: apiBase,
    dataUrlToSvgString: dataUrlToSvgString,
    submitBrandVerificationRequest: submitBrandVerificationRequest,
    fetchBrandVerificationStatus: fetchBrandVerificationStatus,
    pollBrandVerificationUntilTerminal: pollBrandVerificationUntilTerminal,
    canProceedToMetaVerification: canProceedToMetaVerification,
    isIdentityRejected: isIdentityRejected,
    identityStatusLabel: identityStatusLabel,
  };
})(typeof window !== "undefined" ? window : globalThis);
