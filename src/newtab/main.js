// NeTab new tab entry point.

import { h, isExtension } from "../lib/utils.js";
import { hydrateIcons, icon } from "../lib/icons.js";
import { t, fmtNumber, digits } from "../lib/i18n.js";
import { initApp, app, on, updateSettings } from "./app.js";
import { initClock } from "./clock.js";
import { initBackground, showBackground, setMedia } from "./background.js";
import { initLinks, linkDialog, groupDialog } from "./links.js";
import { initSearch, focusSearch, navigate } from "./search.js";
import { initWidgets, openGallery, findWidget } from "./widgets/index.js";
import { initSettings, openSettings, closeSettings, settingsOpen, exportBackup } from "./settings.js";
import { loadMedia } from "../lib/config.js";
import { KEYS, get, subscribe } from "../lib/storage.js";
import * as Focus from "../lib/focus.js";
import { focusAction } from "./widgets/focus.js";
import { createNote } from "./widgets/notes.js";
import { runTabAction } from "./widgets/sessions.js";
import { hasFeature, getWeather, weatherInfo } from "../lib/net.js";
import { dialog, dialogOpen, toast, closeMenu } from "../lib/ui.js";
import { WIDGETS } from "./widgets/index.js";
import { showQrDialog } from "../lib/qr-dialog.js";
import { formDialog } from "../lib/ui.js";

// ---------------------------------------------------------------------------
// Commands (">" in the search box)

function commands() {
  const s = app.settings;
  const cmd = (id, title, iconName, run, keywords = "", hint = "") => ({ id, title, icon: iconName, run, keywords, hint });
  const chromePage = (url) => () => navigate(url);
  return [
    cmd("settings", t("top.settings"), "settings", () => openSettings(), "preferences options config"),
    cmd("widgets", t("widgets.gallery"), "layout", openGallery, "widgets add"),
    cmd("zen", t("set.zen"), "zen", () => updateSettings({ zen: !s.zen }), "focus minimal clean"),
    cmd("theme", s.theme === "light" ? t("cmd.darkTheme") : t("cmd.lightTheme"), s.theme === "light" ? "moon" : "sun", () => updateSettings({ theme: s.theme === "light" ? "dark" : "light" }), "theme dark light"),
    cmd("lang", s.lang === "fa" || (s.lang === "auto" && document.documentElement.lang === "fa") ? "Switch to English" : "تغییر زبان به فارسی", "globe", () => updateSettings({ lang: document.documentElement.lang === "fa" ? "en" : "fa" }), "language persian farsi english زبان"),
    cmd("bg", t("top.nextBg"), "image", () => showBackground({ next: true }), "wallpaper background"),
    cmd("focus", t("cmd.focusToggle"), "timer", () => focusAction("toggle"), "pomodoro timer start pause"),
    cmd("focusReset", t("focus.reset"), "reset", () => focusAction("reset"), "pomodoro timer"),
    cmd("note", t("notes.new"), "note", newNote, "note write"),
    cmd("task", t("todo.add"), "todo", newTask, "task todo"),
    cmd("link", t("links.add"), "link", () => linkDialog(), "bookmark shortcut"),
    cmd("group", t("links.addGroup"), "folder", () => groupDialog(), "category folder"),
    cmd("save", t("tabs.saveSession"), "save", () => runTabAction("save"), "session tabs"),
    cmd("dedupe", t("tabs.dedupe"), "copy", () => runTabAction("dedupe"), "duplicates tabs close"),
    cmd("groupTabs", t("tabs.group"), "layers", () => runTabAction("group"), "tab groups domain"),
    cmd("sortTabs", t("tabs.sort"), "sort", () => runTabAction("sort"), "tabs order"),
    cmd("discard", t("tabs.discard"), "zap", () => runTabAction("discard"), "memory suspend sleep"),
    cmd("merge", t("tabs.merge"), "merge", () => runTabAction("merge"), "windows"),
    cmd("sidepanel", t("about.kSidePanel"), "panel", openSidePanel, "side panel"),
    cmd("backup", t("data.exportBtn"), "download", exportBackup, "export backup"),
    cmd("qr", t("cmd.qr"), "qr", makeQr, "qr code phone share"),
    cmd("downloads", t("cmd.downloads"), "download", chromePage("chrome://downloads"), "chrome"),
    cmd("history", t("cmd.history"), "history", chromePage("chrome://history"), "chrome"),
    cmd("bookmarks", t("cmd.bookmarks"), "bookmark", chromePage("chrome://bookmarks"), "chrome"),
    cmd("extensions", t("cmd.extensions"), "layers", chromePage("chrome://extensions"), "chrome"),
    cmd("chromeSettings", t("cmd.chromeSettings"), "settings", chromePage("chrome://settings"), "chrome"),
    cmd("passwords", t("cmd.passwords"), "shield", chromePage("chrome://password-manager/passwords"), "chrome password"),
    cmd("clearData", t("cmd.clearData"), "trash", chromePage("chrome://settings/clearBrowserData"), "chrome cache cookies"),
  ];
}

async function makeQr() {
  const v = await formDialog({ title: t("cmd.qr"), fields: [{ name: "text", label: t("qr.prompt"), type: "textarea", rows: 3, required: true, autofocus: true, wide: true }], okLabel: t("qr.title") });
  if (v?.text) showQrDialog(v.text);
}

let currentWindowId = null;
if (isExtension && chrome.windows) chrome.windows.getCurrent().then((w) => (currentWindowId = w.id)).catch(() => {});

function openSidePanel() {
  if (!isExtension || !chrome.sidePanel?.open || currentWindowId === null) return toast(t("tabs.extOnly"));
  // Called straight from the click/keypress so the user gesture is preserved.
  return chrome.sidePanel.open({ windowId: currentWindowId }).catch(() => toast(t("common.error")));
}

async function ensureWidget(id) {
  if (!app.settings.widgets.enabled[id] || !app.settings.widgets.show) {
    await updateSettings((cur) => {
      cur.widgets.enabled[id] = true;
      cur.widgets.show = true;
      return cur;
    });
    await new Promise((r) => setTimeout(r, 80));
  }
  const w = findWidget(id);
  w?.card.scrollIntoView({ behavior: "smooth", block: "center" });
  return w;
}

async function newNote() {
  const w = await ensureWidget("notes");
  if (w?.instance?.newNote) await w.instance.newNote();
  else await createNote();
}

async function newTask() {
  const w = await ensureWidget("todo");
  setTimeout(() => w?.instance?.focus?.(), 250);
}

// ---------------------------------------------------------------------------
// Top bar chips

async function initWeatherChip() {
  const chip = document.getElementById("weatherChip");
  const show = (data, city) => {
    const cur = data?.current;
    if (!cur) return chip.classList.add("hidden");
    const info = weatherInfo(cur.weather_code, cur.is_day);
    chip.replaceChildren(h("span", { class: "weather-emoji" }, info.emoji), h("span", {}, `${fmtNumber(Math.round(cur.temperature_2m))}°`), h("span", { class: "muted" }, city.name));
    chip.title = t(info.key);
    chip.classList.remove("hidden");
  };
  chip.addEventListener("click", () => ensureWidget("weather"));
  on("weather", ({ data, city }) => show(data, city));
  const city = app.settings.weather.city;
  if (city && (await hasFeature("weather"))) {
    try {
      const res = await getWeather(city, app.settings.weather.units);
      show(res.data, city);
    } catch {
      /* offline */
    }
  }
}

async function initFocusChip() {
  const chip = document.getElementById("focusChip");
  let state = Focus.normalizeFocusState(await get(KEYS.focusState, null));
  let timer = null;
  const render = () => {
    clearInterval(timer);
    if (state.status === "idle") return chip.classList.add("hidden");
    const tick = () => {
      chip.replaceChildren(
        h("span", { class: "dot" }),
        h("span", {}, digits(Focus.formatClock(Focus.remainingMs(state, app.settings.focus)))),
        h("span", { class: "muted" }, state.status === "paused" ? t("focus.paused") : t(`focus.phase.${state.phase}`)),
      );
    };
    chip.classList.remove("hidden");
    chip.classList.toggle("break", state.phase !== "work");
    chip.classList.toggle("paused", state.status === "paused");
    tick();
    if (state.status === "running") timer = setInterval(tick, 1000);
  };
  chip.addEventListener("click", () => ensureWidget("focus"));
  subscribe(KEYS.focusState, (v) => {
    state = Focus.normalizeFocusState(v);
    render();
  });
  on("settings", render);
  render();
}

// ---------------------------------------------------------------------------
// Keyboard

function initKeyboard() {
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (settingsOpen()) closeSettings();
      focusSearch();
      return;
    }
    if (e.key === "Escape" && !dialogOpen()) {
      closeMenu();
      if (settingsOpen()) closeSettings();
      return;
    }
    if (typing || dialogOpen()) return;
    if (e.key === "/" && !mod) {
      e.preventDefault();
      focusSearch();
    } else if (e.key === ">" && !mod) {
      e.preventDefault();
      focusSearch(">");
    } else if (e.altKey && !mod) {
      const k = e.code;
      if (k === "KeyZ") updateSettings({ zen: !app.settings.zen });
      else if (k === "KeyB") showBackground({ next: true });
      else if (k === "KeyN") newNote();
      else if (k === "KeyT") newTask();
      else if (k === "Comma") openSettings();
      else return;
      e.preventDefault();
    }
  });

  // Paste a URL anywhere (not in a field) → open the add-link dialog.
  document.addEventListener("paste", (e) => {
    const target = e.target;
    if (/^(INPUT|TEXTAREA)$/.test(target.tagName) || dialogOpen()) return;
    const text = e.clipboardData?.getData("text")?.trim();
    if (text && /^https?:\/\/\S+$/.test(text)) {
      e.preventDefault();
      linkDialog({ url: text, label: "", note: "", icon: "", id: undefined, enabled: true }).catch(() => {});
    }
  });
}

// ---------------------------------------------------------------------------
// Onboarding

async function onboarding() {
  const name = h("input", { class: "input", type: "text", placeholder: t("set.namePlaceholder"), maxlength: 40, value: app.settings.name || "" });
  const langSel = h(
    "select",
    { class: "input", onchange: (e) => updateSettings({ lang: e.target.value }) },
    [
      ["auto", t("lang.auto")],
      ["en", "English"],
      ["fa", "فارسی"],
    ].map(([v, l]) => h("option", { value: v, selected: app.settings.lang === v }, l)),
  );
  const picks = {};
  const widgetBoxes = h(
    "div",
    { class: "onboard-widgets" },
    Object.values(WIDGETS).map((w) => {
      const box = h("input", { type: "checkbox", checked: app.settings.widgets.enabled[w.id] });
      picks[w.id] = box;
      return h("label", { class: "check-row" }, box, icon(w.icon, 16), h("span", {}, w.title()));
    }),
  );
  const features = ["onb.f1", "onb.f2", "onb.f3", "onb.f4", "onb.f5", "onb.f6"];
  const featureIcons = ["search", "timer", "tabs", "note", "calendar", "shield"];
  const result = await dialog({
    title: t("onb.title"),
    wide: true,
    body: h(
      "div",
      { class: "onboard" },
      h("div", { class: "onboard-hero" }, h("img", { src: "../../assets/icons/icon-128.png", alt: "" }), h("div", {}, h("h3", {}, t("onb.heading")), h("p", {}, t("onb.sub")))),
      h("ul", { class: "feature-list" }, features.map((k, i) => h("li", {}, icon(featureIcons[i], 16), t(k)))),
      h("div", { class: "form-grid" }, h("label", { class: "field" }, h("span", { class: "field-label" }, t("set.name")), name), h("label", { class: "field" }, h("span", { class: "field-label" }, t("set.language")), langSel)),
      h("div", { class: "field" }, h("span", { class: "field-label" }, t("onb.widgets")), widgetBoxes),
    ),
    buttons: [{ label: t("onb.start"), kind: "primary", value: true }],
  });
  await updateSettings((cur) => {
    cur.onboarded = true;
    cur.name = name.value.trim();
    for (const [id, box] of Object.entries(picks)) cur.widgets.enabled[id] = box.checked;
    return cur;
  });
  if (result) toast(t("onb.done"), { timeout: 5000 });
}

// ---------------------------------------------------------------------------
// Boot

async function main() {
  await initApp("newtab");
  hydrateIcons(document);
  document.title = t("app.newTab");

  let media;
  try {
    media = (await loadMedia()).media;
  } catch (error) {
    console.warn("Media config failed", error);
    media = { settings: {}, photos: [], videos: [] };
  }
  // First run with personal wallpapers (NeTab 2.x data/media.local.json or uploads): show them.
  if (!(await get(KEYS.settings, null))) {
    const personal = [...media.photos, ...media.videos].some((m) => m.source === "uploaded" || !String(m.path).startsWith("media/samples/"));
    if (personal) await updateSettings({ background: { source: "media" } });
  }
  initBackground(media).catch((e) => console.warn("Background failed", e));
  subscribe(KEYS.media, async () => setMedia((await loadMedia()).media, { refresh: false }));
  on("settings", ({ settings, prev }) => {
    if (JSON.stringify(settings.background) !== JSON.stringify(prev?.background)) showBackground();
  });

  initClock();
  await initLinks();
  initSearch({ commands });
  initWidgets();
  initSettings();
  initKeyboard();
  initWeatherChip();
  initFocusChip();

  document.getElementById("settingsBtn").addEventListener("click", () => (settingsOpen() ? closeSettings() : openSettings()));
  document.getElementById("widgetsBtn").addEventListener("click", openGallery);
  document.getElementById("zenBtn").addEventListener("click", () => updateSettings({ zen: !app.settings.zen }));
  document.getElementById("bgNextBtn").addEventListener("click", () => showBackground({ next: true }));
  document.addEventListener("netab:open-note", async (e) => {
    const w = await ensureWidget("notes");
    w?.instance?.openNote?.(e.detail);
  });

  document.body.classList.remove("booting");

  const params = new URLSearchParams(location.search);
  if (params.get("settings")) openSettings(params.get("settings"));
  else if (location.hash === "#settings") openSettings();
  if (params.get("welcome") || !app.settings.onboarded) onboarding();
  else if (!params.get("settings")) {
    // Chrome focuses the omnibox on new tabs; only grab focus when we are the active element target.
    if (document.hasFocus()) document.getElementById("searchInput").focus({ preventScroll: true });
  }
}

main().catch((error) => {
  console.error(error);
  document.body.classList.remove("booting");
  document.getElementById("main").prepend(h("div", { class: "glass", style: { padding: "1rem", marginTop: "6rem", borderRadius: "16px" } }, `NeTab failed to start: ${error.message}`));
});
