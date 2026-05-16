/**
 * Payments module script — runs only on Payments.html (body.bb-payments-page).
 * Does not register globals used elsewhere in the bundle.
 */
(function () {
  const body = document.body;
  if (!body || !body.classList.contains("bb-payments-page")) return;

  const mount = document.getElementById("bbPaymentsMount");
  if (!mount) return;

  mount.dataset.bbPaymentsReady = "1";

  const stripeBtn = document.getElementById("bbPayStripeSetupBtn");
  if (stripeBtn) {
    stripeBtn.addEventListener("click", () => {
      window.open("https://dashboard.stripe.com/register", "_blank", "noopener,noreferrer");
    });
  }

  const viewPayoutsBtn = document.getElementById("bbPayViewPayoutsBtn");
  if (viewPayoutsBtn) {
    viewPayoutsBtn.addEventListener("click", () => {
      window.open("https://dashboard.stripe.com/payouts", "_blank", "noopener,noreferrer");
    });
  }

  /** Desktop: align Select Platforms with Payment Methods row + extra breathing room above the purple card. */
  const EXTRA_GAP_ABOVE_PLATFORMS_PX = 18;
  const mqDesktop = window.matchMedia("(min-width: 1351px)");
  const pmMethodsCard = document.querySelector(".bb-pay-setup-card");
  const platformsCta = document.querySelector(".bb-pay-platforms-cta");
  const layoutRoot = document.querySelector(".bb-bts-layout");

  function syncPlatformsMarginTop() {
    if (!pmMethodsCard || !platformsCta) return;
    if (!mqDesktop.matches) {
      platformsCta.style.removeProperty("margin-top");
      return;
    }
    const pmTop = pmMethodsCard.getBoundingClientRect().top;
    const purpleTop = platformsCta.getBoundingClientRect().top;
    const delta = Math.round(pmTop - purpleTop) + EXTRA_GAP_ABOVE_PLATFORMS_PX;
    if (Math.abs(delta) <= 1) return;
    const prev = parseFloat(platformsCta.style.marginTop) || 0;
    const next = Math.max(0, prev + delta);
    if (next > 0) {
      platformsCta.style.marginTop = `${next}px`;
    } else {
      platformsCta.style.removeProperty("margin-top");
    }
  }

  let syncScheduled = false;
  function scheduleSync() {
    if (syncScheduled) return;
    syncScheduled = true;
    requestAnimationFrame(() => {
      syncScheduled = false;
      syncPlatformsMarginTop();
    });
  }

  window.addEventListener("resize", scheduleSync, { passive: true });
  mqDesktop.addEventListener("change", scheduleSync);
  if (layoutRoot && typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(scheduleSync);
    ro.observe(layoutRoot);
  }
  if (document.fonts && typeof document.fonts.ready !== "undefined") {
    document.fonts.ready.then(scheduleSync).catch(scheduleSync);
  }
  scheduleSync();
  window.addEventListener("load", scheduleSync, { passive: true });
})();
