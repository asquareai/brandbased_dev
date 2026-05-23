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
        created_under_plan:
          payload.createdUnderPlan ||
          (global.BBAccountPlan && global.BBAccountPlan.detectBrandTierFromPath
            ? global.BBAccountPlan.detectBrandTierFromPath()
            : "freemium"),
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

  function isMetaVerified(metaStatus) {
    return metaStatus === "verified";
  }

  function buildMetaVerificationSnippet(brandUniqueId) {
    const runtimeUrl =
      (global.BB_APP && global.BB_APP.brandRuntimeScriptUrl) ||
      "https://cdn.brandbased.ai/runtime/v1.js";
    const token = "BB-VERIFIED-" + brandUniqueId;
    return (
      "<!-- BrandBased Official Verification -->\n" +
      '<meta name="brandbased-official" content="' +
      token +
      '">\n\n' +
      "<!-- BrandBased Runtime -->\n" +
      '<script src="' +
      runtimeUrl +
      '" data-bb-id="' +
      brandUniqueId +
      '" async><\/script>'
    );
  }

  function loadCurrentBrandRequest() {
    try {
      const raw = localStorage.getItem(LS_CURRENT_REQUEST);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_e) {
      return null;
    }
  }

  function saveCurrentBrandRequest(brandRequest) {
    try {
      localStorage.setItem(LS_CURRENT_REQUEST, JSON.stringify(brandRequest));
    } catch (_e) { /* ignore */ }
  }

  async function fetchMetaSnippet(requestId) {
    const response = await fetch(
      apiBase() +
        "/brand-verification-requests/" +
        encodeURIComponent(requestId) +
        "/meta-snippet",
      { headers: authHeaders() }
    );

    const data = await parseJsonResponse(response);

    if (!response.ok || !data.status) {
      throw new Error(data.message || "Unable to load verification snippet.");
    }

    return data;
  }

  /**
   * Ensures brand_unique_id (and related fields) are present — repairs
   * older localStorage entries saved before status returned full payload.
   */
  async function hydrateCurrentBrandRequest() {
    let brandRequest = loadCurrentBrandRequest();
    if (!brandRequest || !brandRequest.id) {
      return null;
    }

    if (brandRequest.brand_unique_id) {
      return brandRequest;
    }

    try {
      brandRequest = await fetchBrandVerificationStatus(brandRequest.id);
      saveCurrentBrandRequest(brandRequest);
      if (brandRequest.brand_unique_id) {
        return brandRequest;
      }
    } catch (_e) { /* try meta-snippet next */ }

    try {
      const snippetPayload = await fetchMetaSnippet(brandRequest.id);
      brandRequest.brand_unique_id = snippetPayload.brand_unique_id;
      saveCurrentBrandRequest(brandRequest);
      return brandRequest;
    } catch (_e2) {
      return brandRequest;
    }
  }

  async function fetchBrands() {
    const response = await fetch(apiBase() + "/brands", {
      headers: authHeaders(),
    });

    const data = await parseJsonResponse(response);

    if (!response.ok || !data.status) {
      throw new Error(data.message || "Unable to load brands.");
    }

    return data.brands || [];
  }

  async function publishBrand(brandId) {
    const response = await fetch(
      apiBase() + "/brands/" + encodeURIComponent(brandId) + "/publish",
      {
        method: "POST",
        headers: authHeaders(),
      }
    );

    const data = await parseJsonResponse(response);

    if (!response.ok || !data.status) {
      throw new Error(data.message || "Unable to publish brand.");
    }

    return data.brand;
  }

  async function unpublishBrand(brandId) {
    const response = await fetch(
      apiBase() + "/brands/" + encodeURIComponent(brandId) + "/unpublish",
      {
        method: "POST",
        headers: authHeaders(),
      }
    );

    const data = await parseJsonResponse(response);

    if (!response.ok || !data.status) {
      throw new Error(data.message || "Unable to unpublish brand.");
    }

    return data.brand;
  }

  async function fetchBrandSettings(brandId) {
    const response = await fetch(
      apiBase() + "/brands/" + encodeURIComponent(brandId) + "/settings",
      {
        method: "GET",
        headers: authHeaders(),
      }
    );

    const data = await parseJsonResponse(response);

    if (!response.ok || !data.status) {
      throw new Error(data.message || "Unable to load brand settings.");
    }

    return data.settings || {};
  }

  async function saveBrandSettings(brandId, settings) {
    const response = await fetch(
      apiBase() + "/brands/" + encodeURIComponent(brandId) + "/settings",
      {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ settings: settings }),
      }
    );

    const data = await parseJsonResponse(response);

    if (!response.ok || !data.status) {
      throw new Error(data.message || "Unable to save brand settings.");
    }

    if (data.brand) {
      try {
        localStorage.setItem("bbSelectedBrand", JSON.stringify(data.brand));
      } catch (_e) { /* ignore */ }
    }

    return data.settings || settings;
  }

  async function fetchBrandActivityLogs(options) {
    options = options || {};
    const params = new URLSearchParams();
    if (options.brandId) {
      params.set("brand_id", String(options.brandId));
    }
    if (options.action) {
      params.set("action", String(options.action));
    }
    if (options.limit) {
      params.set("limit", String(options.limit));
    }
    const qs = params.toString();
    const response = await fetch(
      apiBase() + "/brand-activity-logs" + (qs ? "?" + qs : ""),
      {
        method: "GET",
        headers: authHeaders(),
      }
    );

    const data = await parseJsonResponse(response);

    if (!response.ok || !data.status) {
      throw new Error(data.message || "Unable to load activity history.");
    }

    return data.activity_logs || [];
  }

  async function deleteBrand(brandId) {
    const response = await fetch(
      apiBase() + "/brands/" + encodeURIComponent(brandId),
      {
        method: "DELETE",
        headers: authHeaders(),
      }
    );

    const data = await parseJsonResponse(response);

    if (!response.ok || !data.status) {
      throw new Error(data.message || "Unable to delete brand.");
    }

    return data;
  }

  async function verifyBrandMeta(requestId) {
    const response = await fetch(
      apiBase() +
        "/brand-verification-requests/" +
        encodeURIComponent(requestId) +
        "/verify-meta",
      {
        method: "POST",
        headers: authHeaders(),
      }
    );

    const data = await parseJsonResponse(response);

    if (!response.ok || !data.status) {
      throw new Error(data.message || "Website verification failed.");
    }

    if (data.brand_request) {
      saveCurrentBrandRequest(data.brand_request);
    }

    return data;
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
    isMetaVerified: isMetaVerified,
    buildMetaVerificationSnippet: buildMetaVerificationSnippet,
    loadCurrentBrandRequest: loadCurrentBrandRequest,
    saveCurrentBrandRequest: saveCurrentBrandRequest,
    hydrateCurrentBrandRequest: hydrateCurrentBrandRequest,
    fetchMetaSnippet: fetchMetaSnippet,
    fetchBrands: fetchBrands,
    fetchBrandSettings: fetchBrandSettings,
    saveBrandSettings: saveBrandSettings,
    fetchBrandActivityLogs: fetchBrandActivityLogs,
    publishBrand: publishBrand,
    unpublishBrand: unpublishBrand,
    deleteBrand: deleteBrand,
    verifyBrandMeta: verifyBrandMeta,
    isIdentityRejected: isIdentityRejected,
    identityStatusLabel: identityStatusLabel,
  };
})(typeof window !== "undefined" ? window : globalThis);
