/**
 * Browser-only "themes" uploads for the admin gallery (IndexedDB + object URLs).
 * Real files cannot be written to disk from the frontend; uploads are stored here
 * and referenced as bbtheme-upload:<id> in bbTheme:adminGallery:v1 slots.
 */
(function (global) {
  const DB_NAME = "bbThemeGalleryDemo";
  const DB_VER = 1;
  const STORE = "uploads";
  const urlById = new Map();

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onerror = () => reject(req.error);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
    });
  }

  async function addUpload(file) {
    if (!file || !file.size) throw new Error("Empty file");
    const id = "u_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
    const name = String(file.name || "upload")
      .replace(/[^\w.\- ]+/g, "_")
      .trim()
      .slice(0, 120);
    const mime = file.type || "application/octet-stream";
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).add({ id, name, mime, blob: file, createdAt: Date.now() });
    });
    db.close();
    return id;
  }

  async function listUploads() {
    const db = await openDb();
    const rows = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const r = tx.objectStore(STORE).getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => reject(r.error);
    });
    db.close();
    return rows
      .map((x) => ({
        id: x.id,
        name: x.name,
        mime: x.mime,
        size: x.blob && x.blob.size ? x.blob.size : 0,
      }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  async function getBlob(id) {
    const db = await openDb();
    const row = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const r = tx.objectStore(STORE).get(id);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    db.close();
    return row && row.blob ? row.blob : null;
  }

  function revokeObjectUrl(id) {
    const u = urlById.get(id);
    if (u) {
      try {
        URL.revokeObjectURL(u);
      } catch {}
      urlById.delete(id);
    }
  }

  async function getObjectUrl(id) {
    if (urlById.has(id)) return urlById.get(id);
    const blob = await getBlob(id);
    if (!blob) return "";
    const u = URL.createObjectURL(blob);
    urlById.set(id, u);
    return u;
  }

  function revokeAllObjectUrls() {
    for (const u of urlById.values()) {
      try {
        URL.revokeObjectURL(u);
      } catch {}
    }
    urlById.clear();
  }

  global.BbThemeGalleryUploads = {
    addUpload,
    listUploads,
    getBlob,
    getObjectUrl,
    revokeObjectUrl,
    revokeAllObjectUrls,
  };
})(typeof window !== "undefined" ? window : globalThis);
