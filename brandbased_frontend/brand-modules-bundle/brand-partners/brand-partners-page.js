(function () {
  const list = document.getElementById("bbBrandPartnersList");
  if (!list || !list.querySelector(".bb-brand-partner-row")) return;

  function storageKeyElevated(id) {
    return "bb-brand-partner-elevated-" + id;
  }
  function storageKeyWeight(id) {
    return "bb-brand-partner-weight-" + id;
  }

  function applySliderFill(slider) {
    if (!slider) return;
    var v = Math.max(0, Math.min(100, parseInt(slider.value, 10) || 0));
    slider.style.setProperty("--bb-bp-fill", v + "%");
  }

  function tierLabel(n) {
    if (n <= 19) return "Tier 1 · minimal";
    if (n <= 39) return "Tier 2 · low";
    if (n <= 59) return "Tier 3 · moderate";
    if (n <= 79) return "Tier 4 · high";
    return "Tier 5 · maximum BB AI priority";
  }

  function syncBrandLogoPulse(row) {
    const toggle = row.querySelector(".bb-plat-toggle__input");
    if (!toggle || !toggle.checked) {
      row.style.removeProperty("--bb-bp-pulse-t");
      return;
    }
    const slider = row.querySelector(".bb-brand-partner-slider");
    const n = Math.max(0, Math.min(100, Number(slider && slider.value) || 0));
    row.style.setProperty("--bb-bp-pulse-t", String(Math.round((n / 100) * 10000) / 10000));
  }

  function updateReadout(row, value) {
    const id = row.getAttribute("data-brand");
    const out = row.querySelector(".bb-brand-partner-readout[data-readout-for=\"" + id + "\"]");
    if (out) out.textContent = tierLabel(Number(value));
    const slider = row.querySelector(".bb-brand-partner-slider");
    if (slider) {
      slider.setAttribute("aria-valuenow", String(value));
      slider.setAttribute("aria-valuetext", tierLabel(Number(value)));
      applySliderFill(slider);
    }
    syncBrandLogoPulse(row);
  }

  function applyElevatedState(row, elevated) {
    row.classList.toggle("bb-brand-partner-row--signals-locked", !elevated);
    const slider = row.querySelector(".bb-brand-partner-slider");
    if (slider) {
      slider.disabled = !elevated;
      slider.setAttribute("aria-disabled", elevated ? "false" : "true");
    }
  }

  list.querySelectorAll(".bb-brand-partner-row").forEach(function (row) {
    const id = row.getAttribute("data-brand");
    if (!id) return;
    const toggle = row.querySelector(".bb-plat-toggle__input");
    const slider = row.querySelector(".bb-brand-partner-slider");
    if (!toggle || !slider) return;

    const defW = parseInt(slider.getAttribute("data-default-weight") || "40", 10);
    try {
      const wSaved = localStorage.getItem(storageKeyWeight(id));
      if (wSaved != null && !Number.isNaN(parseInt(wSaved, 10))) {
        slider.value = String(Math.max(0, Math.min(100, parseInt(wSaved, 10))));
      } else {
        slider.value = String(Math.max(0, Math.min(100, defW)));
      }
      const eSaved = localStorage.getItem(storageKeyElevated(id));
      if (eSaved === "0") toggle.checked = false;
      else if (eSaved === "1") toggle.checked = true;
    } catch (_e) { /* ignore */ }

    updateReadout(row, slider.value);
    applyElevatedState(row, toggle.checked);
    toggle.dispatchEvent(new Event("change", { bubbles: true }));
    syncBrandLogoPulse(row);

    let writeT = 0;
    function persistWeight() {
      try {
        localStorage.setItem(storageKeyWeight(id), slider.value);
      } catch (_e2) { /* ignore */ }
    }

    slider.addEventListener("input", function () {
      updateReadout(row, slider.value);
      applySliderFill(slider);
      window.clearTimeout(writeT);
      writeT = window.setTimeout(persistWeight, 200);
    });
    slider.addEventListener("change", persistWeight);

    slider.addEventListener("pointerdown", function () {
      slider.classList.add("bb-brand-partner-slider--dragging");
    });
    slider.addEventListener("pointerup", function () {
      slider.classList.remove("bb-brand-partner-slider--dragging");
    });
    slider.addEventListener("pointercancel", function () {
      slider.classList.remove("bb-brand-partner-slider--dragging");
    });
    slider.addEventListener("pointerleave", function (e) {
      if (e.buttons === 0) {
        slider.classList.remove("bb-brand-partner-slider--dragging");
      }
    });
    toggle.addEventListener("change", function () {
      applyElevatedState(row, toggle.checked);
      syncBrandLogoPulse(row);
      try {
        localStorage.setItem(storageKeyElevated(id), toggle.checked ? "1" : "0");
      } catch (_e3) { /* ignore */ }
    });
  });
})();
