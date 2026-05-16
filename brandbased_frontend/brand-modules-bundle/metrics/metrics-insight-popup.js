/**
 * Metrics — glass “insight” dialogs for platform + brand partner rows.
 * Reuses shared sync-popup.css (backdrop blur + logo breathing).
 *
 * When this page runs inside a dashboard iframe, overlays are forwarded
 * to the parent via postMessage (same idea as bbShowSyncPopup) so
 * backdrop-filter blurs the real chrome behind the module, not only
 * the iframe’s own document.
 */
(function () {
  if (window.bbMetricsInsightInit) return;
  window.bbMetricsInsightInit = true;

  var insightMsgId = 0;
  var useParentOverlay = false;
  try {
    useParentOverlay = window.self !== window.top;
  } catch (_e) {
    useParentOverlay = true;
  }

  function demoNum(seed, min, max) {
    var h = 0;
    var s = String(seed || "x");
    for (var i = 0; i < s.length; i++) {
      h = ((h << 5) - h) + s.charCodeAt(i);
      h |= 0;
    }
    var span = max - min + 1;
    return min + (Math.abs(h) % span);
  }

  function fmtInt(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function platformCopy(id) {
    var base = {
      impressions: demoNum("imp-" + id, 620000, 5200000),
      surfaces: demoNum("surf-" + id, 12, 48),
      dwell: (demoNum("dwell-" + id, 18, 96) / 10).toFixed(1),
      ctr: (demoNum("ctr-" + id, 8, 42) / 10).toFixed(1),
    };
    var bodies = {
      google: "Search placements and sponsored modules are pacing above the network median. Shoppers who see this brand on Google tend to re-engage on owned sites within the same session.",
      youtube: "In-stream and overlay moments are driving the strongest completion rates. Co-viewing on living-room devices is lifting attributed recall scores for this brand.",
      instagram: "Story and Reels hotspots show the highest tap density. Visual-first audiences are spending longer in carousel product lanes after the first impression.",
      facebook: "Feed and Marketplace adjacencies are stable volume drivers. Lookalike cohorts from BB signals are matching with lower CPA than the prior week.",
      x: "Timeline and profile embeds spike during live moments. Real-time moderation keeps unsafe adjacency near zero while preserving reach.",
      reddit: "Thread-native placements lean on community context. Comment sentiment skews constructive when the brand participates with authentic voice.",
      twitch: "Live inventory peaks in prime-time blocks. Extension panels convert best when synced with drops and channel point redemptions.",
      substack: "Newsletter embeds show high scroll-depth. Paid subscriber segments over-index on long-form follow-through after the first open.",
      wechat: "Mini-program and official-account surfaces retain users in-session. QR hand-offs from offline retail are closing the attribution loop.",
      medium: "Long reads benefit from progressive disclosure. Readers who finish the first third rarely bounce before the CTA block.",
      "bleacher-report": "Sports calendar moments compress attention. High-velocity creatives are winning share of voice during marquee matchups.",
    };
    return {
      title: id === "bleacher-report" ? "Bleacher Report" : id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, " "),
      body: bodies[id] || "This surface is pacing within expected guardrails. BB is normalising cross-site frequency so shoppers do not feel over-exposed.",
      stats: base,
    };
  }

  function brandCopy(id) {
    return {
      impressions: demoNum("bimp-" + id, 180000, 2100000),
      sentiment: (demoNum("sent-" + id, 62, 94) / 10).toFixed(1),
      quotes: [
        "“Feels premium in context — not loud.”",
        "“I trust this brand more when it shows up next to editorial.”",
      ],
      contexts: [
        "Beauty & personal care · premium consideration",
        "Cross-retailer journeys · mobile-first",
        "Signals blended from hotspots, modules, and partner retail pages",
      ],
    };
  }

  function absolveImgSrcs(root) {
    root.querySelectorAll("img[src]").forEach(function (img) {
      var s = img.getAttribute("src");
      if (!s) return;
      try {
        img.setAttribute("src", new URL(s, location.href).href);
      } catch (_e) { /* keep relative */ }
    });
  }

  function closePopupLocal(root) {
    if (!root) return;
    root.classList.remove("bb-sync-popup-backdrop--show");
    if (root._bbInsightEsc) {
      document.removeEventListener("keydown", root._bbInsightEsc, true);
      root._bbInsightEsc = null;
    }
    window.setTimeout(function () {
      try {
        if (root && root.parentNode) root.parentNode.removeChild(root);
      } catch (_e) { /* ignore */ }
    }, 220);
  }

  function closeInsightEverywhere() {
    if (useParentOverlay) {
      try {
        window.parent.postMessage({ type: "bb-dash-metrics-insight-close" }, "*");
      } catch (_e) { /* ignore */ }
      return;
    }
    var prev = document.querySelector(".bb-metrics-insight-host");
    if (prev) closePopupLocal(prev);
  }

  function wireInsightBackdrop(root) {
    function close() {
      if (useParentOverlay) {
        try {
          window.parent.postMessage({ type: "bb-dash-metrics-insight-close" }, "*");
        } catch (_e) { /* ignore */ }
        return;
      }
      closePopupLocal(root);
    }

    function onEsc(ev) {
      if (ev.key === "Escape") close();
    }
    root._bbInsightEsc = onEsc;
    document.addEventListener("keydown", onEsc, true);

    root.addEventListener("click", function (ev) {
      if (ev.target === root) close();
    });
    var closeBtn = root.querySelector(".bb-metrics-insight-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", close);
    }
    var card = root.querySelector(".bb-sync-popup");
    if (card) {
      card.addEventListener("click", function (ev) {
        ev.stopPropagation();
      });
    }
    window.requestAnimationFrame(function () {
      root.classList.add("bb-sync-popup-backdrop--show");
    });
  }

  function pushInsightToParent(root) {
    absolveImgSrcs(root);
    var id = ++insightMsgId;
    var html = root.outerHTML;
    try {
      window.parent.postMessage({
        type: "bb-dash-metrics-insight",
        id: id,
        html: html,
      }, "*");
    } catch (_e) {
      /* Fallback: show inside iframe if parent is unreachable */
      document.body.appendChild(root);
      wireInsightBackdrop(root);
    }
  }

  var HEAD_BB =
    "<span class=\"bb-sync-popup__logo\" style=\"--bb-sync-popup-bar-color:#6366f1\" title=\"BrandBased\" aria-hidden=\"true\">" +
    "<img src=\"./brandbased-logo.svg?v=bb-3\" alt=\"\" decoding=\"async\" />" +
    "</span>";

  /* Möbius / continuity loop (∞) between BrandBased and partner marks. */
  var ARROW_HANDSHAKE =
    "<span class=\"bb-metrics-insight-handshake\" aria-hidden=\"true\">" +
    "<span class=\"bb-metrics-insight-mobius\" title=\"Continuous brand signal flow\">" +
    "<svg class=\"bb-metrics-insight-mobius-svg\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\">" +
    "<path fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.35\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"" +
    "M12 12 A4 4 0 0 0 8 8 A4 4 0 0 0 4 12 A4 4 0 0 0 8 16 A4 4 0 0 0 12 12 A4 4 0 0 1 16 8 A4 4 0 0 1 20 12 A4 4 0 0 1 16 16 A4 4 0 0 1 12 12" +
    "\"/></svg>" +
    "</span>" +
    "</span>";

  function openPlatformInsight(li) {
    closeInsightEverywhere();
    var id = li.getAttribute("data-platform") || "unknown";
    var img = li.querySelector(".bb-metric-partner-logo");
    var nameEl = li.querySelector(".bb-metric-partner-name");
    var name = nameEl ? nameEl.textContent.trim() : id;
    var c = platformCopy(id);
    var root = document.createElement("div");
    root.className = "bb-sync-popup-backdrop bb-metrics-insight-host";
    root.setAttribute("role", "presentation");
    root.innerHTML =
      "<div class=\"bb-sync-popup bb-metrics-insight-popup\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"bb-insight-title\">" +
      "<button type=\"button\" class=\"bb-metrics-insight-close\" aria-label=\"Close\">×</button>" +
      "<div class=\"bb-metrics-insight-head\">" +
      HEAD_BB +
      ARROW_HANDSHAKE +
      "<span class=\"bb-sync-popup__logo bb-metrics-insight-logo\" style=\"--bb-sync-popup-bar-color:#22d3ee\"><img src=\"\" alt=\"\" decoding=\"async\" /></span>" +
      "</div>" +
      "<p class=\"bb-sync-popup__label\" id=\"bb-insight-title\"></p>" +
      "<div class=\"bb-metrics-insight-stats\">" +
      "<div class=\"bb-metrics-insight-stat\"><span class=\"bb-metrics-insight-stat-label\">Surface impressions (24h)</span>" +
      "<span class=\"bb-metrics-insight-stat-val\" data-insight-impressions></span></div>" +
      "<div class=\"bb-metrics-insight-stat\"><span class=\"bb-metrics-insight-stat-label\">Active BB surfaces</span>" +
      "<span class=\"bb-metrics-insight-stat-val\" data-insight-surfaces></span></div>" +
      "<div class=\"bb-metrics-insight-stat\"><span class=\"bb-metrics-insight-stat-label\">Avg dwell (hotspots)</span>" +
      "<span class=\"bb-metrics-insight-stat-val\" data-insight-dwell></span></div>" +
      "<div class=\"bb-metrics-insight-stat\"><span class=\"bb-metrics-insight-stat-label\">Engaged CTR</span>" +
      "<span class=\"bb-metrics-insight-stat-val\" data-insight-ctr></span></div>" +
      "</div>" +
      "<p class=\"bb-metrics-insight-prose\"></p>" +
      "<p class=\"bb-metrics-insight-foot\">Figures are illustrative subscriber-network aggregates for this demo.</p>" +
      "</div>";
    var title = root.querySelector("#bb-insight-title");
    if (title) title.textContent = name;
    var logoImg = root.querySelector(".bb-metrics-insight-logo img");
    if (logoImg && img && img.src) {
      logoImg.src = img.src;
      logoImg.alt = name;
    }
    root.querySelector("[data-insight-impressions]").textContent = fmtInt(c.stats.impressions);
    root.querySelector("[data-insight-surfaces]").textContent = String(c.stats.surfaces);
    root.querySelector("[data-insight-dwell]").textContent = c.stats.dwell + "s";
    root.querySelector("[data-insight-ctr]").textContent = c.stats.ctr + "%";
    root.querySelector(".bb-metrics-insight-prose").textContent = c.body;

    if (useParentOverlay) {
      pushInsightToParent(root);
    } else {
      document.body.appendChild(root);
      wireInsightBackdrop(root);
    }
  }

  function openBrandInsight(li) {
    closeInsightEverywhere();
    var id = li.getAttribute("data-brand") || "unknown";
    var img = li.querySelector(".bb-metric-partner-logo");
    var nameEl = li.querySelector(".bb-metric-partner-name");
    var name = nameEl ? nameEl.textContent.trim() : id;
    var c = brandCopy(id);
    var root = document.createElement("div");
    root.className = "bb-sync-popup-backdrop bb-metrics-insight-host";
    root.setAttribute("role", "presentation");
    root.innerHTML =
      "<div class=\"bb-sync-popup bb-metrics-insight-popup\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"bb-insight-btitle\">" +
      "<button type=\"button\" class=\"bb-metrics-insight-close\" aria-label=\"Close\">×</button>" +
      "<div class=\"bb-metrics-insight-head\">" +
      HEAD_BB +
      ARROW_HANDSHAKE +
      "<span class=\"bb-sync-popup__logo bb-metrics-insight-logo\" style=\"--bb-sync-popup-bar-color:#22d3ee\"><img src=\"\" alt=\"\" decoding=\"async\" /></span>" +
      "</div>" +
      "<p class=\"bb-sync-popup__label\" id=\"bb-insight-btitle\"></p>" +
      "<div class=\"bb-metrics-insight-stats\">" +
      "<div class=\"bb-metrics-insight-stat\"><span class=\"bb-metrics-insight-stat-label\">Partner impressions (24h)</span>" +
      "<span class=\"bb-metrics-insight-stat-val\" data-bi-imp></span></div>" +
      "<div class=\"bb-metrics-insight-stat\"><span class=\"bb-metrics-insight-stat-label\">Consumer sentiment index</span>" +
      "<span class=\"bb-metrics-insight-stat-val\" data-bi-sent></span></div>" +
      "</div>" +
      "<h3 class=\"bb-metrics-insight-h\">What shoppers are saying</h3>" +
      "<ul class=\"bb-metrics-insight-list\" data-bi-quotes></ul>" +
      "<h3 class=\"bb-metrics-insight-h\">Contexts &amp; consumer signals</h3>" +
      "<ul class=\"bb-metrics-insight-list\" data-bi-ctx></ul>" +
      "<p class=\"bb-metrics-insight-foot\">Voice snippets are anonymised, aggregated examples for this demo.</p>" +
      "</div>";
    var title = root.querySelector("#bb-insight-btitle");
    if (title) title.textContent = name;
    var logoImg = root.querySelector(".bb-metrics-insight-logo img");
    if (logoImg && img && img.src) {
      logoImg.src = img.src;
      logoImg.alt = name;
    }
    root.querySelector("[data-bi-imp]").textContent = fmtInt(c.impressions);
    root.querySelector("[data-bi-sent]").textContent = c.sentiment + " / 10";

    var qUl = root.querySelector("[data-bi-quotes]");
    c.quotes.forEach(function (q) {
      var liq = document.createElement("li");
      liq.textContent = q;
      qUl.appendChild(liq);
    });
    var ctxUl = root.querySelector("[data-bi-ctx]");
    c.contexts.forEach(function (t) {
      var lit = document.createElement("li");
      lit.textContent = t;
      ctxUl.appendChild(lit);
    });

    if (useParentOverlay) {
      pushInsightToParent(root);
    } else {
      document.body.appendChild(root);
      wireInsightBackdrop(root);
    }
  }

  function wire() {
    var plat = document.getElementById("bbMetricsPartners");
    if (plat) {
      plat.addEventListener("click", function (ev) {
        var row = ev.target.closest(".bb-metric-partner");
        if (!row || !plat.contains(row)) return;
        ev.preventDefault();
        openPlatformInsight(row);
      });
    }
    var brands = document.getElementById("bbMetricsBrandPartners");
    if (brands) {
      brands.addEventListener("click", function (ev) {
        var row = ev.target.closest(".bb-metric-partner");
        if (!row || !brands.contains(row)) return;
        ev.preventDefault();
        openBrandInsight(row);
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire, { once: true });
  } else {
    wire();
  }
})();
