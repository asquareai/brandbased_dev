(function () {
  const STORAGE_POLICY = "bb-brand-verify-ai-policy";
  const PROMPT_KEY = "TRAINED_BRAND_VALIDATION";

  function apiBase() {
    if (window.BB_APP && window.BB_APP.apiBaseUrl) {
      return String(window.BB_APP.apiBaseUrl).replace(/\/$/, "");
    }
    return "https://api.brandbased.ai/api";
  }

  function authHeaders() {
    const token = localStorage.getItem("auth_token");
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (token) headers.Authorization = "Bearer " + token;
    return headers;
  }

  async function loadPromptFromApi(ta) {
    const token = localStorage.getItem("auth_token");
    if (!token || !ta) return false;

    try {
      const res = await fetch(apiBase() + "/brand-ai-prompts/" + PROMPT_KEY, {
        headers: authHeaders(),
      });
      const data = await res.json();
      if (res.ok && data.status && data.prompt && data.prompt.prompt_content) {
        ta.value = data.prompt.prompt_content;
        try {
          localStorage.setItem(STORAGE_POLICY, ta.value);
        } catch (_e) { /* ignore */ }
        return true;
      }
    } catch (_err) { /* ignore */ }

    return false;
  }

  async function savePromptToApi(content) {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      throw new Error("Login required to sync the trained prompt to the server.");
    }

    const res = await fetch(apiBase() + "/brand-ai-prompts/" + PROMPT_KEY, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({
        prompt_name: "Trained Brand Identity Verification",
        prompt_content: content,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.status) {
      throw new Error(data.message || "Unable to save prompt.");
    }

    return data;
  }

  function wireTextarea(ta, saveBtn, storageKey) {
    if (!ta || !saveBtn) return;

    loadPromptFromApi(ta).then(function (loaded) {
      if (loaded) return;
      try {
        const saved = localStorage.getItem(storageKey);
        if (typeof saved === "string" && saved.trim()) ta.value = saved;
      } catch (_e) { /* ignore */ }
    });

    let writeT = 0;
    ta.addEventListener("input", function () {
      clearTimeout(writeT);
      writeT = setTimeout(function () {
        try {
          localStorage.setItem(storageKey, ta.value);
        } catch (_e) { /* ignore */ }
      }, 200);
    });

    saveBtn.addEventListener("click", async function () {
      saveBtn.disabled = true;
      const prev = saveBtn.textContent;
      saveBtn.textContent = "Syncing…";

      try {
        try {
          localStorage.setItem(storageKey, ta.value);
        } catch (_e) { /* ignore */ }

        await savePromptToApi(ta.value);

        if (typeof window.bbShowSyncPopup === "function") {
          await window.bbShowSyncPopup({
            label: "Syncing trained prompt",
            doneLabel: "Synced",
            logoSrc: "./brandbased-logo.svg",
            barColor: "#635bff",
          });
        }
      } catch (err) {
        alert(err.message || "Sync failed.");
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = prev;
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
