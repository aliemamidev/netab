// Storage layer: chrome.storage.local in the extension, localStorage when the
// pages are opened as plain files (handy for design previews and tests).

import { isExtension, deepMerge, clone, isPlainObject } from "./utils.js";

export const KEYS = {
  links: "netab.links.v2",
  media: "netab.media.v2",
  legacyUi: "netab.ui.v2",
  settings: "netab.settings.v3",
  todos: "netab.todos.v1",
  notes: "netab.notes.v1",
  readLater: "netab.readLater.v1",
  sessions: "netab.sessions.v1",
  focusState: "netab.focus.state.v1",
  focusStats: "netab.focus.stats.v1",
  focusAllow: "netab.focus.allow.v1",
  daily: "netab.daily.v1",
  weatherCache: "netab.cache.weather.v1",
  marketsCache: "netab.cache.markets.v1",
  fxCache: "netab.cache.fx.v1",
  bgState: "netab.bg.state.v1",
};

export const WIDGET_IDS = [
  "daily",
  "todo",
  "focus",
  "weather",
  "calendar",
  "notes",
  "markets",
  "readlater",
  "sessions",
  "worldclock",
  "system",
];

export const DEFAULT_SETTINGS = {
  version: 3,
  lang: "auto",
  name: "",
  theme: "dark",
  accent: "#7c9cff",
  glass: 18,
  cardOpacity: 58,
  radius: 18,
  fontScale: 100,
  clock: { show: true, format: "auto", seconds: false, greeting: true, date: true },
  calendar: { primary: "auto", secondary: "auto", weekStart: "auto" },
  search: {
    show: true,
    engine: "default",
    newTab: false,
    custom: [],
    sources: { links: true, tabs: true, bookmarks: true, history: true, commands: true, calc: true },
  },
  links: { show: true, style: "tiles", newTab: false, topSites: false, lastGroup: "" },
  widgets: {
    show: true,
    order: [...WIDGET_IDS],
    enabled: {
      daily: true,
      todo: true,
      focus: true,
      weather: false,
      calendar: true,
      notes: true,
      markets: false,
      readlater: true,
      sessions: true,
      worldclock: false,
      system: false,
    },
  },
  weather: { city: null, units: "c" },
  markets: { coins: ["bitcoin", "ethereum", "pax-gold", "tether"], fiat: ["EUR", "GBP", "AED", "TRY"] },
  worldClocks: [
    { id: "wc-london", label: "London", tz: "Europe/London" },
    { id: "wc-ny", label: "New York", tz: "America/New_York" },
    { id: "wc-tokyo", label: "Tokyo", tz: "Asia/Tokyo" },
  ],
  focus: {
    work: 25,
    short: 5,
    long: 15,
    longEvery: 4,
    autoBreak: true,
    autoWork: false,
    sound: true,
    notify: true,
    block: true,
    dailyGoal: 8,
    blocklist: ["youtube.com", "instagram.com", "x.com", "twitter.com", "facebook.com", "reddit.com", "tiktok.com"],
  },
  background: { source: "gradient", gradient: "aurora", color: "#0b0d14", rotate: "tab" },
  zen: false,
  onboarded: false,
};

// ---------------------------------------------------------------------------
// Low level area

const memoryListeners = new Set();

function localGet(keys) {
  const out = {};
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) out[key] = JSON.parse(raw);
    } catch {
      /* ignore malformed */
    }
  }
  return out;
}

if (!isExtension && typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (!event.key) return;
    let newValue;
    try {
      newValue = event.newValue === null ? undefined : JSON.parse(event.newValue);
    } catch {
      newValue = undefined;
    }
    for (const cb of memoryListeners) cb({ [event.key]: { newValue } });
  });
}

export async function getMany(keys) {
  if (isExtension && chrome.storage?.local) return chrome.storage.local.get(keys);
  return localGet(keys);
}

export async function get(key, fallback = null) {
  const res = await getMany([key]);
  return res[key] === undefined ? clone(fallback) : res[key];
}

export async function set(key, value) {
  if (isExtension && chrome.storage?.local) {
    await chrome.storage.local.set({ [key]: value });
    return;
  }
  localStorage.setItem(key, JSON.stringify(value));
  for (const cb of memoryListeners) cb({ [key]: { newValue: clone(value) } });
}

export async function setMany(values) {
  if (isExtension && chrome.storage?.local) {
    await chrome.storage.local.set(values);
    return;
  }
  for (const [key, value] of Object.entries(values)) await set(key, value);
}

export async function remove(keys) {
  const list = Array.isArray(keys) ? keys : [keys];
  if (isExtension && chrome.storage?.local) {
    await chrome.storage.local.remove(list);
    return;
  }
  for (const key of list) localStorage.removeItem(key);
  for (const cb of memoryListeners) cb(Object.fromEntries(list.map((k) => [k, { newValue: undefined }])));
}

/** Serialised read-modify-write per key inside this context. */
const queues = new Map();
export function update(key, mutator, fallback = null) {
  const prev = queues.get(key) || Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(async () => {
      const current = await get(key, fallback);
      const result = await mutator(current);
      const value = result === undefined ? current : result;
      await set(key, value);
      return value;
    });
  queues.set(key, next);
  return next;
}

/** Subscribe to changes of one or more keys. Returns an unsubscribe function. */
export function subscribe(keys, callback) {
  const wanted = new Set(Array.isArray(keys) ? keys : [keys]);
  const handler = (changes, area = "local") => {
    if (area !== "local") return;
    for (const [key, change] of Object.entries(changes)) {
      if (wanted.has(key)) callback(change.newValue, key, change.oldValue);
    }
  };
  if (isExtension && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }
  memoryListeners.add(handler);
  return () => memoryListeners.delete(handler);
}

// ---------------------------------------------------------------------------
// Settings

export function normalizeSettings(raw) {
  const merged = deepMerge(DEFAULT_SETTINGS, isPlainObject(raw) ? raw : {});
  // Keep widget order complete and free of unknown ids.
  const order = Array.isArray(merged.widgets.order) ? merged.widgets.order.filter((id) => WIDGET_IDS.includes(id)) : [];
  for (const id of WIDGET_IDS) if (!order.includes(id)) order.push(id);
  merged.widgets.order = [...new Set(order)];
  for (const id of WIDGET_IDS) {
    if (typeof merged.widgets.enabled[id] !== "boolean") merged.widgets.enabled[id] = DEFAULT_SETTINGS.widgets.enabled[id];
  }
  if (!["dark", "light", "auto"].includes(merged.theme)) merged.theme = "dark";
  if (!["auto", "en", "fa"].includes(merged.lang)) merged.lang = "auto";
  if (!/^#[0-9a-f]{6}$/i.test(merged.accent)) merged.accent = DEFAULT_SETTINGS.accent;
  if (!Array.isArray(merged.focus.blocklist)) merged.focus.blocklist = clone(DEFAULT_SETTINGS.focus.blocklist);
  if (!Array.isArray(merged.worldClocks)) merged.worldClocks = clone(DEFAULT_SETTINGS.worldClocks);
  if (!Array.isArray(merged.search.custom)) merged.search.custom = [];
  for (const k of ["work", "short", "long"]) {
    merged.focus[k] = Math.round(Math.min(180, Math.max(1, Number(merged.focus[k]) || DEFAULT_SETTINGS.focus[k])));
  }
  merged.focus.longEvery = Math.round(Math.min(12, Math.max(2, Number(merged.focus.longEvery) || 4)));
  return merged;
}

export async function loadSettings() {
  const res = await getMany([KEYS.settings, KEYS.legacyUi]);
  const raw = res[KEYS.settings];
  // NeTab 2.x users: keep their wallpapers and skip the welcome tour.
  if (!raw && res[KEYS.legacyUi]) return normalizeSettings({ onboarded: true, background: { source: "media" } });
  return normalizeSettings(raw);
}

export async function saveSettings(patchOrFn) {
  return update(KEYS.settings, (current) => {
    const base = normalizeSettings(current);
    const next = typeof patchOrFn === "function" ? patchOrFn(clone(base)) || base : deepMerge(base, patchOrFn);
    return normalizeSettings(next);
  });
}

// ---------------------------------------------------------------------------
// Lists (todos, notes, read later, sessions)

export async function getList(key) {
  const value = await get(key, []);
  return Array.isArray(value) ? value : [];
}

export function updateList(key, mutator) {
  return update(
    key,
    async (current) => {
      const list = Array.isArray(current) ? current : [];
      const result = await mutator(list);
      return Array.isArray(result) ? result : list;
    },
    [],
  );
}

/** Everything a full backup needs (uploaded media blobs are not included). */
export const BACKUP_KEYS = [
  KEYS.links,
  KEYS.media,
  KEYS.settings,
  KEYS.todos,
  KEYS.notes,
  KEYS.readLater,
  KEYS.sessions,
  KEYS.focusStats,
  KEYS.daily,
];
