(function () {
  const STORAGE_KEY = "bb-ad-campaigns-opt-in-website";

  document.addEventListener("DOMContentLoaded", function () {
    const optIn = document.getElementById("bbAdcOptInWebsite");
    if (!optIn) return;

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "1") optIn.checked = true;
    } catch {}

    optIn.addEventListener("change", function () {
      try {
        localStorage.setItem(STORAGE_KEY, optIn.checked ? "1" : "0");
      } catch {}
    });
  });
})();
