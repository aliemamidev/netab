// NeTab service worker: context menus, keyboard commands, focus timer engine,
// notifications, distraction blocking and the toolbar badge.

import { KEYS, get, set, update, updateList, loadSettings, subscribe } from "../lib/storage.js";
import { normalizeFocusState, complete, toggle, remainingMs, isFocusing, durationMs } from "../lib/focus.js";
import { setLang, t } from "../lib/i18n.js";
import { uid, hostname, hostMatches, isHttpUrl, todayKey } from "../lib/utils.js";
import { addLinkToGroup } from "../lib/config.js";

const ALARM_END = "netab-focus-end";
const ALARM_TICK = "netab-focus-tick";
const BLOCKED_PAGE = chrome.runtime.getURL("src/blocked/blocked.html");
const NEWTAB_PAGE = chrome.runtime.getURL("src/newtab/newtab.html");

// ---------------------------------------------------------------------------
// Context menus

async function buildMenus() {
  const settings = await loadSettings();
  setLang(settings.lang);
  await chrome.contextMenus.removeAll();
  const add = (props) => chrome.contextMenus.create(props, () => void chrome.runtime.lastError);
  add({ id: "netab-root", title: "NeTab", contexts: ["page", "link", "selection", "action"] });
  add({ id: "netab-add-link", parentId: "netab-root", title: t("menu.addLink"), contexts: ["page", "link"] });
  add({ id: "netab-read-later", parentId: "netab-root", title: t("menu.readLater"), contexts: ["page", "link"] });
  add({ id: "netab-sep-1", parentId: "netab-root", type: "separator", contexts: ["page", "link", "selection"] });
  add({ id: "netab-note", parentId: "netab-root", title: t("menu.saveNote"), contexts: ["selection"] });
  add({ id: "netab-todo", parentId: "netab-root", title: t("menu.addTodo"), contexts: ["selection"] });
  add({ id: "netab-search", parentId: "netab-root", title: t("menu.searchSelection"), contexts: ["selection"] });
  add({ id: "netab-focus", parentId: "netab-root", title: t("menu.toggleFocus"), contexts: ["page", "action"] });
  add({ id: "netab-save-session", parentId: "netab-root", title: t("menu.saveSession"), contexts: ["page", "action"] });
}

async function addReadLater({ url, title }) {
  if (!isHttpUrl(url)) return false;
  await updateList(KEYS.readLater, (list) => {
    if (list.some((x) => x.url === url && !x.done)) return list;
    return [{ id: uid("rl"), url, title: title || url, addedAt: new Date().toISOString(), done: false }, ...list].slice(0, 500);
  });
  return true;
}

async function clipToNotes({ text, url, title }) {
  const settings = await loadSettings();
  setLang(settings.lang);
  const clipTitle = t("notes.clippings");
  const quote = `> ${String(text).trim().replace(/\n/g, "\n> ")}\n— ${title || hostname(url)}${url ? ` (${url})` : ""}`;
  await updateList(KEYS.notes, (list) => {
    const now = new Date().toISOString();
    const existing = list.find((n) => n.clip);
    if (existing) {
      existing.body = `${quote}\n\n${existing.body || ""}`.trim();
      existing.updatedAt = now;
      return list;
    }
    return [{ id: uid("note"), title: clipTitle, body: quote, updatedAt: now, createdAt: now, pinned: false, clip: true }, ...list];
  });
}

async function addTodo(text) {
  const clean = String(text || "").trim().slice(0, 500);
  if (!clean) return;
  await updateList(KEYS.todos, (list) => [{ id: uid("todo"), text: clean, done: false, star: false, due: null, createdAt: new Date().toISOString() }, ...list]);
}

function flashBadge(text = "✓", color = "#10b981") {
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text });
  setTimeout(() => refreshBadge(), 1600);
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const url = info.linkUrl || info.pageUrl || tab?.url || "";
  const title = info.linkUrl ? info.selectionText || info.linkUrl : tab?.title || url;
  try {
    switch (info.menuItemId) {
      case "netab-add-link":
        if (isHttpUrl(url)) {
          await addLinkToGroup({ url, label: (title || hostname(url)).slice(0, 80), note: hostname(url) });
          flashBadge("+");
        }
        break;
      case "netab-read-later":
        if (await addReadLater({ url, title })) flashBadge("✓");
        break;
      case "netab-note":
        await clipToNotes({ text: info.selectionText, url: info.pageUrl, title: tab?.title });
        flashBadge("✎", "#7c9cff");
        break;
      case "netab-todo":
        await addTodo(info.selectionText);
        flashBadge("✓");
        break;
      case "netab-search":
        if (chrome.search?.query) await chrome.search.query({ text: info.selectionText, disposition: "NEW_TAB" });
        break;
      case "netab-focus":
        await toggleFocus();
        break;
      case "netab-save-session":
        await saveWindowSession(tab?.windowId);
        flashBadge("✓");
        break;
      default:
        break;
    }
  } catch (error) {
    console.error("NeTab context menu failed", error);
  }
});

async function saveWindowSession(windowId) {
  const tabs = await chrome.tabs.query(windowId ? { windowId } : { currentWindow: true });
  const usable = tabs.filter((tb) => isHttpUrl(tb.url || ""));
  if (!usable.length) return;
  const session = {
    id: uid("session"),
    name: new Date().toLocaleString(),
    createdAt: new Date().toISOString(),
    tabs: usable.map((tb) => ({ url: tb.url, title: tb.title || tb.url, pinned: Boolean(tb.pinned) })),
  };
  await updateList(KEYS.sessions, (list) => [session, ...list].slice(0, 100));
}

// ---------------------------------------------------------------------------
// Keyboard commands

chrome.commands?.onCommand.addListener(async (command, tab) => {
  if (command === "toggle-focus") await toggleFocus();
  if (command === "read-later" && tab?.url) {
    if (await addReadLater({ url: tab.url, title: tab.title })) flashBadge("✓");
  }
  if (command === "open-side-panel" && tab?.windowId !== undefined) {
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    } catch (error) {
      console.warn("Side panel unavailable", error);
    }
  }
});

// ---------------------------------------------------------------------------
// Focus timer engine

async function getFocus() {
  const [state, settings] = await Promise.all([get(KEYS.focusState, null), loadSettings()]);
  return { state: normalizeFocusState(state), settings };
}

async function toggleFocus() {
  const settings = await loadSettings();
  await update(KEYS.focusState, (s) => toggle(normalizeFocusState(s), settings.focus));
}

async function schedule(state) {
  await chrome.alarms.clear(ALARM_END);
  await chrome.alarms.clear(ALARM_TICK);
  if (state.status === "running" && state.endsAt) {
    await chrome.alarms.create(ALARM_END, { when: Math.max(Date.now() + 500, state.endsAt) });
    await chrome.alarms.create(ALARM_TICK, { periodInMinutes: 0.5 });
  }
  await refreshBadge(state);
}

async function refreshBadge(givenState) {
  const { state, settings } = givenState ? { state: givenState, settings: await loadSettings() } : await getFocus();
  if (state.status === "idle") {
    await chrome.action.setBadgeText({ text: "" });
    await chrome.action.setTitle({ title: "NeTab" });
    return;
  }
  const ms = remainingMs(state, settings.focus);
  const minutes = Math.max(0, Math.ceil(ms / 60000));
  const color = state.phase === "work" ? "#f43f5e" : "#10b981";
  await chrome.action.setBadgeBackgroundColor({ color: state.status === "paused" ? "#64748b" : color });
  if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: "#ffffff" });
  await chrome.action.setBadgeText({ text: state.status === "paused" ? "❚❚" : `${minutes}m` });
  setLang(settings.lang);
  await chrome.action.setTitle({ title: `NeTab — ${t(`focus.phase.${state.phase}`)} · ${minutes}m` });
}

async function recordStats(phase, settings) {
  if (phase !== "work") return;
  const key = todayKey();
  await update(
    KEYS.focusStats,
    (stats) => {
      const next = stats && typeof stats === "object" ? stats : {};
      const day = next[key] || { sessions: 0, minutes: 0 };
      day.sessions += 1;
      day.minutes += Math.round(durationMs(settings.focus, "work") / 60000);
      next[key] = day;
      const keys = Object.keys(next).sort();
      while (keys.length > 180) delete next[keys.shift()];
      return next;
    },
    {},
  );
}

let completing = false;
async function completeIfDue({ force = false } = {}) {
  if (completing) return;
  completing = true;
  try {
    const { state, settings } = await getFocus();
    if (state.status !== "running" || !state.endsAt) return;
    if (!force && state.endsAt - Date.now() > 1500) {
      await schedule(state);
      return;
    }
    const { state: next, finished } = complete(state, settings.focus);
    await set(KEYS.focusState, next);
    await recordStats(finished, settings);
    setLang(settings.lang);
    if (settings.focus.notify) {
      const title = finished === "work" ? t("focus.notify.workDone") : t("focus.notify.breakDone");
      const body = next.status === "running" ? t("focus.notify.started", { phase: t(`focus.phase.${next.phase}`) }) : t("focus.notify.ready", { phase: t(`focus.phase.${next.phase}`) });
      chrome.notifications.create(`netab-focus-${Date.now()}`, {
        type: "basic",
        iconUrl: chrome.runtime.getURL("assets/icons/icon-128.png"),
        title,
        message: body,
        priority: 2,
        buttons: next.status === "running" ? [{ title: t("focus.pause") }] : [{ title: t("focus.startPhase", { phase: t(`focus.phase.${next.phase}`) }) }],
      });
    }
    if (settings.focus.sound) await chime(finished === "work" ? "done" : "start");
  } finally {
    completing = false;
  }
}

chrome.notifications?.onButtonClicked.addListener(async (id) => {
  if (!id.startsWith("netab-focus")) return;
  await toggleFocus();
  chrome.notifications.clear(id);
});

chrome.notifications?.onClicked.addListener(async (id) => {
  if (!id.startsWith("netab-focus")) return;
  chrome.notifications.clear(id);
  const [existing] = await chrome.tabs.query({ url: `${NEWTAB_PAGE}*` });
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    await chrome.tabs.create({});
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_END) await completeIfDue();
  if (alarm.name === ALARM_TICK) {
    const { state } = await getFocus();
    if (state.status === "running" && state.endsAt && state.endsAt <= Date.now()) await completeIfDue();
    else await refreshBadge(state);
  }
});

subscribe(KEYS.focusState, (value) => {
  schedule(normalizeFocusState(value)).catch(console.error);
});

subscribe(KEYS.settings, (value, key, oldValue) => {
  if (value?.lang !== oldValue?.lang) buildMenus().catch(console.error);
});

// ---------------------------------------------------------------------------
// Sound (offscreen document so the chime plays even without a NeTab tab open)

async function chime(kind) {
  if (!chrome.offscreen) return;
  try {
    const has = (await chrome.runtime.getContexts?.({ contextTypes: ["OFFSCREEN_DOCUMENT"] }))?.length > 0;
    if (!has) {
      await chrome.offscreen.createDocument({
        url: "src/offscreen/offscreen.html",
        reasons: ["AUDIO_PLAYBACK"],
        justification: "Play the focus timer chime when a session ends.",
      });
    }
    await chrome.runtime.sendMessage({ target: "offscreen", type: "chime", kind });
    setTimeout(() => chrome.offscreen.closeDocument().catch(() => {}), 4000);
  } catch (error) {
    console.warn("Chime failed", error);
  }
}

// ---------------------------------------------------------------------------
// Distraction blocking while a focus session runs

async function shouldBlock(url) {
  if (!isHttpUrl(url)) return false;
  const { state, settings } = await getFocus();
  if (!isFocusing(state) || !settings.focus.block) return false;
  const host = hostname(url);
  if (!hostMatches(host, settings.focus.blocklist)) return false;
  const allow = (await get(KEYS.focusAllow, {})) || {};
  return !(allow[host] && allow[host] > Date.now());
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const url = changeInfo.url || (changeInfo.status === "loading" ? tab.url : "");
  if (!url || url.startsWith(BLOCKED_PAGE)) return;
  if (await shouldBlock(url)) {
    const target = `${BLOCKED_PAGE}?u=${encodeURIComponent(url)}`;
    chrome.tabs.update(tabId, { url: target }).catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// Messages from extension pages

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target === "offscreen") return false;
  (async () => {
    switch (message?.type) {
      case "chime":
        await chime(message.kind || "done");
        return { ok: true };
      case "focus-complete-check":
        await completeIfDue();
        return { ok: true };
      case "rebuild-menus":
        await buildMenus();
        return { ok: true };
      default:
        return { ok: false };
    }
  })()
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: String(error) }));
  return true;
});

// ---------------------------------------------------------------------------
// Lifecycle

chrome.runtime.onInstalled.addListener(async (details) => {
  await buildMenus();
  if (chrome.sidePanel?.setPanelBehavior) chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
  if (details.reason === "install") {
    chrome.tabs.create({ url: `${NEWTAB_PAGE}?welcome=1` });
  }
  const { state } = await getFocus();
  await schedule(state);
});

chrome.runtime.onStartup.addListener(async () => {
  await buildMenus();
  await completeIfDue();
  const { state } = await getFocus();
  await schedule(state);
});
