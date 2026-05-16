(() => {
  const DAYS = [
    { key: "MON", label: "MON", full: "Monday" },
    { key: "TUE", label: "TUE", full: "Tuesday" },
    { key: "WED", label: "WED", full: "Wednesday" },
    { key: "THU", label: "THU", full: "Thursday" },
    { key: "FRI", label: "FRI", full: "Friday" },
    { key: "SAT", label: "SAT", full: "Saturday" },
    { key: "SUN", label: "SUN", full: "Sunday" },
  ];

  const DAY_KEYS = DAYS.map((d) => d.key);

  const PRODUCT_SLOTS_N = 7;
  const SCHED_ROTATION_KEY = "bbProductScheduling:rotation:v1";
  const SLOT_STORAGE_KEY = (i) => `bbProducts:slot:${i}:v1`;

  const PLACEHOLDER_IMG = "./products/BB-Product-Image-Placeholder.svg";

  /** Same DB as `products-page.js` so scheduling rows can resolve `persistId` / `id` gallery entries to blob URLs. */
  const SchedulingMediaIDB = (() => {
    const DB_NAME = "bb-products-media-v1";
    const STORE = "media";
    /** `{ url, kind }` per persisted media id — `kind` from Products IDB (`image` vs `video`). */
    const entryCache = new Map();
    const open = () =>
      new Promise((resolve, reject) => {
        try {
          const req = indexedDB.open(DB_NAME, 1);
          req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        } catch (e) {
          reject(e);
        }
      });

    const getMediaEntry = async (idRaw) => {
      const id = String(idRaw || "").trim();
      if (!id) return null;
      if (entryCache.has(id)) return entryCache.get(id);
      const db = await open();
      const rec = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        tx.onerror = () => reject(tx.error);
        const r = tx.objectStore(STORE).get(id);
        r.onsuccess = () => resolve(r.result || null);
        r.onerror = () => reject(r.error);
      });
      if (!rec?.blob) return null;
      const url = URL.createObjectURL(rec.blob);
      const kind = rec.kind === "video" ? "video" : "image";
      const entry = { url, kind };
      entryCache.set(id, entry);
      return entry;
    };

    const getObjectUrl = async (idRaw) => {
      const e = await getMediaEntry(idRaw);
      return e?.url ?? null;
    };

    return { getObjectUrl, getMediaEntry };
  })();

  const rowsHost = document.getElementById("bbPsRows");
  const countEl = document.getElementById("bbPsCount");
  if (!rowsHost) return;

  /** Cleared after render: row `.bb-ps-row--pulse` for the product that just gained a day. */
  let rowToPulseId = null;

  /** Tracks header pill text; used to `.bb-ps-count-pill--pump` only when the tally changes. */
  let lastRenderedActiveCount = null;

  const normalizeDays = (arr) => {
    const set = new Set((arr || []).filter((k) => DAY_KEYS.includes(k)));
    return DAY_KEYS.filter((k) => set.has(k));
  };

  const hasAllSevenFrom = (arr) => normalizeDays(arr).length === 7;

  const resolveImgForScheduling = (rawUrl) => {
    const u = String(rawUrl || "").trim();
    if (!u || u.startsWith("blob:")) return null;
    if (u.startsWith("http://") || u.startsWith("https://") || u.startsWith("/")) return u;
    const vid = /\.(mp4|webm|mov|ogg)(\?|$)/i.test(u);
    if (vid) return null;
    if (u.startsWith("../")) return u;
    if (u.startsWith("./products/")) return u;
    const cleaned = u.replace(/^\.\//, "").replace(/^products\/?/, "");
    return `./products/${cleaned}`;
  };

  /** Paths for gallery `<video>` (Products seeds e.g. `../add-sample.mp4`). */
  const resolveGalleryVideoUrlForScheduling = (rawUrl) => {
    const u = String(rawUrl || "").trim();
    if (!u || u.startsWith("blob:")) return null;
    if (u.startsWith("http://") || u.startsWith("https://") || u.startsWith("/")) return u;
    const vid = /\.(mp4|webm|mov|ogg)(\?|$)/i.test(u);
    if (!vid) return null;
    if (u.startsWith("../")) return u;
    if (u.startsWith("./")) return u;
    const cleaned = u.replace(/^\.\//, "").replace(/^products\/?/, "");
    return `./products/${cleaned}`;
  };

  /** First gallery item preview in order — image uses `<img>`, video uses `<video>` thumbnail frame. */
  const resolveSchedulingThumb = async (media) => {
    const list = Array.isArray(media) ? media : [];
    for (const m of list) {
      if (!m || typeof m !== "object") continue;
      const kind = m.kind === "video" ? "video" : "image";
      const rawUrl = typeof m.url === "string" ? m.url : "";
      const pid = String(m.persistId || m.id || "").trim();

      if (kind === "video") {
        if (rawUrl && !rawUrl.startsWith("blob:")) {
          const v = resolveGalleryVideoUrlForScheduling(rawUrl);
          if (v) return { thumbKind: "video", thumbSrc: v };
        }
        if (pid) {
          try {
            const ent = await SchedulingMediaIDB.getMediaEntry(pid);
            if (ent?.kind === "video") return { thumbKind: "video", thumbSrc: ent.url };
            if (ent?.kind === "image") return { thumbKind: "image", thumbSrc: ent.url };
          } catch {}
        }
        continue;
      }

      if (rawUrl && !rawUrl.startsWith("blob:")) {
        const loc = resolveImgForScheduling(rawUrl);
        if (loc) return { thumbKind: "image", thumbSrc: loc };
      }
      if (pid) {
        try {
          const ent = await SchedulingMediaIDB.getMediaEntry(pid);
          if (ent?.kind === "image") return { thumbKind: "image", thumbSrc: ent.url };
          if (ent?.kind === "video") return { thumbKind: "video", thumbSrc: ent.url };
        } catch {}
      }
    }
    return null;
  };

  const readRotationBag = () => {
    try {
      const raw = localStorage.getItem(SCHED_ROTATION_KEY);
      if (!raw) return null;
      const o = JSON.parse(raw);
      return o && typeof o === "object" ? o : null;
    } catch {
      return null;
    }
  };

  const persistSchedulingRotation = () => {
    try {
      const bag = {};
      items.forEach((it) => {
        const i = Number(it.slotIdx);
        if (!Number.isFinite(i)) return;
        bag[String(i)] = normalizeDays(it.days);
      });
      localStorage.setItem(SCHED_ROTATION_KEY, JSON.stringify(bag));
    } catch {}
  };

  const defaultWeekDays = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

  const buildItemsFromStorageAsync = async () => {
    const rot = readRotationBag();
    const out = [];

    for (let slotIdx = 0; slotIdx < PRODUCT_SLOTS_N; slotIdx++) {
      let name = `Product ${slotIdx + 1}`;
      let thumbKind = "image";
      let thumbSrc = PLACEHOLDER_IMG;

      try {
        const raw = localStorage.getItem(SLOT_STORAGE_KEY(slotIdx));
        if (raw) {
          const o = JSON.parse(raw);
          const nm = typeof o?.name === "string" ? o.name.trim() : "";
          if (nm) name = nm;
          const thumb = await resolveSchedulingThumb(o?.media);
          if (thumb) {
            thumbKind = thumb.thumbKind;
            thumbSrc = thumb.thumbSrc;
          }
        }
      } catch {}

      let days =
        rot && Array.isArray(rot[String(slotIdx)])
          ? rot[String(slotIdx)]
          : [defaultWeekDays[slotIdx]];
      days = normalizeDays(days);

      out.push({
        id: `slot-${slotIdx}`,
        slotIdx,
        num: slotIdx + 1,
        name,
        thumbKind,
        thumbSrc,
        img: thumbSrc,
        days,
      });
    }
    return out;
  };

  let items = [];

  const dayFull = (k) => DAYS.find((d) => d.key === k)?.full || "Monday";
  const dayShort = (k) => DAYS.find((d) => d.key === k)?.label || "MON";

  const clearOthersIfFullWeek = (product) => {
    if (!hasAllSevenFrom(product.days)) return;
    items.forEach((x) => {
      if (x.id !== product.id) x.days = [];
    });
  };

  const renderActiveBlock = (it) => {
    const txt = document.createElement("div");
    txt.className = "bb-ps-active-text";
    const top = document.createElement("div");
    top.className = "bb-ps-active-top";
    const label = document.createElement("span");
    label.className = "bb-ps-active-label";
    const dayLine = document.createElement("div");
    dayLine.className = "bb-ps-active-day";

    const sel = normalizeDays(it.days);

    if (sel.length === 0) {
      label.classList.add("bb-ps-active-label--off");
      label.textContent = "Inactive";
      dayLine.textContent = "—";
      dayLine.title = "No rotation days selected";
    } else if (sel.length === 7) {
      label.textContent = "Active 7 days";
      label.title = DAYS.map((x) => x.full).join(", ");
      dayLine.textContent = "";
      dayLine.removeAttribute("title");
      dayLine.classList.add("bb-ps-active-day--empty");
    } else if (sel.length === 1) {
      label.textContent = "Active";
      dayLine.textContent = dayShort(sel[0]);
      dayLine.title = dayFull(sel[0]);
    } else {
      label.textContent = "Active";
      dayLine.textContent = `${sel.length} days`;
      dayLine.title = sel.map(dayFull).join(", ");
    }

    top.appendChild(label);
    txt.appendChild(top);
    txt.appendChild(dayLine);
    return txt;
  };

  const render = () => {
    const pulseRowId = rowToPulseId;
    rowToPulseId = null;

    rowsHost.innerHTML = "";
    items.forEach((it) => {
      it.days = normalizeDays(it.days);

      const row = document.createElement("div");
      row.className = "bb-ps-row";
      row.dataset.id = it.id;
      row.dataset.slot = String(it.slotIdx);

      const thumb = document.createElement("div");
      thumb.className = "bb-ps-thumb";
      if (it.thumbKind === "video") {
        const vid = document.createElement("video");
        vid.className = "bb-ps-thumb-video";
        vid.src = it.thumbSrc;
        vid.muted = true;
        vid.defaultMuted = true;
        vid.playsInline = true;
        vid.setAttribute("playsinline", "");
        vid.preload = "auto";
        vid.loop = false;
        vid.controls = false;
        try {
          vid.disablePictureInPicture = true;
        } catch {}
        vid.setAttribute("disablePictureInPicture", "");
        vid.setAttribute("aria-label", `${it.name} video preview`);
        const nudgePosterFrame = () => {
          try {
            if (vid.readyState < 2) return;
            const dur = vid.duration;
            const t =
              typeof dur === "number" &&
              dur > 0 &&
              Number.isFinite(dur) &&
              dur !== Number.POSITIVE_INFINITY
                ? Math.min(0.08, Math.max(0.02, dur * 0.02))
                : 0.05;
            vid.currentTime = t;
          } catch {}
        };
        vid.addEventListener("loadeddata", nudgePosterFrame, { once: true });
        vid.addEventListener(
          "error",
          () => {
            try {
              vid.remove();
              const fallback = document.createElement("img");
              fallback.alt = "";
              fallback.src = PLACEHOLDER_IMG;
              thumb.appendChild(fallback);
            } catch {}
          },
          { once: true },
        );
        thumb.appendChild(vid);
      } else {
        const img = document.createElement("img");
        img.alt = "";
        img.src = it.thumbSrc || it.img || PLACEHOLDER_IMG;
        thumb.appendChild(img);
      }

      const title = document.createElement("div");
      title.className = "bb-ps-title";
      const name = document.createElement("div");
      name.className = "bb-ps-name";
      name.textContent = it.name;
      const sub = document.createElement("div");
      sub.className = "bb-ps-sub";
      sub.appendChild(document.createTextNode("Product"));
      const pill = document.createElement("span");
      pill.className = "bb-ps-pill";
      pill.textContent = String(it.num);
      sub.appendChild(pill);
      title.appendChild(name);
      title.appendChild(sub);

      const active = document.createElement("div");
      active.className = "bb-ps-active";
      const clock = document.createElement("img");
      clock.className = "bb-ps-clock";
      clock.alt = "";
      clock.src = "./product-scheduling/time-icon-blue.svg";
      active.appendChild(clock);
      active.appendChild(renderActiveBlock(it));

      const daysWrap = document.createElement("div");
      daysWrap.className = "bb-ps-days";
      const mine = normalizeDays(it.days);

      DAYS.forEach((d) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "bb-ps-day";
        b.textContent = d.label;

        const on = mine.includes(d.key);
        b.setAttribute("aria-pressed", on ? "true" : "false");

        const holder = items.find((x) => x.id !== it.id && normalizeDays(x.days).includes(d.key));
        if (holder && !on) {
          b.classList.add("bb-ps-day-busy");
          b.title = `Scheduled for ${holder.name}; click to move this day to this product`;
        } else if (on) {
          b.title = `Remove ${dayFull(d.key)} from this product`;
        } else {
          b.title = `Add ${dayFull(d.key)} to this product`;
        }

        b.addEventListener("click", () => {
          const cur = normalizeDays(it.days);
          if (cur.includes(d.key)) {
            it.days = cur.filter((k) => k !== d.key);
          } else {
            rowToPulseId = it.id;
            const other = items.find((x) => x.id !== it.id && normalizeDays(x.days).includes(d.key));
            if (other) other.days = normalizeDays(other.days).filter((k) => k !== d.key);
            it.days = normalizeDays([...cur, d.key]);
            clearOthersIfFullWeek(it);
          }
          it.days = normalizeDays(it.days);
          render();
        });
        daysWrap.appendChild(b);
      });

      const chevLink = document.createElement("a");
      chevLink.className = "bb-ps-chevron-link";
      chevLink.href = `./products/Products.html?slot=${encodeURIComponent(it.num)}`;
      chevLink.setAttribute("aria-label", `Open Products page for product ${it.num}`);
      chevLink.title = `Edit product ${it.num} on the Products page`;

      const chev = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      chev.setAttribute("viewBox", "0 0 24 24");
      chev.setAttribute("aria-hidden", "true");
      chev.classList.add("bb-ps-chevron");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("fill", "currentColor");
      path.setAttribute("d", "M9.2 5.6a1.2 1.2 0 0 0 0 1.7L13.9 12l-4.7 4.7a1.2 1.2 0 1 0 1.7 1.7l5.6-5.6a1.2 1.2 0 0 0 0-1.7L10.9 5.6a1.2 1.2 0 0 0-1.7 0z");
      chev.appendChild(path);
      chevLink.appendChild(chev);

      row.appendChild(thumb);
      row.appendChild(title);
      row.appendChild(active);
      row.appendChild(daysWrap);
      row.appendChild(chevLink);

      if (pulseRowId === it.id) {
        row.classList.add("bb-ps-row--pulse");
        let cleaned = false;
        const done = () => {
          if (cleaned) return;
          cleaned = true;
          window.clearTimeout(failsafe);
          row.classList.remove("bb-ps-row--pulse");
        };
        const failsafe = window.setTimeout(done, 900);
        row.addEventListener(
          "animationend",
          (ev) => {
            if (ev.target !== row) return;
            done();
          },
          { once: true },
        );
      }

      rowsHost.appendChild(row);
    });

    persistSchedulingRotation();

    const activeCount = items.filter((i) => normalizeDays(i.days).length > 0).length;
    const noun = activeCount === 1 ? "Product" : "Products";
    if (countEl) {
      const label = `${activeCount} Active ${noun} in Rotation`;
      const countChanged =
        typeof lastRenderedActiveCount === "number" && lastRenderedActiveCount !== activeCount;
      lastRenderedActiveCount = activeCount;
      countEl.textContent = label;
      if (countChanged) {
        countEl.classList.remove("bb-ps-count-pill--pump");
        countEl.offsetWidth;
        countEl.classList.add("bb-ps-count-pill--pump");
        let cleaned = false;
        const done = () => {
          if (cleaned) return;
          cleaned = true;
          window.clearTimeout(failsafe);
          countEl.classList.remove("bb-ps-count-pill--pump");
        };
        const failsafe = window.setTimeout(done, 900);
        countEl.addEventListener(
          "animationend",
          (ev) => {
            if (ev.target !== countEl || ev.animationName !== "bb-ps-product-pump") return;
            done();
          },
          { once: true },
        );
      }
    }
  };

  const boot = async () => {
    rowToPulseId = null;
    items = await buildItemsFromStorageAsync();
    render();
  };

  boot();

  window.addEventListener("storage", (e) => {
    if (!e?.key || typeof e.key !== "string") return;
    if (!/^bbProducts:slot:[0-6]:v1$/.test(e.key)) return;
    void (async () => {
      rowToPulseId = null;
      items = await buildItemsFromStorageAsync();
      render();
    })();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    rowToPulseId = null;
    void (async () => {
      items = await buildItemsFromStorageAsync();
      render();
    })();
  });
})();
