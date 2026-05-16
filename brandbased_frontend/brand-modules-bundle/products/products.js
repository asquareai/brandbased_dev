(() => {
  const KEY_BG = "bbTheme:background:v1";

  const normHex6 = (v) => {
    const t = String(v || "").trim();
    if (/^#[0-9a-fA-F]{6}$/i.test(t)) return t.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/i.test(t)) {
      const x = t.slice(1).toLowerCase();
      return `#${x[0]}${x[0]}${x[1]}${x[1]}${x[2]}${x[2]}`;
    }
    return null;
  };

  const readTheme = () => {
    let o = null;
    try {
      o = JSON.parse(localStorage.getItem(KEY_BG) || "null");
    } catch {
      o = null;
    }
    return {
      contentColorHex: normHex6(o?.contentColorHex) || "#14141a",
      productTitleColorHex: normHex6(o?.productTitleColorHex) || "#14141a",
      buyButtonBgHex: normHex6(o?.buyButtonBgHex) || "#1030f4",
      buyButtonLabelHex: normHex6(o?.buyButtonLabelHex) || "#ffffff",
      exploreIconHex: normHex6(o?.exploreIconHex) || "#1030f4",
      lockLogoHex: normHex6(o?.lockLogoHex) || "#1030f4",
    };
  };

  const statusEl = document.getElementById("bbProductsThemeStatus");

  const applyToPopup = (popup, s) => {
    if (!popup) return;
    // mark as preview so we can safely scope future CSS if needed
    popup.dataset.bbProductsPreview = "1";
    try {
      popup.classList.add("bb-theme-ui-tint-on");
    } catch {}

    // Apply direct styles (keeps this page isolated from Theme Settings CSS).
    const title = popup.querySelector(".product-title");
    const desc = popup.querySelector(".product-description");
    const selects = popup.querySelectorAll(".selectors-row, .selectors-row select");
    const closeLines = popup.querySelectorAll(".close-x-icon svg line, .popup-sheet-close svg line");
    const buyBtn = popup.querySelector(".buy-now-button");
    const explore = popup.querySelector(".explore-link");
    const lockHost = popup.querySelector(".lock-icon-bb-logo");

    if (title) title.style.color = s.productTitleColorHex;
    if (desc) desc.style.color = s.contentColorHex;
    selects.forEach((n) => {
      try {
        n.style.color = s.contentColorHex;
      } catch {}
    });
    closeLines.forEach((n) => {
      try {
        n.style.stroke = s.contentColorHex;
      } catch {}
    });
    if (buyBtn) {
      buyBtn.style.backgroundColor = s.buyButtonBgHex;
      buyBtn.style.color = s.buyButtonLabelHex;
      // for iOS
      buyBtn.style.webkitTextFillColor = s.buyButtonLabelHex;
    }
    if (explore) {
      try {
        explore.style.color = s.exploreIconHex;
      } catch {}
    }
    if (lockHost) {
      // If lock corner is an inline svg (Theme Settings approach), paint it.
      try {
        lockHost.style.color = s.lockLogoHex;
      } catch {}
      try {
        lockHost.querySelectorAll("svg.bb-lock-logo-inline *").forEach((n) => {
          n.removeAttribute?.("style");
          n.setAttribute?.("fill", s.lockLogoHex);
          n.setAttribute?.("stroke", s.lockLogoHex);
        });
      } catch {}
    }
  };

  const refresh = () => {
    const s = readTheme();
    if (statusEl) statusEl.textContent = `Theme: ${String(s.buyButtonBgHex || "").toUpperCase()}`;
    const popup = document.querySelector(".popup");
    if (popup) applyToPopup(popup, s);
  };

  // Allow Products page to force a theme re-apply in the same tab (storage events don't fire same-tab).
  try {
    window.bbProductsRefreshTheme = refresh;
  } catch {}
  window.addEventListener("bb-products-theme-slot-applied", () => refresh());

  // bb-smart-ui creates the popup after a delay; keep this lightweight.
  let n = 0;
  const id = window.setInterval(() => {
    n += 1;
    refresh();
    if (document.querySelector(".popup") || n > 40) {
      // keep listening for storage updates even after popup exists
      window.clearInterval(id);
    }
  }, 250);

  window.addEventListener("storage", (e) => {
    if (e.key === KEY_BG) refresh();
  });
})();

