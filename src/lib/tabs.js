// Tab power tools: duplicates, sorting, grouping, sessions, memory saver.

import { hostname, uid, isHttpUrl } from "./utils.js";
import { KEYS, updateList } from "./storage.js";

const hasTabs = () => Boolean(globalThis.chrome?.tabs?.query);
const GROUP_COLORS = ["blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange", "grey"];

function normalizeForDupes(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.href.replace(/\/$/, "");
  } catch {
    return url;
  }
}

export async function tabStats() {
  if (!hasTabs()) return { tabs: 0, windows: 0, duplicates: 0, discardable: 0 };
  const tabs = await chrome.tabs.query({});
  const windows = new Set(tabs.map((t) => t.windowId)).size;
  const seen = new Set();
  let duplicates = 0;
  for (const t of tabs) {
    const key = normalizeForDupes(t.url || t.pendingUrl || "");
    if (!key) continue;
    if (seen.has(key)) duplicates += 1;
    else seen.add(key);
  }
  const discardable = tabs.filter((t) => !t.active && !t.discarded && !t.pinned && !t.audible).length;
  return { tabs: tabs.length, windows, duplicates, discardable };
}

export async function closeDuplicates() {
  const tabs = await chrome.tabs.query({});
  // Keep pinned/active copies first.
  tabs.sort((a, b) => Number(b.pinned) - Number(a.pinned) || Number(b.active) - Number(a.active) || a.index - b.index);
  const seen = new Set();
  const close = [];
  for (const t of tabs) {
    const key = normalizeForDupes(t.url || t.pendingUrl || "");
    if (!key || key.startsWith("chrome://newtab")) continue;
    if (seen.has(key)) close.push(t.id);
    else seen.add(key);
  }
  if (close.length) await chrome.tabs.remove(close);
  return close.length;
}

export async function sortByDomain(windowId) {
  const tabs = await chrome.tabs.query({ windowId: windowId ?? chrome.windows.WINDOW_ID_CURRENT });
  const pinnedCount = tabs.filter((t) => t.pinned).length;
  const movable = tabs.filter((t) => !t.pinned);
  movable.sort((a, b) => {
    const ha = hostname(a.url || "") || "~";
    const hb = hostname(b.url || "") || "~";
    return ha.localeCompare(hb) || (a.title || "").localeCompare(b.title || "");
  });
  for (let i = 0; i < movable.length; i += 1) {
    await chrome.tabs.move(movable[i].id, { index: pinnedCount + i });
  }
  return movable.length;
}

export async function groupByDomain(windowId) {
  if (!chrome.tabs.group || !chrome.tabGroups) return 0;
  const tabs = await chrome.tabs.query({ windowId: windowId ?? chrome.windows.WINDOW_ID_CURRENT, pinned: false });
  const byHost = new Map();
  for (const t of tabs) {
    const host = hostname(t.url || "");
    if (!host) continue;
    if (!byHost.has(host)) byHost.set(host, []);
    byHost.get(host).push(t.id);
  }
  let groups = 0;
  let colorIndex = 0;
  for (const [host, ids] of byHost) {
    if (ids.length < 2) continue;
    const groupId = await chrome.tabs.group({ tabIds: ids });
    const title = host.split(".").slice(-2, -1)[0] || host;
    await chrome.tabGroups.update(groupId, { title, color: GROUP_COLORS[colorIndex % GROUP_COLORS.length], collapsed: false });
    colorIndex += 1;
    groups += 1;
  }
  return groups;
}

export async function ungroupAll(windowId) {
  const tabs = await chrome.tabs.query({ windowId: windowId ?? chrome.windows.WINDOW_ID_CURRENT });
  const grouped = tabs.filter((t) => t.groupId !== undefined && t.groupId !== -1).map((t) => t.id);
  if (grouped.length) await chrome.tabs.ungroup(grouped);
  return grouped.length;
}

/** Free memory by discarding background tabs (they reload when clicked). */
export async function discardInactive() {
  const tabs = await chrome.tabs.query({ active: false, discarded: false, pinned: false, audible: false });
  let count = 0;
  for (const t of tabs) {
    if (!isHttpUrl(t.url || "")) continue;
    try {
      await chrome.tabs.discard(t.id);
      count += 1;
    } catch {
      /* some tabs refuse to discard (e.g. forms); skip */
    }
  }
  return count;
}

export async function mergeWindows() {
  const current = await chrome.windows.getCurrent();
  const tabs = await chrome.tabs.query({});
  const others = tabs.filter((t) => t.windowId !== current.id && !t.pinned).map((t) => t.id);
  if (others.length) await chrome.tabs.move(others, { windowId: current.id, index: -1 });
  return others.length;
}

export function sessionFromTabs(tabs, name) {
  const usable = tabs.filter((t) => isHttpUrl(t.url || ""));
  return {
    id: uid("session"),
    name: name || new Date().toLocaleString(),
    createdAt: new Date().toISOString(),
    tabs: usable.map((t) => ({ url: t.url, title: t.title || t.url, pinned: Boolean(t.pinned) })),
  };
}

export async function saveSession({ name, scope = "window", close = false } = {}) {
  const query = scope === "all" ? {} : { currentWindow: true };
  const tabs = await chrome.tabs.query(query);
  const session = sessionFromTabs(tabs, name);
  if (!session.tabs.length) return null;
  await updateList(KEYS.sessions, (list) => [session, ...list].slice(0, 100));
  if (close) {
    const keep = await chrome.tabs.create({ url: "chrome://newtab/", active: true });
    const ids = tabs.filter((t) => isHttpUrl(t.url || "") && t.id !== keep.id).map((t) => t.id);
    if (ids.length) await chrome.tabs.remove(ids);
  }
  return session;
}

export async function restoreSession(session, { newWindow = true } = {}) {
  const urls = (session?.tabs || []).map((t) => t.url).filter(isHttpUrl);
  if (!urls.length) return 0;
  if (newWindow && chrome.windows?.create) {
    await chrome.windows.create({ url: urls, focused: true });
  } else {
    for (const url of urls) await chrome.tabs.create({ url, active: false });
  }
  return urls.length;
}

export async function switchToTab(tab) {
  await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
}
