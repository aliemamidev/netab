// Links + media configuration (compatible with NeTab 2.x data and JSON files).

import { uid, asBool, basename, clamp, extUrl, isExtension } from "./utils.js";
import { KEYS, get, set, remove } from "./storage.js";

const MEDIA_DIRS = { photos: "media/photos", videos: "media/videos" };
export const MEDIA_EXT = {
  photos: new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".avif"]),
  videos: new Set([".mp4", ".webm", ".ogg", ".mov"]),
};

export function fileKind(name, mime = "") {
  const m = String(mime).toLowerCase();
  if (m.startsWith("image/")) return "photo";
  if (m.startsWith("video/")) return "video";
  const dot = String(name).lastIndexOf(".");
  const ext = dot >= 0 ? String(name).slice(dot).toLowerCase() : "";
  if (MEDIA_EXT.photos.has(ext)) return "photo";
  if (MEDIA_EXT.videos.has(ext)) return "video";
  return "";
}

export function normalizeLink(item) {
  return {
    id: item?.id || uid("link"),
    label: String(item?.label || item?.title || "New Link"),
    note: String(item?.note || ""),
    url: String(item?.url || "https://example.com/"),
    icon: String(item?.icon || ""),
    enabled: asBool(item?.enabled, true),
  };
}

export function normalizeGroup(group) {
  return {
    id: group?.id || uid("group"),
    name: String(group?.name || "New Category"),
    icon: String(group?.icon || "📁"),
    enabled: asBool(group?.enabled, true),
    links: Array.isArray(group?.links) ? group.links.map(normalizeLink) : [],
  };
}

export function normalizeLinks(data) {
  return {
    title: String(data?.title || "Quick Links"),
    groups: Array.isArray(data?.groups) ? data.groups.map(normalizeGroup) : [],
  };
}

function normalizeMediaItem(item, kind) {
  if (typeof item === "string") {
    return { id: uid(kind), source: "packaged", kind, name: basename(item), path: item, enabled: true };
  }
  return {
    id: item?.id || uid(kind),
    source: item?.source || (item?.path ? "packaged" : "uploaded"),
    kind: item?.kind || kind,
    name: String(item?.name || basename(item?.path) || (kind === "photo" ? "Photo" : "Video")),
    path: String(item?.path || ""),
    mime: String(item?.mime || ""),
    size: Number(item?.size || 0),
    createdAt: item?.createdAt || new Date().toISOString(),
    enabled: asBool(item?.enabled, true),
  };
}

export function normalizeMedia(data) {
  const s = data?.settings || {};
  return {
    settings: {
      mode: ["mixed", "photos", "videos"].includes(s.mode) ? s.mode : "mixed",
      videoVolume: clamp(s.videoVolume ?? 0, 0, 100),
      shadeStrength: clamp(s.shadeStrength ?? 45, 0, 90),
      blur: clamp(s.blur ?? 0, 0, 24),
      scale: clamp(s.scale ?? 102, 100, 115),
    },
    photos: Array.isArray(data?.photos) ? data.photos.map((x) => normalizeMediaItem(x, "photo")) : [],
    videos: Array.isArray(data?.videos) ? data.videos.map((x) => normalizeMediaItem(x, "video")) : [],
  };
}

async function fetchJson(path) {
  const res = await fetch(extUrl(path), { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return res.json();
}

async function firstJson(paths) {
  const errors = [];
  for (const path of paths) {
    try {
      return { data: await fetchJson(path), source: path };
    } catch (e) {
      errors.push(`${path}: ${e.message}`);
    }
  }
  throw new Error(errors.join(" | "));
}

async function scanPackageMedia() {
  if (!isExtension || !chrome.runtime.getPackageDirectoryEntry) return { photos: [], videos: [] };
  try {
    const root = await new Promise((resolve, reject) => chrome.runtime.getPackageDirectoryEntry((e) => (e ? resolve(e) : reject(new Error("no entry")))));
    const getDir = (path) => new Promise((resolve) => root.getDirectory(path, { create: false }, resolve, () => resolve(null)));
    const readAll = (dir) =>
      new Promise((resolve, reject) => {
        const reader = dir.createReader();
        const all = [];
        const loop = () =>
          reader.readEntries((batch) => {
            if (!batch?.length) return resolve(all);
            all.push(...batch);
            loop();
          }, reject);
        loop();
      });
    const walk = async (dir, base, exts, kind) => {
      const out = [];
      for (const entry of await readAll(dir)) {
        if (entry.isFile) {
          const dot = entry.name.lastIndexOf(".");
          if (exts.has(entry.name.slice(dot).toLowerCase())) out.push(normalizeMediaItem(`${base}/${entry.name}`, kind));
        } else if (entry.isDirectory) out.push(...(await walk(entry, `${base}/${entry.name}`, exts, kind)));
      }
      return out;
    };
    const p = await getDir(MEDIA_DIRS.photos);
    const v = await getDir(MEDIA_DIRS.videos);
    return {
      photos: p ? await walk(p, MEDIA_DIRS.photos, MEDIA_EXT.photos, "photo") : [],
      videos: v ? await walk(v, MEDIA_DIRS.videos, MEDIA_EXT.videos, "video") : [],
    };
  } catch {
    return { photos: [], videos: [] };
  }
}

export async function loadLinks({ ignoreStored = false, publicOnly = false } = {}) {
  if (!ignoreStored) {
    const stored = await get(KEYS.links, null);
    if (stored) return { links: normalizeLinks(stored), source: "storage" };
  }
  const { data, source } = await firstJson(publicOnly ? ["data/links.json"] : ["data/links.local.json", "data/links.json"]);
  const links = normalizeLinks(data);
  // Persist the first load so later tabs read storage instead of probing JSON files.
  if (!ignoreStored) await set(KEYS.links, links);
  return { links, source };
}

export async function loadMedia({ ignoreStored = false, publicOnly = false } = {}) {
  if (!ignoreStored) {
    const stored = await get(KEYS.media, null);
    if (stored) return { media: normalizeMedia(stored), source: "storage" };
  }
  const { data, source } = await firstJson(publicOnly ? ["data/media.json"] : ["data/media.local.json", "data/media.json"]);
  const media = normalizeMedia(data);
  if (!media.photos.length && !media.videos.length) Object.assign(media, await scanPackageMedia());
  if (!ignoreStored) await set(KEYS.media, media);
  return { media, source };
}

export async function saveLinks(links) {
  const normalized = normalizeLinks(links);
  await set(KEYS.links, normalized);
  return normalized;
}

export async function saveMedia(media) {
  const normalized = normalizeMedia(media);
  await set(KEYS.media, normalized);
  return normalized;
}

export async function resetLinksAndMedia() {
  await remove([KEYS.links, KEYS.media, KEYS.legacyUi]);
}

/** Add a page to a link group (creating an "Inbox" group if needed). */
export async function addLinkToGroup({ url, label, note = "", groupId = "" }) {
  const { links } = await loadLinks();
  let group = links.groups.find((g) => g.id === groupId) || links.groups[0];
  if (!group) {
    group = normalizeGroup({ id: "inbox", name: "Inbox", icon: "📥", links: [] });
    links.groups.push(group);
  }
  const link = normalizeLink({ label, url, note });
  group.links.push(link);
  await saveLinks(links);
  return { link, group };
}
