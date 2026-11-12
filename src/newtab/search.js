// Omnibox / command palette: web search with engines + !bangs, calculator and
// unit conversion, quick links, open tabs, bookmarks, history, notes, commands.

import { h, clear, debounce, looksLikeUrl, normalizeUrl, setFavicon, hostname, copyText, isExtension } from "../lib/utils.js";
import { icon } from "../lib/icons.js";
import { t, locale, lang } from "../lib/i18n.js";
import { app, on, updateSettings } from "./app.js";
import { allEngines, engineById, parseBang, engineUrl, engineHome } from "../lib/engines.js";
import { calculate, formatResult } from "../lib/calc.js";
import { instantAnswers } from "../lib/instant.js";
import { formatDate, formatTime, timeZoneOffsetLabel } from "../lib/dates.js";
import { cachedRates } from "../lib/net.js";
import { bestScore, fuzzyScore } from "../lib/fuzzy.js";
import { openMenu, toast } from "../lib/ui.js";
import { getLinks } from "./links.js";
import { KEYS, getList } from "../lib/storage.js";
import { switchToTab } from "../lib/tabs.js";

let input;
let box;
let form;
let resultsEl;
let items = [];
let active = 0;
let seq = 0;
let commandsProvider = () => [];
let tabsCache = null;
let rates = null;

const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export async function navigate(url, newTab = false) {
  const inNew = newTab || app.settings.search.newTab;
  const special = /^(chrome|edge|about|chrome-extension|file):/i.test(url);
  if (isExtension && (special || inNew)) {
    if (inNew) await chrome.tabs.create({ url, active: true });
    else await chrome.tabs.update({ url });
    return;
  }
  if (inNew) window.open(url, "_blank", "noopener");
  else location.href = url;
}

async function runSearch(engine, query, newTab) {
  if (!query) {
    const home = engineHome(engine);
    if (home) return navigate(home, newTab);
    return;
  }
  if (engine.id === "default" || !engine.url) {
    if (isExtension && chrome.search?.query) {
      const inNew = newTab || app.settings.search.newTab;
      await chrome.search.query({ text: query, disposition: inNew ? "NEW_TAB" : "CURRENT_TAB" });
      return;
    }
    return navigate(engineUrl(engineById(app.settings, "google"), query), newTab);
  }
  return navigate(engineUrl(engine, query), newTab);
}

async function permissionsGranted(perms) {
  if (!isExtension) return false;
  try {
    return await chrome.permissions.contains({ permissions: perms });
  } catch {
    return false;
  }
}

async function getTabs() {
  if (!isExtension || !chrome.tabs) return [];
  if (!tabsCache) tabsCache = chrome.tabs.query({}).catch(() => []);
  return tabsCache;
}

function highlight(text, query) {
  const q = query.trim().toLowerCase();
  const s = String(text || "");
  const i = q ? s.toLowerCase().indexOf(q) : -1;
  if (i < 0) return s;
  return [s.slice(0, i), h("mark", {}, s.slice(i, i + q.length)), s.slice(i + q.length)];
}

function faviconIcon(url) {
  const img = h("img", { alt: "", loading: "lazy" });
  setFavicon(img, url, 32);
  return img;
}

async function collect(raw) {
  const query = raw.trim();
  const s = app.settings.search;
  const out = [];
  if (!query) return out;

  // Command mode
  if (query.startsWith(">")) {
    const q = query.slice(1).trim();
    const cmds = commandsProvider()
      .map((c) => ({ c, score: q ? bestScore(q, [[c.title, 1.2], [c.keywords || "", 0.8]]) : 1 }))
      .filter((x) => x.score > -Infinity)
      .sort((a, b) => b.score - a.score)
      .slice(0, 14);
    if (cmds.length) out.push({ section: t("search.commands") });
    for (const { c } of cmds) out.push({ type: "command", title: c.title, sub: c.hint || "", icon: c.icon, run: c.run, q });
    return out;
  }

  const bang = parseBang(query, app.settings);
  if (bang) {
    out.push({ type: "search", engine: bang.engine, query: bang.query, title: bang.query ? t("search.searchWith", { engine: bang.engine.name, q: bang.query }) : t("search.openEngine", { engine: bang.engine.name }) });
    return out;
  }

  if (s.sources.calc) {
    const calc = calculate(query, { rates });
    if (calc) {
      const value = formatResult(calc.value, locale());
      const unit = calc.kind === "unit" ? ` ${calc.unit}` : "";
      out.push({ type: "calc", title: `= ${value}${unit}`, copy: `${calc.value}`, sub: t("search.calcHint"), icon: "calc" });
    }
  }

  const INSTANT_ICONS = { uuid: "sparkles", password: "shield", time: "clock", timestamp: "history", base64: "copy" };
  const instants = s.sources.calc
    ? instantAnswers(query, {
        t,
        dateTime: (d) => formatDate(d, "gregory", lang(), { dateStyle: "full", timeStyle: "medium" }),
        timeIn: (d, tz) => ({
          time: formatTime(d, { lang: lang(), timeZone: tz }),
          date: formatDate(d, "gregory", lang(), { weekday: "short", month: "short", day: "numeric", timeZone: tz }),
          offset: timeZoneOffsetLabel(tz, d),
        }),
      }).map((a) => ({ type: "calc", title: a.title, sub: `${a.sub} · ${t("search.calcHint")}`, copy: a.copy, icon: INSTANT_ICONS[a.kind] || "calc", swatch: a.swatch, weak: a.weak }))
    : [];
  out.push(...instants.filter((a) => !a.weak));

  const linkMatches = s.sources.links
    ? getLinks()
        .groups.filter((g) => g.enabled)
        .flatMap((g) => g.links.filter((l) => l.enabled).map((l) => ({ l, g })))
        .map(({ l, g }) => ({ l, g, score: bestScore(query, [[l.label, 1.3], [hostname(l.url), 1], [l.note, 0.6], [g.name, 0.4]]) }))
        .filter((x) => x.score > -Infinity)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6)
    : [];

  // Strong prefix match on a quick link becomes the top hit.
  const top = linkMatches[0];
  if (top && query.length >= 2 && (top.l.label.toLowerCase().startsWith(query.toLowerCase()) || hostname(top.l.url).startsWith(query.toLowerCase()))) {
    out.push({ type: "url", url: top.l.url, title: highlight(top.l.label, query), sub: top.l.url, fav: top.l.url, hint: t("search.topHit") });
    linkMatches.shift();
  }

  if (looksLikeUrl(query)) {
    const url = normalizeUrl(query);
    out.push({ type: "url", url, title: t("search.goTo", { url: query }), sub: url, fav: url, hint: "↵" });
  }

  const engine = engineById(app.settings, s.engine);
  out.push({ type: "search", engine, query, title: engine.id === "default" ? t("search.searchWeb", { q: query }) : t("search.searchWith", { engine: engine.name, q: query }), hint: "↵" });
  out.push(...instants.filter((a) => a.weak));

  if (s.sources.commands) {
    const cmds = commandsProvider()
      .map((c) => ({ c, score: bestScore(query, [[c.title, 1], [c.keywords || "", 0.7]]) }))
      .filter((x) => x.score > 60)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    if (cmds.length) {
      out.push({ section: t("search.commands") });
      for (const { c } of cmds) out.push({ type: "command", title: c.title, sub: c.hint || "", icon: c.icon, run: c.run });
    }
  }

  if (linkMatches.length) {
    out.push({ section: t("search.links") });
    for (const { l, g } of linkMatches) out.push({ type: "url", url: l.url, title: highlight(l.label, query), sub: `${g.icon} ${g.name} · ${hostname(l.url)}`, fav: l.url });
  }

  if (s.sources.tabs) {
    const tabs = (await getTabs())
      .filter((tb) => tb.url && !tb.url.startsWith(location.origin))
      .map((tb) => ({ tb, score: bestScore(query, [[tb.title, 1], [tb.url, 0.7]]) }))
      .filter((x) => x.score > -Infinity)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    if (tabs.length) {
      out.push({ section: t("search.tabs") });
      for (const { tb } of tabs) out.push({ type: "tab", tab: tb, title: highlight(tb.title || tb.url, query), sub: hostname(tb.url), fav: tb.url, hint: t("search.switch") });
    }
  }

  const wantBookmarks = s.sources.bookmarks;
  const wantHistory = s.sources.history;
  const seen = new Set(out.filter((x) => x.url).map((x) => x.url));
  if (wantBookmarks && (await permissionsGranted(["bookmarks"]))) {
    try {
      const marks = (await chrome.bookmarks.search(query)).filter((b) => b.url && !seen.has(b.url)).slice(0, 5);
      if (marks.length) {
        out.push({ section: t("search.bookmarks") });
        for (const b of marks) {
          seen.add(b.url);
          out.push({ type: "url", url: b.url, title: highlight(b.title || b.url, query), sub: hostname(b.url), fav: b.url });
        }
      }
    } catch {
      /* ignore */
    }
  }
  if (wantHistory && (await permissionsGranted(["history"]))) {
    try {
      const hist = (await chrome.history.search({ text: query, maxResults: 25, startTime: 0 }))
        .filter((x) => x.url && !seen.has(x.url) && /^https?:/.test(x.url))
        .map((x) => ({ x, score: bestScore(query, [[x.title, 1], [x.url, 0.8]]) + Math.min(30, (x.visitCount || 0) * 2) }))
        .filter((x) => x.score > -Infinity)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6);
      if (hist.length) {
        out.push({ section: t("search.history") });
        for (const { x } of hist) out.push({ type: "url", url: x.url, title: highlight(x.title || x.url, query), sub: hostname(x.url), fav: x.url });
      }
    } catch {
      /* ignore */
    }
  }

  const notes = (await getList(KEYS.notes))
    .map((n) => ({ n, score: Math.max(fuzzyScore(query, n.title), query.length > 2 && String(n.body || "").toLowerCase().includes(query.toLowerCase()) ? 40 : -Infinity) }))
    .filter((x) => x.score > -Infinity)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  if (notes.length) {
    out.push({ section: t("search.notes") });
    for (const { n } of notes) {
      const title = n.title || String(n.body || "").split("\n")[0].slice(0, 60) || t("notes.untitled");
      out.push({ type: "note", note: n, title: highlight(title, query), sub: String(n.body || "").replace(/\s+/g, " ").slice(0, 90), icon: "note" });
    }
  }

  if (isExtension && (wantBookmarks || wantHistory) && !(await permissionsGranted(["bookmarks", "history"]))) {
    out.push({ type: "perm", title: t("search.enableMore"), sub: t("search.enableMoreHint"), icon: "shield" });
  }
  return out;
}

function render() {
  clear(resultsEl);
  const selectable = items.filter((x) => !x.section);
  if (!selectable.length) {
    close();
    return;
  }
  let idx = 0;
  for (const item of items) {
    if (item.section) {
      resultsEl.appendChild(h("div", { class: "result-section" }, item.section));
      continue;
    }
    const i = idx;
    const iconEl = h("span", { class: "result-icon" });
    if (item.swatch) iconEl.appendChild(h("span", { class: "swatch-dot", style: { background: item.swatch } }));
    else if (item.fav) iconEl.appendChild(faviconIcon(item.fav));
    else if (item.type === "search") {
      if (item.engine.id === "default" || !item.engine.url) iconEl.appendChild(icon("search", 16));
      else iconEl.appendChild(faviconIcon(engineHome(item.engine)));
    } else iconEl.appendChild(icon(item.icon || "arrowRight", 16));
    const el = h(
      "button",
      {
        class: `result result-${item.type} ${i === active ? "active" : ""}`,
        type: "button",
        role: "option",
        id: `result-${i}`,
        "aria-selected": String(i === active),
        onmousemove: () => {
          if (active !== i) setActive(i);
        },
        onmousedown: (e) => e.preventDefault(),
        onclick: (e) => execute(item, e.ctrlKey || e.metaKey || e.button === 1),
      },
      iconEl,
      h("span", { class: "result-text" }, h("span", { class: "result-title", dir: "auto" }, item.title), item.sub ? h("span", { class: "result-sub" }, item.sub) : null),
      item.hint ? h("span", { class: "result-hint" }, item.hint) : null,
    );
    resultsEl.appendChild(el);
    idx += 1;
  }
  resultsEl.appendChild(
    h(
      "div",
      { class: "results-footer" },
      h("span", {}, h("kbd", {}, "↑↓"), " ", t("search.kNavigate")),
      h("span", {}, h("kbd", {}, "↵"), " ", t("search.kOpen")),
      h("span", {}, h("kbd", {}, isMac ? "⌘↵" : "Ctrl ↵"), " ", t("search.kNewTab")),
      h("span", {}, h("kbd", {}, ">"), " ", t("search.kCommands")),
      h("span", {}, h("kbd", {}, "!yt"), " ", t("search.kBangs")),
    ),
  );
  resultsEl.classList.remove("hidden");
  form.classList.add("open");
  input.setAttribute("aria-expanded", "true");
  input.setAttribute("aria-activedescendant", `result-${active}`);
}

function setActive(i) {
  const count = items.filter((x) => !x.section).length;
  active = (i + count) % count;
  for (const el of resultsEl.querySelectorAll(".result")) {
    const on = el.id === `result-${active}`;
    el.classList.toggle("active", on);
    el.setAttribute("aria-selected", String(on));
    if (on) el.scrollIntoView({ block: "nearest" });
  }
  input.setAttribute("aria-activedescendant", `result-${active}`);
}

function close() {
  resultsEl.classList.add("hidden");
  form.classList.remove("open");
  input.setAttribute("aria-expanded", "false");
}

async function update() {
  const my = ++seq;
  updateBangChip();
  const next = await collect(input.value);
  if (my !== seq) return;
  items = next;
  active = 0;
  render();
}

function updateBangChip() {
  const chip = document.getElementById("bangChip");
  const bang = parseBang(input.value, app.settings);
  chip.classList.toggle("hidden", !bang);
  if (bang) chip.textContent = bang.engine.name;
}

async function execute(item, newTab = false) {
  if (!item) return;
  switch (item.type) {
    case "search":
      await runSearch(item.engine, item.query, newTab);
      break;
    case "url":
      await navigate(item.url, newTab);
      break;
    case "tab":
      await switchToTab(item.tab);
      break;
    case "calc":
      if (await copyText(item.copy)) toast(t("search.copied", { v: item.copy }));
      break;
    case "command":
      input.value = "";
      close();
      input.blur();
      await item.run();
      break;
    case "note":
      input.value = "";
      close();
      document.dispatchEvent(new CustomEvent("netab:open-note", { detail: item.note.id }));
      break;
    case "perm": {
      const ok = await chrome.permissions.request({ permissions: ["bookmarks", "history"] }).catch(() => false);
      if (ok) {
        toast(t("search.enabled"), { kind: "success" });
        input.focus();
        update();
      }
      break;
    }
    default:
      break;
  }
}

function renderEngineButton() {
  const btn = document.getElementById("engineBtn");
  const engine = engineById(app.settings, app.settings.search.engine);
  clear(btn);
  if (engine.id === "default" || !engine.url) btn.appendChild(icon("search", 18));
  else btn.appendChild(faviconIcon(engineHome(engine)));
  btn.title = `${t("search.engine")}: ${engine.id === "default" ? t("search.defaultEngine") : engine.name}`;
}

function engineMenu(anchor) {
  const current = app.settings.search.engine;
  openMenu(
    anchor,
    allEngines(app.settings)
      .filter((e) => ["default", "google", "bing", "duckduckgo", "brave", "chatgpt", "perplexity", "claude", "youtube", "github", "wikipedia"].includes(e.id) || e.custom)
      .map((e) => ({
        label: `${e.id === current ? "✓ " : ""}${e.id === "default" ? t("search.defaultEngine") : e.name}${e.bang ? `  !${e.bang}` : ""}`,
        icon: e.id === current ? "check" : "search",
        onClick: () => updateSettings({ search: { engine: e.id } }),
      })),
  );
}

export function focusSearch(prefill) {
  if (typeof prefill === "string") input.value = prefill;
  input.focus();
  if (prefill) update();
}

export function initSearch({ commands }) {
  commandsProvider = commands;
  input = document.getElementById("searchInput");
  form = document.getElementById("searchForm");
  resultsEl = document.getElementById("searchResults");
  box = form;
  document.getElementById("searchKbd").textContent = isMac ? "⌘K" : "Ctrl K";
  document.getElementById("engineBtn").addEventListener("click", (e) => engineMenu(e.currentTarget));
  renderEngineButton();
  cachedRates().then((r) => {
    rates = r;
  });

  const run = debounce(update, 60);
  input.addEventListener("input", run);
  input.addEventListener("focus", () => {
    tabsCache = null;
    if (input.value.trim()) update();
  });
  input.addEventListener("blur", () => setTimeout(close, 120));
  input.addEventListener("keydown", (e) => {
    const selectable = items.filter((x) => !x.section);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (resultsEl.classList.contains("hidden")) update();
      else setActive(active + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(active - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      run.cancel();
      const newTab = e.ctrlKey || e.metaKey || e.shiftKey;
      if (!resultsEl.classList.contains("hidden") && selectable[active]) execute(selectable[active], newTab);
      else
        collect(input.value).then((list) => {
          const first = list.find((x) => !x.section);
          execute(first, newTab);
        });
    } else if (e.key === "Escape") {
      if (!resultsEl.classList.contains("hidden")) close();
      else if (input.value) input.value = "";
      else input.blur();
      updateBangChip();
    } else if (e.key === "Tab" && !e.shiftKey) {
      // Tab-to-search: "yt" + Tab → "!yt "
      const word = input.value.trim().toLowerCase();
      const engine = allEngines(app.settings).find((x) => x.bang && x.bang === word);
      if (engine && !input.value.includes(" ")) {
        e.preventDefault();
        input.value = `!${engine.bang} `;
        update();
      }
    }
  });
  form.addEventListener("submit", (e) => e.preventDefault());
  box.addEventListener("mousedown", (e) => {
    if (e.target === form) input.focus();
  });
  on("settings", ({ settings, prev, langChanged }) => {
    const searchSection = document.getElementById("searchForm");
    searchSection.classList.toggle("hidden", !settings.search.show);
    if (langChanged || settings.search.engine !== prev?.search?.engine || JSON.stringify(settings.search.custom) !== JSON.stringify(prev?.search?.custom)) renderEngineButton();
  });
  document.getElementById("searchForm").classList.toggle("hidden", !app.settings.search.show);
}
