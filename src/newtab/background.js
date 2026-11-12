// Wallpaper engine: local photos/videos, uploaded media, animated gradient presets
// or a solid color. Supports per-tab / hourly / daily rotation and "next".

import { pickRandom, extUrl } from "../lib/utils.js";
import { KEYS, get, set } from "../lib/storage.js";
import { blobUrlFor } from "../lib/media-db.js";
import { app, updateSettings } from "./app.js";

export const GRADIENTS = ["aurora", "sunset", "ocean", "forest", "midnight", "ember", "candy", "paper"];

let media = null;
let currentId = null;

const $ = (id) => document.getElementById(id);

function applyMediaSettings() {
  const s = media?.settings || {};
  const root = document.documentElement.style;
  root.setProperty("--shade", String(s.shadeStrength ?? 45));
  root.setProperty("--bg-blur", String(s.blur ?? 0));
  root.setProperty("--bg-scale", String(s.scale ?? 102));
  const video = $("bgVideo");
  if (video) {
    video.volume = Math.min(1, Math.max(0, Number(s.videoVolume || 0) / 100));
    video.muted = Number(s.videoVolume || 0) <= 0;
  }
}

function pool() {
  const mode = media?.settings?.mode || "mixed";
  const photos = mode !== "videos" ? (media?.photos || []).filter((x) => x.enabled) : [];
  const videos = mode !== "photos" ? (media?.videos || []).filter((x) => x.enabled) : [];
  return [...photos, ...videos];
}

async function urlFor(item) {
  if (item.source === "uploaded") return blobUrlFor(item.id);
  return extUrl(item.path);
}

function hideAll() {
  $("bgImage").classList.remove("on");
  $("bgVideo").classList.remove("on");
  $("bgGradient").classList.remove("on");
}

function showGradient(preset) {
  const g = $("bgGradient");
  g.dataset.preset = preset;
  if (preset === "solid") g.style.setProperty("--bg-solid", app.settings.background.color);
  $("bgImage").classList.remove("on");
  const video = $("bgVideo");
  video.classList.remove("on");
  try {
    video.pause();
  } catch {
    /* ignore */
  }
  g.classList.add("on");
}

async function showPhoto(item) {
  const img = $("bgImage");
  const url = await urlFor(item);
  if (!url) return false;
  const ok = await new Promise((resolve) => {
    const probe = new Image();
    probe.onload = () => resolve(true);
    probe.onerror = () => resolve(false);
    probe.src = url;
  });
  if (!ok) return false;
  img.src = url;
  img.classList.add("on");
  $("bgGradient").classList.remove("on");
  const video = $("bgVideo");
  video.classList.remove("on");
  setTimeout(() => {
    if (!video.classList.contains("on")) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
  }, 800);
  return true;
}

async function showVideo(item) {
  const video = $("bgVideo");
  const url = await urlFor(item);
  if (!url) return false;
  const ok = await new Promise((resolve) => {
    const done = (result) => {
      video.removeEventListener("canplay", yes);
      video.removeEventListener("error", no);
      resolve(result);
    };
    const yes = () => done(true);
    const no = () => done(false);
    video.addEventListener("canplay", yes);
    video.addEventListener("error", no);
    video.src = url;
    video.load();
    setTimeout(() => done(false), 8000);
  });
  if (!ok) return false;
  applyMediaSettings();
  try {
    await video.play();
  } catch {
    video.muted = true;
    try {
      await video.play();
    } catch {
      return false;
    }
  }
  video.classList.add("on");
  $("bgImage").classList.remove("on");
  $("bgGradient").classList.remove("on");
  return true;
}

function bucket(rotate) {
  const now = new Date();
  if (rotate === "hour") return `${now.toDateString()} ${now.getHours()}`;
  if (rotate === "day") return now.toDateString();
  return null;
}

async function choose(forceNext) {
  const items = pool();
  if (!items.length) return null;
  const rotate = app.settings.background.rotate;
  const b = bucket(rotate);
  if (b && !forceNext) {
    const saved = await get(KEYS.bgState, null);
    if (saved?.bucket === b) {
      const found = items.find((x) => x.id === saved.id);
      if (found) return found;
    }
  }
  const candidates = items.length > 1 ? items.filter((x) => x.id !== currentId) : items;
  const pick = pickRandom(candidates);
  if (b || forceNext) await set(KEYS.bgState, { id: pick.id, bucket: b || bucket("hour") });
  return pick;
}

export async function showBackground({ next = false } = {}) {
  applyMediaSettings();
  const bg = app.settings.background;
  if (bg.source === "gradient") {
    if (next) {
      const others = GRADIENTS.filter((g) => g !== bg.gradient);
      await updateSettings({ background: { gradient: pickRandom(others) } });
      return;
    }
    return showGradient(bg.gradient);
  }
  if (bg.source === "color") return showGradient("solid");

  const item = await choose(next);
  if (!item) return showGradient("aurora");
  currentId = item.id;
  let ok = item.kind === "video" ? await showVideo(item) : await showPhoto(item);
  if (!ok) {
    // Fall back to any other working photo, then to a gradient.
    const photos = pool().filter((x) => x.kind === "photo" && x.id !== item.id);
    if (photos.length) ok = await showPhoto(pickRandom(photos));
  }
  if (!ok) showGradient("aurora");
}

export async function initBackground(initialMedia) {
  media = initialMedia;
  hideAll();
  await showBackground();
  document.addEventListener("visibilitychange", () => {
    const video = $("bgVideo");
    if (!video.classList.contains("on")) return;
    if (document.hidden) video.pause();
    else video.play().catch(() => {});
  });
}

export function setMedia(next, { refresh = true } = {}) {
  media = next;
  applyMediaSettings();
  if (refresh) showBackground();
}

export function getMedia() {
  return media;
}
