(function () {
  const STORAGE_KEY = "bb-ai-logic-rules";

  document.addEventListener("DOMContentLoaded", function () {
    const ta = document.getElementById("bbAiLogicRules");
    const saveBtn = document.getElementById("bbAiLogicSaveBtn");
    if (!ta || !saveBtn) return;

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (typeof saved === "string") ta.value = saved;
    } catch {}

    let writeT = 0;
    ta.addEventListener("input", function () {
      clearTimeout(writeT);
      writeT = setTimeout(function () {
        try { localStorage.setItem(STORAGE_KEY, ta.value); } catch {}
      }, 200);
    });

    saveBtn.addEventListener("click", function () {
      try { localStorage.setItem(STORAGE_KEY, ta.value); } catch {}
      if (typeof window.bbShowSyncPopup === "function") {
        window.bbShowSyncPopup({
          logoSrc: "./brandbased-logo.svg",
          barColor: "#635bff",
        });
      }
    });
  });
})();
