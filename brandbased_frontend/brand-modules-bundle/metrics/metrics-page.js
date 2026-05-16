/**
 * Metrics page — demo dashboard.
 *
 * IMPORTANT: This script does ONE-TIME setup only. No setInterval, no
 * recurring rAF, no timers that fire after the initial paint. Everything
 * that needs to feel "alive" past load is driven by infinite CSS keyframes
 * (see metrics.css). This makes the page bulletproof to run for hours in
 * any environment — local file://, Cursor preview, deployed, headless,
 * whatever — without crashing or memory-pressuring the WebKit content
 * process.
 */
(function () {
  if (window.bbMetricsInit) return;
  window.bbMetricsInit = true;

  const REDUCED_MOTION = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Swallow any stray runtime error so a single throw can't blank the page.
  window.addEventListener("error", function () { /* noop */ });
  window.addEventListener("unhandledrejection", function () { /* noop */ });

  // ---------- helpers ----------

  /** Smoothly tween a numeric value into an element ONE TIME. */
  function tweenValueOnce(el, target, opts) {
    if (!el) return;
    opts = opts || {};
    const duration = opts.duration != null ? opts.duration : 1400;
    const decimals = opts.decimals != null ? opts.decimals : 0;
    const prefix   = opts.prefix || "";
    const suffix   = opts.suffix || "";
    const startVal = isNaN(parseFloat(opts.from)) ? 0 : parseFloat(opts.from);
    const startT   = performance.now();

    function format(n, d) {
      const fixed = n.toFixed(d);
      const parts = fixed.split(".");
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return parts.join(".");
    }

    if (REDUCED_MOTION || duration <= 0) {
      el.textContent = prefix + format(target, decimals) + suffix;
      return;
    }

    function step(now) {
      const t = Math.min(1, (now - startT) / duration);
      const e = 1 - Math.pow(1 - t, 3); // easeOutCubic
      const v = startVal + (target - startVal) * e;
      el.textContent = prefix + format(v, decimals) + suffix;
      if (t < 1) requestAnimationFrame(step);
      // No re-scheduling. Once this rAF chain ends, no further work.
    }
    requestAnimationFrame(step);
  }

  /** Build a smoothed SVG path through a series of points. */
  function buildPath(points, w, h) {
    if (!points.length) return { line: "", fill: "", lastX: 0, lastY: 0 };
    let max = -Infinity, min = Infinity;
    for (let i = 0; i < points.length; i++) {
      const v = points[i];
      if (v > max) max = v;
      if (v < min) min = v;
    }
    const range = max - min || 1;
    const stepX = w / (points.length - 1);
    const yOf = function (v) {
      const norm = (v - min) / range;
      return h - (norm * (h * 0.82) + h * 0.06);
    };

    let line = "";
    for (let i = 0; i < points.length; i++) {
      const x = i * stepX;
      const y = yOf(points[i]);
      if (i === 0) {
        line = "M " + x.toFixed(2) + " " + y.toFixed(2);
      } else {
        const prevX = (i - 1) * stepX;
        const prevY = yOf(points[i - 1]);
        const cpX1  = prevX + stepX / 2;
        const cpY1  = prevY;
        const cpX2  = x - stepX / 2;
        const cpY2  = y;
        line += " C " + cpX1.toFixed(2) + " " + cpY1.toFixed(2) +
                ", "  + cpX2.toFixed(2) + " " + cpY2.toFixed(2) +
                ", "  + x.toFixed(2)    + " " + y.toFixed(2);
      }
    }
    const lastX = (points.length - 1) * stepX;
    const lastY = yOf(points[points.length - 1]);
    const fill = line + " L " + w + " " + h + " L 0 " + h + " Z";
    return { line: line, fill: fill, lastX: lastX, lastY: lastY };
  }

  function rand(min, max) { return min + Math.random() * (max - min); }

  function makeSeries(length, base, jitter) {
    const out = [];
    let v = base;
    for (let i = 0; i < length; i++) {
      v += rand(-jitter, jitter);
      v = Math.max(base * 0.55, Math.min(base * 1.45, v));
      out.push(v);
    }
    return out;
  }

  // ---------- init (one-shot) ----------

  function initMetricsDashboard() {
    try {

      // 1. Tween every [data-target] into view ONCE.
      document.querySelectorAll("[data-target]").forEach(function (el) {
        const target = parseFloat(el.dataset.target);
        if (isNaN(target)) return;
        tweenValueOnce(el, target, {
          duration: 1400,
          decimals: el.dataset.decimals ? parseInt(el.dataset.decimals, 10) : 0,
          suffix:   el.dataset.suffix   || "",
          prefix:   el.dataset.prefix   || ""
        });
      });

      // 2. Ring gauge — set stroke-dashoffset ONCE; CSS handles the glow loop.
      document.querySelectorAll(".bb-metric-card-ring-fill").forEach(function (circle) {
        const target = parseFloat(circle.dataset.ringTarget) || 0;
        const r = parseFloat(circle.getAttribute("r")) || 42;
        const C = 2 * Math.PI * r;
        circle.style.strokeDasharray = String(C);
        circle.style.strokeDashoffset = String(C);
        void circle.getBoundingClientRect();
        requestAnimationFrame(function () {
          circle.style.strokeDashoffset =
            String(C * (1 - Math.max(0, Math.min(100, target)) / 100));
        });
      });

      // 3. Sparklines — render the path ONCE. CSS handles the cap pulse.
      const sparkConfigs = [
        { key: "engagement",  base: 70, jitter: 4 },
        { key: "interaction", base: 55, jitter: 6 }
      ];
      const SPARK_W = 200, SPARK_H = 60, SPARK_POINTS = 22;
      sparkConfigs.forEach(function (cfg) {
        const linePath = document.querySelector('[data-spark="' + cfg.key + '-line"]');
        const fillPath = document.querySelector('[data-spark="' + cfg.key + '-fill"]');
        const cap      = document.querySelector('[data-spark="' + cfg.key + '-cap"]');
        if (!linePath || !fillPath || !cap) return;
        const series = makeSeries(SPARK_POINTS, cfg.base, cfg.jitter);
        const built  = buildPath(series, SPARK_W, SPARK_H);
        linePath.setAttribute("d", built.line);
        fillPath.setAttribute("d", built.fill);
        cap.setAttribute("cx", String(built.lastX));
        cap.setAttribute("cy", String(built.lastY));
      });

      // 4. Activity bars — render 24 bars ONCE with a per-bar phase delay so
      //    the CSS breathing animation rolls across the row forever.
      const barsHost = document.getElementById("bbMetricsActivityBars");
      if (barsHost && !barsHost.firstElementChild) {
        const heights = [];
        for (let i = 0; i < 24; i++) {
          const hourBias = 0.45
            + 0.55 * Math.sin((i / 24) * Math.PI - Math.PI / 6) * 0.5
            + 0.30 * Math.sin((i / 24) * Math.PI * 2 - Math.PI / 3) * 0.5;
          const h = Math.max(0.18, Math.min(0.98, hourBias + rand(-0.08, 0.08)));
          heights.push(h);
        }
        heights.forEach(function (h, i) {
          const bar = document.createElement("span");
          bar.className = "bb-metric-card-bar" +
            (i === heights.length - 1 ? " bb-metric-card-bar--current" : "");
          bar.style.setProperty("--bb-bar-delay", (i * -0.08).toFixed(2) + "s");
          // Set the final height inline so CSS can transition into it on first
          // paint. After this initial set, no more JS touches these bars.
          bar.style.height = (h * 100) + "%";
          barsHost.appendChild(bar);
        });
      }

      // 5. Platform partner bars — arm widths ONCE and stagger CSS shimmer
      //    delays per row so the row constantly rolls.
      const partnersRoot = document.getElementById("bbMetricsPartners");
      if (partnersRoot) {
        partnersRoot.querySelectorAll(".bb-metric-partner").forEach(function (li, i) {
          const fill = li.querySelector(".bb-metric-partner-bar-fill");
          if (!fill) return;
          fill.style.setProperty("--bb-shimmer-delay", (i * -0.32).toFixed(2) + "s");
          requestAnimationFrame(function () {
            fill.classList.add("bb-metric-partner-bar-fill--armed");
          });
        });
      }

      // 6. Live signal feed scrolls infinitely via pure CSS — no JS here.
      //    Strip aria-live just in case prior versions added it (long-running
      //    SR mutation streams can hurt perf in some shells).
      const feedList = document.getElementById("bbMetricsFeedList");
      if (feedList) {
        feedList.removeAttribute("aria-live");
        feedList.removeAttribute("aria-relevant");
      }

      // 7. Top status counter — tween up to its target ONCE, then leave it.
      //    No live ticker; the pulsing dot + scrolling feed convey "live".
      // (Already covered by step 1's [data-target] sweep.)

    } catch (_e) {
      // If any of the above throws, the page still renders fine via CSS.
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initMetricsDashboard, { once: true });
  } else {
    initMetricsDashboard();
  }
})();
