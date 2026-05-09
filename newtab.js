// =====================
// Config
// =====================
const MEDIA_DIRS = {
  photos: "media/photos",
  videos: "media/videos",
};

const EXT = {
  photos: new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]),
  videos: new Set([".mp4", ".webm", ".ogg"]),
};

// Favicon cache TTL: 120 hours (5 days)
const FAVICON_TTL_MS = 120 * 60 * 60 * 1000;
const FAVICON_MAX_BYTES = 64 * 1024;


// =====================
// Helpers
// =====================
function $(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function extUrl(path) {
  return chrome.runtime.getURL(path);
}

function setImageVisible(v) {
  $("bgImage").style.opacity = v ? "1" : "0";
}

function setVideoVisible(v) {
  $("bgVideo").style.opacity = v ? "1" : "0";
}

function showFallbackGradient() {
  setImageVisible(false);
  setVideoVisible(false);
  document.body.style.background =
    "radial-gradient(circle at center, #222, #000 70%), linear-gradient(180deg, #111, #000)";
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}


// =====================
// Media Scanner (auto-read folder)
// =====================
const MediaScanner = (() => {
  let cached = null; // {photos:[], videos:[]}
  let cachedAt = 0;

  function getPackageRoot() {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.getPackageDirectoryEntry((root) => {
          if (!root) reject(new Error("getPackageDirectoryEntry returned null"));
          else resolve(root);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function getDirectory(root, path) {
    return new Promise((resolve) => {
      root.getDirectory(
        path,
        { create: false },
        (dir) => resolve(dir),
        () => resolve(null)
      );
    });
  }

  function readAllEntries(dirEntry) {
    return new Promise((resolve, reject) => {
      const reader = dirEntry.createReader();
      const all = [];

      const loop = () => {
        reader.readEntries(
          (batch) => {
            if (!batch || batch.length === 0) return resolve(all);
            all.push(...batch);
            loop();
          },
          (err) => reject(err)
        );
      };

      loop();
    });
  }

  async function walkDir(dirEntry, basePath, extsSet) {
    const out = [];
    const entries = await readAllEntries(dirEntry);

    for (const e of entries) {
      if (e.isFile) {
        const name = e.name || "";
        const dot = name.lastIndexOf(".");
        const ext = dot >= 0 ? name.slice(dot).toLowerCase() : "";
        if (extsSet.has(ext)) out.push(`${basePath}/${name}`);
      } else if (e.isDirectory) {
        const childBase = `${basePath}/${e.name}`;
        const child = await walkDir(e, childBase, extsSet);
        out.push(...child);
      }
    }

    return out;
  }

  async function scanOnce() {
    const root = await getPackageRoot();

    const photosDir = await getDirectory(root, MEDIA_DIRS.photos);
    const videosDir = await getDirectory(root, MEDIA_DIRS.videos);

    const photos = photosDir ? await walkDir(photosDir, MEDIA_DIRS.photos, EXT.photos) : [];
    const videos = videosDir ? await walkDir(videosDir, MEDIA_DIRS.videos, EXT.videos) : [];

    // stable ordering helps debugging
    photos.sort();
    videos.sort();

    console.log("[media] photos:", photos.length, photos);
    console.log("[media] videos:", videos.length, videos);

    return { photos, videos };
  }

  // Cache in-memory (per tab) so we don’t traverse filesystem multiple times
  async function getMedia() {
    if (cached && Date.now() - cachedAt < 60_000) {
      return cached;
    }
    cached = await scanOnce();
    cachedAt = Date.now();
    return cached;
  }

  return { getMedia };
})();


// =====================
// Background
// =====================
const Background = (() => {
  async function showRandomPhoto(photos) {
    const img = $("bgImage");
    const video = $("bgVideo");

    try { video.pause(); } catch {}
    video.removeAttribute("src");
    video.load();
    setVideoVisible(false);

    if (!photos.length) return false;

    // Try a few random picks
    for (let i = 0; i < Math.min(10, photos.length); i++) {
      const path = pickRandom(photos);
      const url = extUrl(path);

      const ok = await new Promise((resolve) => {
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = url;
      });

      if (ok) {
        setImageVisible(true);
        return true;
      }
    }

    return false;
  }

  async function showRandomVideo(videos) {
    const video = $("bgVideo");

    setImageVisible(false);
    if (!videos.length) return false;

    for (let i = 0; i < Math.min(10, videos.length); i++) {
      const path = pickRandom(videos);
      const url = extUrl(path);

      const ok = await new Promise((resolve) => {
        const onCanPlay = () => cleanup(true);
        const onErr = () => cleanup(false);

        function cleanup(result) {
          video.removeEventListener("canplay", onCanPlay);
          video.removeEventListener("error", onErr);
          resolve(result);
        }

        video.loop = true;   // requirement: loop forever if video chosen
        video.muted = true;  // required for autoplay
        video.playsInline = true;
        video.src = url;

        video.addEventListener("canplay", onCanPlay);
        video.addEventListener("error", onErr);
        video.load();
      });

      if (!ok) continue;

      setVideoVisible(true);
      try {
        await video.play();
        return true;
      } catch (e) {
        console.warn("[video] autoplay failed:", e);
        setVideoVisible(false);
        await sleep(50);
      }
    }

    return false;
  }

  async function init() {
    const { photos, videos } = await MediaScanner.getMedia();

    const hasPhotos = photos.length > 0;
    const hasVideos = videos.length > 0;

    if (!hasPhotos && !hasVideos) {
      console.warn("[media] No photos/videos found. Check folders: media/photos, media/videos");
      showFallbackGradient();
      return;
    }

    // per tab open: random photo OR random video
    let mode = Math.random() < 0.5 ? "photo" : "video";
    if (mode === "photo" && !hasPhotos) mode = "video";
    if (mode === "video" && !hasVideos) mode = "photo";

    let ok = false;
    if (mode === "video") ok = await showRandomVideo(videos);
    if (!ok) ok = await showRandomPhoto(photos);

    if (!ok) showFallbackGradient();
  }

  return { init };
})();


// =====================
// Favicon cache (120 hours) - CORS-safe display with persistent data URLs.
// We store successful favicon responses in chrome.storage.local so each icon is
// reused for 120 hours instead of being downloaded on every new-tab open.
// =====================
const FaviconCache = (() => {
  const PENDING = new Map();

  function normalizePageUrl(pageUrl) {
    try {
      const url = new URL(pageUrl);
      if (!url.protocol || !url.hostname) return pageUrl;
      return url.href;
    } catch {
      try {
        return new URL(`https://${pageUrl}`).href;
      } catch {
        return pageUrl;
      }
    }
  }

  function originKey(pageUrl) {
    try {
      return new URL(normalizePageUrl(pageUrl)).origin;
    } catch {
      return pageUrl;
    }
  }

  function storageGet(key) {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (res) => resolve(res[key] || null));
    });
  }

  function storageSet(obj) {
    return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
  }

  function googleFaviconUrl(pageUrl) {
    return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(pageUrl)}&sz=64`;
  }

  function directFaviconIco(pageUrl) {
    try {
      const u = new URL(normalizePageUrl(pageUrl));
      return `${u.origin}/favicon.ico`;
    } catch {
      return "";
    }
  }

  function versionFor(ts) {
    return Math.floor(ts / FAVICON_TTL_MS);
  }

  function fallbackUrls(pageUrl) {
    const normalized = normalizePageUrl(pageUrl);
    const version = versionFor(Date.now());
    const urls = [`${googleFaviconUrl(normalized)}&v=${version}`];
    const direct = directFaviconIco(normalized);
    if (direct) urls.push(`${direct}?v=${version}`);
    return urls;
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("Failed to read favicon"));
      reader.readAsDataURL(blob);
    });
  }

  async function fetchDataUrl(pageUrl) {
    const normalized = normalizePageUrl(pageUrl);
    const res = await fetch(googleFaviconUrl(normalized), {
      cache: "reload",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });

    if (!res.ok) throw new Error(`Favicon fetch failed (${res.status})`);

    const blob = await res.blob();
    if (!blob || blob.size === 0) throw new Error("Empty favicon response");
    if (blob.size > FAVICON_MAX_BYTES) throw new Error("Favicon response is too large");

    return blobToDataUrl(blob);
  }

  async function getCachedDataUrl(pageUrl) {
    const key = `favicon:${originKey(pageUrl)}`;
    const now = Date.now();
    const cached = await storageGet(key);

    if (cached?.dataUrl && cached?.expiresAt && cached.expiresAt > now) {
      return cached.dataUrl;
    }

    if (!PENDING.has(key)) {
      PENDING.set(
        key,
        (async () => {
          const dataUrl = await fetchDataUrl(pageUrl);
          await storageSet({
            [key]: {
              dataUrl,
              cachedAt: Date.now(),
              expiresAt: Date.now() + FAVICON_TTL_MS,
            },
          });
          return dataUrl;
        })().finally(() => PENDING.delete(key))
      );
    }

    try {
      return await PENDING.get(key);
    } catch (e) {
      console.warn("[favicon] cache refresh failed; using browser-cache fallback", pageUrl, e);
      return cached?.dataUrl || "";
    }
  }

  function useExternalFallback(imgEl, pageUrl) {
    const urls = fallbackUrls(pageUrl);
    let index = 0;

    const loadNext = () => {
      const next = urls[index++];
      if (!next) {
        imgEl.removeAttribute("src");
        imgEl.classList.add("favicon-missing");
        return;
      }
      imgEl.src = next;
    };

    imgEl.onerror = loadNext;
    loadNext();
  }

  async function setImg(imgEl, pageUrl) {
    imgEl.classList.remove("favicon-missing");

    try {
      const dataUrl = await getCachedDataUrl(pageUrl);
      if (dataUrl) {
        imgEl.onerror = () => useExternalFallback(imgEl, pageUrl);
        imgEl.src = dataUrl;
        return;
      }
    } catch (e) {
      console.warn("[favicon] cache lookup failed; using browser-cache fallback", pageUrl, e);
    }

    useExternalFallback(imgEl, pageUrl);
  }

  return { setImg };
})();

// =====================
// Links (Grouped folders)
// =====================
const LinksUI = (() => {
  async function loadLinksJson() {
    const res = await fetch(extUrl("data/links.json"), { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load data/links.json (${res.status})`);
    return res.json();
  }

  function showLinksError(msg) {
    const groups = $("groups");
    groups.innerHTML = `<div style="padding:12px;color:rgba(255,255,255,0.8);border:1px solid rgba(255,255,255,0.12);border-radius:12px;background:rgba(255,255,255,0.06)">
      ${msg}
    </div>`;
  }

  function renderGroups(data) {
    const title = typeof data.title === "string" ? data.title : "Quick Links";
    const groups = Array.isArray(data.groups) ? data.groups : [];

    $("title").textContent = title;

    const container = $("groups");
    container.innerHTML = "";

    for (const g of groups) {
      const name = g?.name ?? "Group";
      const icon = g?.icon ?? "📁";
      const links = Array.isArray(g?.links) ? g.links : [];

      const groupEl = document.createElement("div");
      groupEl.className = "group";

      const headerBtn = document.createElement("button");
      headerBtn.className = "group-header";
      headerBtn.type = "button";

      const left = document.createElement("div");
      left.className = "group-left";

      const iconEl = document.createElement("div");
      iconEl.className = "group-icon";
      iconEl.textContent = icon;

      const nameEl = document.createElement("div");
      nameEl.className = "group-name";
      nameEl.textContent = name;

      left.appendChild(iconEl);
      left.appendChild(nameEl);

      const countEl = document.createElement("div");
      countEl.className = "group-count";
      countEl.textContent = `${links.length}`;

      headerBtn.appendChild(left);
      headerBtn.appendChild(countEl);

      const body = document.createElement("div");
      body.className = "group-body";

      for (const item of links) {
        if (!item?.url || !item?.label) continue;

        const a = document.createElement("a");
        a.className = "link-item";
        a.href = item.url;
        a.target = "_self";
        a.rel = "noopener noreferrer";

        const fav = document.createElement("img");
        fav.className = "favicon";
        fav.alt = "";
        fav.loading = "lazy";
        fav.referrerPolicy = "no-referrer";

        // Cached favicon (120 hours)
        FaviconCache.setImg(fav, item.url);

        const text = document.createElement("div");
        text.className = "link-text";

        const label = document.createElement("div");
        label.className = "link-label";
        label.textContent = item.label;

        const note = document.createElement("div");
        note.className = "link-note";
        note.textContent = item.note || item.url;

        text.appendChild(label);
        text.appendChild(note);

        a.appendChild(fav);
        a.appendChild(text);
        body.appendChild(a);
      }

      headerBtn.addEventListener("click", () => {
        // close others
        for (const other of container.querySelectorAll(".group.open")) {
          if (other !== groupEl) other.classList.remove("open");
        }
        groupEl.classList.toggle("open");
      });

      groupEl.appendChild(headerBtn);
      groupEl.appendChild(body);
      container.appendChild(groupEl);
    }

    if (groups.length === 0) showLinksError("No groups found in data/links.json");
  }

  async function init() {
    try {
      const data = await loadLinksJson();
      renderGroups(data);
    } catch (e) {
      console.error(e);
      showLinksError("Failed to load data/links.json (check path + JSON format).");
    }
  }

  return { init };
})();


// =====================
// Widgets modal
// =====================
const WidgetsUI = (() => {
  function init() {
    let btn, modal, closeBtn;
    try {
      btn = $("widgetsBtn");
      modal = $("widgetsModal");
      closeBtn = $("widgetsClose");
    } catch {
      return;
    }

    const open = () => modal.classList.remove("hidden");
    const close = () => modal.classList.add("hidden");

    btn.addEventListener("click", open);
    closeBtn.addEventListener("click", close);

    modal.addEventListener("click", (e) => {
      if (e.target && e.target.classList.contains("modal-backdrop")) close();
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });
  }

  return { init };
})();


// =====================
// Boot
// =====================
(async function main() {
  // background first (fast)
  Background.init().catch((e) => {
    console.error(e);
    showFallbackGradient();
  });

  // links + widgets
  LinksUI.init();
  WidgetsUI.init();
})();
