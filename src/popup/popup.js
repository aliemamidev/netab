// Toolbar popup: act on the current page, control the focus timer,
// capture tasks/notes and clean up tabs — without leaving the page.

import { h, setFavicon, hostname, isHttpUrl, copyText, uid, isExtension, todayKey } from "../lib/utils.js";
import { hydrateIcons, icon } from "../lib/icons.js";
import { applyI18n, t, fmtNumber, digits } from "../lib/i18n.js";
import { applyTheme } from "../lib/theme.js";
import { KEYS, get, update, updateList, getList, loadSettings, subscribe } from "../lib/storage.js";
import * as Focus from "../lib/focus.js";
import * as Tabs from "../lib/tabs.js";
import { loadLinks, addLinkToGroup } from "../lib/config.js";
import { toast, openMenu, formDialog } from "../lib/ui.js";
import { addReadLater } from "../newtab/widgets/readlater.js";
import { addTask } from "../newtab/widgets/todo.js";
import { showQrDialog } from "../lib/qr-dialog.js";

const $ = (id) => document.getElementById(id);
let settings;
let tab = null;
let focusState = Focus.defaultFocusState();
let focusTimer = null;
let captureMode = "task";

async function currentTab() {
  if (!isExtension) return { url: "https://example.com/", title: "Example Domain", id: 0 };
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  return active || null;
}

function openDashboard(query = "") {
  const url = chrome.runtime.getURL(`src/newtab/newtab.html${query}`);
  chrome.tabs.create({ url });
  window.close();
}

// ---------------------------------------------------------------------------
// Page card

async function renderPage() {
  tab = await currentTab();
  const url = tab?.url || "";
  const ok = isHttpUrl(url);
  $("pageTitle").textContent = tab?.title || t("popup.noPage");
  $("pageHost").textContent = ok ? hostname(url) : t("popup.notSavable");
  setFavicon($("pageFav"), ok ? url : "https://netab.local/", 32);
  for (const id of ["saveLinkBtn", "readLaterBtn", "copyBtn", "qrBtn"]) $(id).disabled = !ok;
  if (!ok) return;
  const rl = await getList(KEYS.readLater);
  if (rl.some((x) => x.url === url && !x.done)) markDone($("readLaterBtn"), t("popup.saved"));
  const { links } = await loadLinks().catch(() => ({ links: { groups: [] } }));
  if (links.groups.some((g) => g.links.some((l) => l.url === url))) markDone($("saveLinkBtn"), t("popup.inLinks"));
}

function markDone(btn, label) {
  btn.classList.add("done");
  btn.replaceChildren(icon("check", 15), h("span", {}, label));
}

async function saveLink() {
  const { links } = await loadLinks();
  const groups = links.groups.length ? links.groups : [{ id: "inbox", name: t("links.inbox"), icon: "📥" }];
  const v = await formDialog({
    title: t("popup.saveLink"),
    fields: [
      { name: "label", label: t("links.label"), value: (tab.title || hostname(tab.url)).slice(0, 60), autofocus: true, wide: true },
      { name: "group", label: t("links.group"), type: "select", value: groups[0].id, options: groups.map((g) => ({ value: g.id, label: `${g.icon} ${g.name}` })), wide: true },
    ],
  });
  if (!v) return;
  await addLinkToGroup({ url: tab.url, label: v.label || hostname(tab.url), note: hostname(tab.url), groupId: v.group });
  markDone($("saveLinkBtn"), t("popup.inLinks"));
  toast(t("popup.linkSaved"), { kind: "success" });
}

async function readLater() {
  const added = await addReadLater(tab.url, tab.title);
  markDone($("readLaterBtn"), t("popup.saved"));
  toast(added ? t("popup.readLaterSaved") : t("popup.alreadySaved"), { kind: "success" });
  renderFooter();
}

function copyMenu(anchor) {
  const title = tab.title || tab.url;
  openMenu(anchor, [
    { label: t("popup.copyUrl"), icon: "link", onClick: () => copy(tab.url) },
    { label: t("popup.copyMarkdown"), icon: "note", onClick: () => copy(`[${title.replace(/[[\]]/g, "")}](${tab.url})`) },
    { label: t("popup.copyTitleUrl"), icon: "copy", onClick: () => copy(`${title}\n${tab.url}`) },
    { label: t("popup.copyClean"), icon: "sparkles", onClick: () => copy(cleanUrl(tab.url)) },
  ]);
}

/** Strip common tracking parameters (utm_*, fbclid, gclid, …). */
export function cleanUrl(raw) {
  try {
    const url = new URL(raw);
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|mc_|pk_|hsa_)|^(fbclid|gclid|dclid|msclkid|yclid|igshid|si|ref_src|ref|spm|_hsenc|_hsmi|mkt_tok|vero_id|oly_anon_id|oly_enc_id|wickedid|trk|trkCampaign)$/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return raw;
  }
}

async function copy(text) {
  if (await copyText(text)) toast(t("common.copied"), { kind: "success", timeout: 1500 });
}

// ---------------------------------------------------------------------------
// Focus

function renderFocus() {
  clearInterval(focusTimer);
  const card = $("focusCard");
  card.dataset.status = focusState.status;
  card.dataset.phase = focusState.phase;
  const tick = () => {
    $("focusTime").textContent = digits(Focus.formatClock(Focus.remainingMs(focusState, settings.focus)));
  };
  tick();
  if (focusState.status === "running") focusTimer = setInterval(tick, 1000);
  $("focusPhase").textContent = focusState.status === "paused" ? t("focus.paused") : t(`focus.phase.${focusState.phase}`);
  $("focusToggle").replaceChildren(
    icon(focusState.status === "running" ? "pause" : "play", 15),
    h("span", {}, focusState.status === "running" ? t("focus.pause") : focusState.status === "paused" ? t("focus.resume") : t("focus.start")),
  );
}

async function focus(action) {
  await update(KEYS.focusState, (raw) => {
    const s = Focus.normalizeFocusState(raw);
    if (action === "toggle") return Focus.toggle(s, settings.focus);
    if (action === "reset") return Focus.reset(s, settings.focus);
    if (action === "skip") return Focus.complete(s, { ...settings.focus, autoBreak: false, autoWork: false }).state;
    return s;
  });
}

// ---------------------------------------------------------------------------
// Capture

async function capture(text) {
  if (!text.trim()) return;
  if (captureMode === "task") {
    await addTask(text);
    toast(t("popup.taskAdded"), { kind: "success" });
  } else {
    const now = new Date().toISOString();
    await updateList(KEYS.notes, (list) => [{ id: uid("note"), title: "", body: text.trim(), createdAt: now, updatedAt: now, pinned: false }, ...list]);
    toast(t("popup.noteAdded"), { kind: "success" });
  }
  renderFooter();
}

// ---------------------------------------------------------------------------
// Tab tools

const TOOLS = [
  ["dedupe", "copy", "tabs.dedupe"],
  ["group", "layers", "tabs.group"],
  ["sort", "sort", "tabs.sort"],
  ["save", "save", "tabs.save"],
  ["discard", "zap", "tabs.discard"],
  ["merge", "merge", "tabs.merge"],
];

async function renderTools() {
  const stats = await Tabs.tabStats();
  $("tabStats").textContent = t("popup.tabStats", { n: stats.tabs, w: stats.windows });
  const tools = $("tools");
  tools.replaceChildren(
    ...TOOLS.map(([action, ic, key]) =>
      h(
        "button",
        { class: "p-tool", type: "button", onclick: () => runTool(action) },
        icon(ic, 18),
        h("span", {}, t(key)),
        action === "dedupe" && stats.duplicates ? h("span", { class: "count" }, fmtNumber(stats.duplicates)) : null,
        action === "discard" && stats.discardable ? h("span", { class: "count" }, fmtNumber(stats.discardable)) : null,
      ),
    ),
  );
}

async function runTool(action) {
  try {
    let msg = "";
    if (action === "dedupe") {
      const n = await Tabs.closeDuplicates();
      msg = n ? t("tabs.dedupeDone", { n }) : t("tabs.noDupes");
    } else if (action === "group") {
      const n = await Tabs.groupByDomain();
      msg = n ? t("tabs.groupDone", { n }) : t("tabs.nothingToGroup");
    } else if (action === "sort") {
      await Tabs.sortByDomain();
      msg = t("tabs.sortDone");
    } else if (action === "save") {
      const s = await Tabs.saveSession({});
      msg = s ? t("tabs.saved", { n: s.tabs.length }) : t("tabs.nothingToSave");
    } else if (action === "discard") {
      const n = await Tabs.discardInactive();
      msg = t("tabs.discardDone", { n });
    } else if (action === "merge") {
      const n = await Tabs.mergeWindows();
      msg = n ? t("tabs.mergeDone", { n }) : t("tabs.oneWindow");
    }
    toast(msg, { kind: "success" });
  } catch (error) {
    console.error(error);
    toast(t("common.error"), { kind: "error" });
  }
  renderTools();
}

async function renderFooter() {
  const [todos, rl] = await Promise.all([getList(KEYS.todos), getList(KEYS.readLater)]);
  const today = todayKey();
  const open = todos.filter((x) => !x.done);
  const due = open.filter((x) => x.due && x.due <= today).length;
  $("todayBtn").textContent = due ? t("popup.dueToday", { n: due }) : t("popup.openTasks", { n: open.length });
  $("rlBtn").textContent = t("readlater.count", { n: rl.filter((x) => !x.done).length });
}

// ---------------------------------------------------------------------------

async function main() {
  settings = await loadSettings();
  applyTheme(settings);
  applyI18n(document);
  hydrateIcons(document);

  $("newTabBtn").onclick = () => openDashboard();
  $("settingsBtn").onclick = () => openDashboard("?settings=general");
  $("todayBtn").onclick = () => openDashboard();
  $("rlBtn").onclick = () => openDashboard();
  const windowId = isExtension ? (await chrome.windows.getCurrent()).id : 0;
  $("sidePanelBtn").onclick = () => {
    // Must be called synchronously inside the click so Chrome sees the user gesture.
    chrome.sidePanel
      .open({ windowId })
      .then(() => window.close())
      .catch(() => toast(t("common.error"), { kind: "error" }));
  };
  $("saveLinkBtn").onclick = saveLink;
  $("readLaterBtn").onclick = readLater;
  $("copyBtn").onclick = (e) => copyMenu(e.currentTarget);
  $("qrBtn").onclick = () => showQrDialog(cleanUrl(tab.url), { title: tab.title || t("qr.title") });
  $("focusToggle").onclick = () => focus("toggle");
  $("focusReset").onclick = () => focus("reset");
  $("focusSkip").onclick = () => focus("skip");

  for (const btn of $("captureMode").querySelectorAll("button")) {
    btn.onclick = () => {
      captureMode = btn.dataset.mode;
      for (const b of $("captureMode").querySelectorAll("button")) b.classList.toggle("active", b === btn);
      $("captureInput").focus();
    };
  }
  $("captureForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("captureInput");
    const text = input.value;
    input.value = "";
    await capture(text);
  });

  focusState = Focus.normalizeFocusState(await get(KEYS.focusState, null));
  renderFocus();
  subscribe(KEYS.focusState, (v) => {
    focusState = Focus.normalizeFocusState(v);
    renderFocus();
  });

  await Promise.all([renderPage(), renderTools(), renderFooter()]);
}

main().catch((error) => {
  console.error(error);
  document.body.append(h("p", { class: "error" }, String(error)));
});
