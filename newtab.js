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
const FAVICON_MAX_BYTES = 256 * 1024;


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

  async function loadMediaManifest() {
    const res = await fetch(extUrl("data/media.json"), { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load data/media.json (${res.status})`);

    const data = await res.json();
    return {
      photos: Array.isArray(data.photos) ? data.photos : [],
      videos: Array.isArray(data.videos) ? data.videos : [],
    };
  }

  async function scanPackageMedia() {
    const root = await getPackageRoot();

    const photosDir = await getDirectory(root, MEDIA_DIRS.photos);
    const videosDir = await getDirectory(root, MEDIA_DIRS.videos);

    return {
      photos: photosDir ? await walkDir(photosDir, MEDIA_DIRS.photos, EXT.photos) : [],
      videos: videosDir ? await walkDir(videosDir, MEDIA_DIRS.videos, EXT.videos) : [],
    };
  }

  async function scanOnce() {
    let media;

    try {
      media = await loadMediaManifest();
    } catch (e) {
      console.warn("[media] data/media.json failed; scanning packaged media folders", e);
      media = { photos: [], videos: [] };
    }

    if (media.photos.length === 0 && media.videos.length === 0) {
      try {
        media = await scanPackageMedia();
      } catch (e) {
        console.warn("[media] package scan failed", e);
      }
    }

    // stable ordering helps debugging
    media.photos.sort();
    media.videos.sort();

    console.log("[media] photos:", media.photos.length, media.photos);
    console.log("[media] videos:", media.videos.length, media.videos);

    return media;
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
// Favicon cache (120 hours)
// Multi-source resolver:
// 1) cached data URL from chrome.storage.local
// 2) page-declared icons / root favicon files (cached for 120h)
// 3) Chrome MV3 /_favicon/ provider
// 4) external favicon CDNs as last-resort display fallbacks
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

  function pageOrigin(pageUrl) {
    try {
      return new URL(normalizePageUrl(pageUrl)).origin;
    } catch {
      return "";
    }
  }

  function pageHostname(pageUrl) {
    try {
      return new URL(normalizePageUrl(pageUrl)).hostname;
    } catch {
      return "";
    }
  }

  function originKey(pageUrl) {
    return pageOrigin(pageUrl) || pageUrl;
  }

  function storageGet(key) {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (res) => resolve(res[key] || null));
    });
  }

  function storageSet(obj) {
    return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
  }

  function chromeFaviconUrl(pageUrl, size = 64) {
    const url = new URL(chrome.runtime.getURL("/_favicon/"));
    url.searchParams.set("pageUrl", normalizePageUrl(pageUrl));
    url.searchParams.set("size", String(size));
    return url.toString();
  }

  function googleFaviconUrl(pageUrl) {
    return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(normalizePageUrl(pageUrl))}&sz=64`;
  }

  function duckDuckGoFaviconUrl(pageUrl) {
    const host = pageHostname(pageUrl);
    return host ? `https://icons.duckduckgo.com/ip3/${host}.ico` : "";
  }

  function rootIconUrls(pageUrl) {
    const origin = pageOrigin(pageUrl);
    if (!origin) return [];

    return [
      `${origin}/favicon.ico`,
      `${origin}/favicon.png`,
      `${origin}/apple-touch-icon.png`,
      `${origin}/apple-touch-icon-precomposed.png`,
    ];
  }

  function emergencyFallbackDataUrl(pageUrl) {
    const host = pageHostname(pageUrl) || "?";
    const label = (host.replace(/^www\./, "").charAt(0) || "?").toUpperCase();
    const hue = [...host].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="hsl(${hue} 70% 42%)"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" font-weight="700" fill="white">${label}</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function displayFallbackUrls(pageUrl) {
    return [
      chromeFaviconUrl(pageUrl),
      ...rootIconUrls(pageUrl),
      duckDuckGoFaviconUrl(pageUrl),
      googleFaviconUrl(pageUrl),
      emergencyFallbackDataUrl(pageUrl),
    ].filter(Boolean);
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("Failed to read favicon"));
      reader.readAsDataURL(blob);
    });
  }

  async function fetchBlob(url, options = {}) {
    const res = await fetch(url, {
      cache: "reload",
      credentials: "omit",
      redirect: "follow",
      ...options,
    });

    if (!res.ok) throw new Error(`Favicon candidate failed (${res.status})`);

    const blob = await res.blob();
    const contentType = blob.type || res.headers.get("content-type") || "";
    if (!blob || blob.size === 0) throw new Error("Empty favicon response");
    if (blob.size > FAVICON_MAX_BYTES) throw new Error("Favicon response is too large");
    const lowerType = contentType.toLowerCase();
    const knownImageType =
      lowerType.startsWith("image/") ||
      lowerType.includes("octet-stream") ||
      lowerType.includes("svg") ||
      lowerType.includes("xml");

    if (contentType && !knownImageType) {
      throw new Error(`Not an image favicon response (${contentType})`);
    }

    return blob;
  }

  async function fetchDataUrl(url, options) {
    return blobToDataUrl(await fetchBlob(url, options));
  }

  function scoreIconLink(linkEl) {
    const rel = (linkEl.getAttribute("rel") || "").toLowerCase();
    const sizes = (linkEl.getAttribute("sizes") || "").toLowerCase();
    const type = (linkEl.getAttribute("type") || "").toLowerCase();
    let score = 0;

    if (rel.includes("icon")) score += 10;
    if (rel.includes("apple-touch-icon")) score += 8;
    if (rel.includes("shortcut")) score += 2;
    if (type.includes("png")) score += 4;
    if (type.includes("svg")) score += 3;
    if (type.includes("ico") || type.includes("icon")) score += 2;

    const match = sizes.match(/(\d+)x\d+/);
    if (match) score += Math.min(Number(match[1]) / 16, 8);
    if (sizes === "any") score += 6;

    return score;
  }

  async function pageDeclaredIconUrls(pageUrl) {
    const normalized = normalizePageUrl(pageUrl);
    const res = await fetch(normalized, {
      cache: "reload",
      credentials: "omit",
      redirect: "follow",
    });

    if (!res.ok) throw new Error(`Page fetch failed (${res.status})`);

    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const links = [...doc.querySelectorAll('link[rel][href]')]
      .filter((link) => (link.getAttribute("rel") || "").toLowerCase().includes("icon"))
      .sort((a, b) => scoreIconLink(b) - scoreIconLink(a));

    return links
      .map((link) => {
        try {
          return new URL(link.getAttribute("href"), normalized).href;
        } catch {
          return "";
        }
      })
      .filter(Boolean);
  }

  async function candidateUrls(pageUrl) {
    const urls = [];

    try {
      urls.push(...(await pageDeclaredIconUrls(pageUrl)));
    } catch (e) {
      console.warn("[favicon] page icon discovery failed", pageUrl, e);
    }

    urls.push(...rootIconUrls(pageUrl));
    urls.push(chromeFaviconUrl(pageUrl));
    urls.push(duckDuckGoFaviconUrl(pageUrl));
    urls.push(googleFaviconUrl(pageUrl));

    return [...new Set(urls.filter(Boolean))];
  }

  async function resolveFaviconDataUrl(pageUrl) {
    const candidates = await candidateUrls(pageUrl);
    let lastError = null;

    for (const url of candidates) {
      try {
        const options = url.startsWith(chrome.runtime.getURL("/"))
          ? { credentials: "same-origin" }
          : undefined;
        return await fetchDataUrl(url, options);
      } catch (e) {
        lastError = e;
        console.warn("[favicon] candidate failed", url, e);
      }
    }

    throw lastError || new Error("No favicon candidates available");
  }

  async function refreshCache(pageUrl, key) {
    if (!PENDING.has(key)) {
      PENDING.set(
        key,
        (async () => {
          const dataUrl = await resolveFaviconDataUrl(pageUrl);
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

    return PENDING.get(key);
  }

  function useDisplayFallbacks(imgEl, pageUrl) {
    const urls = displayFallbackUrls(pageUrl);
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
    const key = `favicon:${originKey(pageUrl)}`;
    const now = Date.now();
    const cached = await storageGet(key);

    imgEl.classList.remove("favicon-missing");

    if (cached?.dataUrl) {
      imgEl.onerror = () => useDisplayFallbacks(imgEl, pageUrl);
      imgEl.src = cached.dataUrl;
    } else {
      // Show something immediately while the persistent 120-hour cache is built.
      useDisplayFallbacks(imgEl, pageUrl);
    }

    if (cached?.dataUrl && cached?.expiresAt && cached.expiresAt > now) return;

    try {
      const dataUrl = await refreshCache(pageUrl, key);
      if (dataUrl) {
        imgEl.onerror = () => useDisplayFallbacks(imgEl, pageUrl);
        imgEl.src = dataUrl;
      }
    } catch (e) {
      console.warn("[favicon] all cache refresh strategies failed", pageUrl, e);
    }
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
