(function () {
  const STORAGE_POLICY = "bb-brand-verify-ai-policy";

  function wireTextarea(ta, saveBtn, storageKey) {
    if (!ta || !saveBtn) return;

    try {
      const saved = localStorage.getItem(storageKey);
      if (typeof saved === "string") ta.value = saved;
    } catch (_e) { /* ignore */ }

    let writeT = 0;
    ta.addEventListener("input", function () {
      clearTimeout(writeT);
      writeT = setTimeout(function () {
        try {
          localStorage.setItem(storageKey, ta.value);
        } catch (_e) { /* ignore */ }
      }, 200);
    });

    saveBtn.addEventListener("click", function () {
      try {
        localStorage.setItem(storageKey, ta.value);
      } catch (_e) { /* ignore */ }
      if (typeof window.bbShowSyncPopup === "function") {
        window.bbShowSyncPopup({
          logoSrc: "./brandbased-logo.svg",
          barColor: "#635bff",
        });
      }
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    wireTextarea(
      document.getElementById("bbBrandVerifyPolicy"),
      document.getElementById("bbBrandVerifyPolicySaveBtn"),
      STORAGE_POLICY
    );
  });
})();
