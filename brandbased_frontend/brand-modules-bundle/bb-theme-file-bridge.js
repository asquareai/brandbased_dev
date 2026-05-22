/**
 * Shares localStorage with Theme Styles (brand-modules-bundle/).
 * Streams bb-theme-live to Premium/Freemium parent on file://.
 */
(function () {
  const ACTIVE_SLOT_KEY = "bbProducts:activeSlot:v1";
  const KEY_CUSTOM_SESSION = "bbTheme:customBgSession:v1";
  const SESSION_PREFIX = "__bbSession:";
  const THEME_KEYS = [
    "bbTheme:accent:v1",
    "bbTheme:recentColours:v1",
    "bbTheme:background:v1",
    "bbTheme:video:v1",
    "bbTheme:customBgPersist:v1",
    "bbTheme:buyNowLabel:v1",
    "bbTheme:typography:v1",
    "bbTheme:adsPreview:v1",
    "bbTheme:adminGallery:v1",
  ];

  const scopedKey = (base, idx) => `${base}:themeSlot:${idx}:v1`;
  const scopedSessionKey = (base, idx) => `${base}:themeSlot:${idx}:v1`;

  function readSlot() {
    try {
      const n = Number(localStorage.getItem(ACTIVE_SLOT_KEY));
      if (Number.isFinite(n)) return Math.max(0, Math.min(6, Math.floor(n)));
    } catch (_e) {}
    return 0;
  }

  function collectPayload(slot) {
    const payload = {};
    THEME_KEYS.forEach(function (base) {
      const sk = scopedKey(base, slot);
      try {
        const v = localStorage.getItem(sk);
        if (v != null && v !== "") payload[sk] = v;
      } catch (_e) {}
    });
    try {
      const slotRaw = localStorage.getItem(ACTIVE_SLOT_KEY);
      if (slotRaw != null && slotRaw !== "") payload[ACTIVE_SLOT_KEY] = slotRaw;
    } catch (_e) {}
    try {
      const sessKey = scopedSessionKey(KEY_CUSTOM_SESSION, slot);
      const sess = sessionStorage.getItem(sessKey);
      if (sess) payload[SESSION_PREFIX + sessKey] = sess;
    } catch (_e) {}
    return payload;
  }

  function stableSig(payload) {
    const keys = Object.keys(payload).sort();
    const norm = {};
    keys.forEach(function (k) {
      norm[k] = payload[k];
    });
    try {
      return JSON.stringify(norm);
    } catch (_e) {
      return "";
    }
  }

  let lastSig = "";
  let pushTimer = 0;

  function pushToParent() {
    if (!window.parent || window.parent === window) return;
    const slot = readSlot();
    const payload = collectPayload(slot);
    const sig = stableSig(payload);
    if (sig === lastSig) return;
    lastSig = sig;
    try {
      window.parent.postMessage(
        { type: "bb-theme-live", slot: slot, payload: payload, src: "bb-theme-file-bridge" },
        "*"
      );
    } catch (_e) {}
  }

  function schedulePush() {
    if (pushTimer) window.clearTimeout(pushTimer);
    pushTimer = window.setTimeout(function () {
      pushTimer = 0;
      pushToParent();
    }, 160);
  }

  window.addEventListener("message", function (e) {
    if (e && e.data && e.data.type === "bb-theme-live-request") {
      lastSig = "";
      schedulePush();
    }
  });

  window.addEventListener("storage", function (e) {
    const k = String((e && e.key) || "");
    if (k.indexOf("bbTheme:") === 0 || k.indexOf(":themeSlot:") !== -1 || k === ACTIVE_SLOT_KEY) {
      schedulePush();
    }
  });

  pushToParent();
})();
