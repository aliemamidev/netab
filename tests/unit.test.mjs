import { test } from "node:test";
import assert from "node:assert/strict";

import { calculate, evaluate, convertUnits, formatResult } from "../src/lib/calc.js";
import { fuzzyScore } from "../src/lib/fuzzy.js";
import { parseBang, engineUrl, allEngines } from "../src/lib/engines.js";
import * as Focus from "../src/lib/focus.js";
import { monthGrid, calendarParts, resolveCalendars, formatDate, shiftMonth } from "../src/lib/dates.js";
import { looksLikeUrl, normalizeUrl, hostMatches, toLatinDigits, deepMerge, hostname, isHttpUrl } from "../src/lib/utils.js";
import { normalizeSettings, DEFAULT_SETTINGS, WIDGET_IDS } from "../src/lib/storage.js";
import { normalizeLinks, normalizeMedia, fileKind } from "../src/lib/config.js";
import { quoteOfDay, QUOTES } from "../src/lib/quotes.js";
import { encodeQR } from "../src/lib/qr.js";
import { instantAnswers, randomPassword, parseColor, findTimeZone } from "../src/lib/instant.js";

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test("calculator: precedence, functions, implicit multiplication", () => {
  assert.equal(evaluate("12*(4+5)"), 108);
  assert.equal(evaluate("2+3*4"), 14);
  assert.equal(evaluate("2^3^2"), 512);
  assert.equal(evaluate("-2^2"), -4);
  assert.equal(evaluate("2(3+4)"), 14);
  close(evaluate("2pi"), Math.PI * 2);
  close(evaluate("sqrt(2)"), Math.SQRT2);
  assert.equal(evaluate("max(1,200,3)"), 200);
  assert.equal(evaluate("5!"), 120);
  assert.equal(evaluate("10 % 4"), 2);
  assert.equal(evaluate("1_000 * 2"), 2000);
  assert.equal(evaluate("6 ÷ 3 × 2"), 4);
});

test("calculator: persian digits and percent-of", () => {
  assert.equal(calculate("۱۲+۳").value, 15);
  assert.equal(calculate("15% of 80").value, 12);
  assert.equal(calculate("۲۰٪ از ۵۰".replace("٪", "%")).value, 10);
});

test("calculator ignores plain text and lone numbers", () => {
  assert.equal(calculate("hello world"), null);
  assert.equal(calculate("42"), null);
  assert.equal(calculate("github"), null);
  assert.equal(calculate("pi"), null);
  assert.equal(calculate("e"), null);
  assert.equal(calculate("2 +"), null);
  assert.equal(calculate("alert(1)"), null);
});

test("unit conversion", () => {
  close(convertUnits("10 km to mi").value, 6.21371192);
  close(convertUnits("100 f to c").value, 37.7777778);
  close(convertUnits("0 c in k").value, 273.15);
  close(convertUnits("1 gb to mb").value, 1000);
  close(convertUnits("1 gib to mib").value, 1024);
  close(convertUnits("2 h to min").value, 120);
  close(convertUnits("1 lb to kg").value, 0.45359237);
  assert.equal(convertUnits("1 km to kg"), null);
  close(convertUnits("100 usd to eur", { USD: 1, EUR: 0.5 }).value, 50);
  assert.equal(calculate("5 ft to cm").kind, "unit");
});

test("formatResult", () => {
  assert.equal(formatResult(108, "en-US"), "108");
  assert.equal(formatResult(1 / 3, "en-US"), "0.3333333333");
  assert.equal(formatResult(Infinity, "en-US"), "∞");
  assert.match(formatResult(1e20, "en-US"), /e\+?20/);
});

test("fuzzy scoring prefers prefixes and word starts", () => {
  assert.ok(fuzzyScore("git", "GitHub") > fuzzyScore("git", "Digital"));
  assert.ok(fuzzyScore("gh", "GitHub") > -Infinity);
  assert.equal(fuzzyScore("xyz", "GitHub"), -Infinity);
  assert.ok(fuzzyScore("open set", "Open settings") > -Infinity);
});

test("bangs: prefix, suffix, colon form and custom engines", () => {
  assert.equal(parseBang("!yt lofi beats").engine.id, "youtube");
  assert.equal(parseBang("!yt lofi beats").query, "lofi beats");
  assert.equal(parseBang("lofi beats !yt").engine.id, "youtube");
  assert.equal(parseBang("gh: netab").engine.id, "github");
  assert.equal(parseBang("!nope test"), null);
  assert.equal(parseBang("plain query"), null);
  const settings = { search: { custom: [{ id: "c1", name: "Docs", bang: "!dx", url: "https://docs.example/?q=%s" }] } };
  assert.equal(parseBang("!dx hooks", settings).engine.name, "Docs");
  assert.equal(engineUrl(allEngines(settings).find((e) => e.id === "c1"), "a b&c"), "https://docs.example/?q=a%20b%26c");
  // Custom engines without %s or with non-http URLs are ignored.
  assert.equal(allEngines({ search: { custom: [{ name: "Bad", bang: "x1", url: "javascript:alert(%s)" }] } }).some((e) => e.name === "Bad"), false);
});

test("focus timer state machine", () => {
  const s = { work: 25, short: 5, long: 15, longEvery: 4, autoBreak: true, autoWork: false };
  let st = Focus.defaultFocusState();
  assert.equal(Focus.remainingMs(st, s), 25 * 60000);
  st = Focus.start(st, s, 0);
  assert.equal(st.status, "running");
  assert.equal(Focus.remainingMs(st, s, 60000), 24 * 60000);
  st = Focus.pause(st, s, 60000);
  assert.equal(st.status, "paused");
  assert.equal(Focus.remainingMs(st, s, 999999), 24 * 60000);
  st = Focus.start(st, s, 100000);
  assert.equal(st.endsAt, 100000 + 24 * 60000);

  // Complete four work sessions: short, short, short, long.
  let state = Focus.defaultFocusState();
  const phases = [];
  for (let i = 0; i < 4; i += 1) {
    state = Focus.start({ ...state, phase: "work" }, s, 0);
    const res = Focus.complete(state, s, 0);
    phases.push(res.state.phase);
    assert.equal(res.finished, "work");
    assert.equal(res.state.status, "running"); // autoBreak
    state = res.state;
  }
  assert.deepEqual(phases, ["short", "short", "short", "long"]);
  const afterLong = Focus.complete(state, s, 0);
  assert.equal(afterLong.state.phase, "work");
  assert.equal(afterLong.state.status, "idle"); // autoWork off
  assert.equal(afterLong.state.cycle, 0);
  assert.equal(Focus.formatClock(61000), "01:01");
  assert.equal(Focus.normalizeFocusState({ phase: "bogus", status: "x" }).phase, "work");
});

test("Persian (Jalali) calendar grid", () => {
  // 1 Farvardin 1403 = 20 March 2024
  const nowruz = new Date(2024, 2, 20, 12);
  const parts = calendarParts(nowruz, "persian");
  assert.deepEqual(parts, { year: 1403, month: 1, day: 1 });
  const grid = monthGrid(nowruz, "persian", 6, nowruz);
  assert.equal(grid.length, 31);
  assert.equal(grid.cells.length % 7, 0);
  const inMonth = grid.cells.filter((c) => c.inMonth);
  assert.equal(inMonth[0].day, 1);
  assert.equal(inMonth.at(-1).day, 31);
  assert.equal(grid.cells.filter((c) => c.isToday).length, 1);
  // Esfand 1402 has 29 days.
  const esfand = monthGrid(new Date(2024, 2, 10, 12), "persian", 6);
  assert.equal(esfand.length, 29);
  // Gregorian February 2024 (leap year).
  assert.equal(monthGrid(new Date(2024, 1, 10, 12), "gregory", 1).length, 29);
  // Month navigation stays consistent.
  const next = shiftMonth(nowruz, "persian", 1);
  assert.equal(calendarParts(next, "persian").month, 2);
});

test("calendar defaults follow the language", () => {
  assert.deepEqual(resolveCalendars({ calendar: { primary: "auto", secondary: "auto" } }, "fa"), { primary: "persian", secondary: "gregory" });
  assert.deepEqual(resolveCalendars({ calendar: { primary: "auto", secondary: "auto" } }, "en"), { primary: "gregory", secondary: "none" });
  assert.match(formatDate(new Date(2024, 2, 20, 12), "persian", "fa"), /فروردین/);
  assert.ok(!formatDate(new Date(2024, 2, 20, 12), "persian", "fa").includes(","));
});

test("url helpers", () => {
  for (const yes of ["github.com", "https://x.com/a", "localhost:3000", "192.168.1.1", "digikala.ir/search", "example.dev"]) assert.ok(looksLikeUrl(yes), yes);
  for (const no of ["hello world", "what is js", "node.js tutorial", "10 km to mi", "12*3"]) assert.ok(!looksLikeUrl(no), no);
  assert.equal(normalizeUrl("github.com"), "https://github.com");
  assert.equal(normalizeUrl("localhost:3000"), "http://localhost:3000");
  assert.equal(hostname("https://www.youtube.com/watch?v=1"), "youtube.com");
  assert.ok(hostMatches("m.youtube.com", ["youtube.com"]));
  assert.ok(hostMatches("www.reddit.com", ["https://reddit.com/r/all"]));
  assert.ok(!hostMatches("notyoutube.com", ["youtube.com"]));
  assert.ok(isHttpUrl("https://a.b") && !isHttpUrl("javascript:alert(1)"));
  assert.equal(toLatinDigits("۱۲۳٫۴"), "123.4");
});

test("settings normalisation repairs bad data and keeps widgets complete", () => {
  const s = normalizeSettings({ theme: "neon", accent: "red", widgets: { order: ["todo", "ghost"], enabled: { todo: false } }, focus: { work: 9999, blocklist: "nope" } });
  assert.equal(s.theme, "dark");
  assert.equal(s.accent, DEFAULT_SETTINGS.accent);
  assert.equal(s.widgets.order[0], "todo");
  assert.deepEqual([...s.widgets.order].sort(), [...WIDGET_IDS].sort());
  assert.equal(s.widgets.enabled.todo, false);
  assert.equal(s.focus.work, 180);
  assert.ok(Array.isArray(s.focus.blocklist));
  assert.deepEqual(deepMerge({ a: { b: 1, c: [1] } }, { a: { c: [2] } }), { a: { b: 1, c: [2] } });
});

test("links and media normalisation (NeTab 2.x compatible)", () => {
  const links = normalizeLinks({ groups: [{ name: "Work", links: [{ label: "GH", url: "https://github.com" }] }] });
  assert.equal(links.title, "Quick Links");
  assert.equal(links.groups[0].links[0].enabled, true);
  assert.ok(links.groups[0].id && links.groups[0].links[0].id);
  const media = normalizeMedia({ settings: { blur: 99, mode: "bogus" }, photos: ["media/photos/a.jpg"] });
  assert.equal(media.settings.blur, 24);
  assert.equal(media.settings.mode, "mixed");
  assert.equal(media.photos[0].name, "a.jpg");
  assert.equal(fileKind("x.webm"), "video");
  assert.equal(fileKind("x.bin", "image/png"), "photo");
  assert.equal(fileKind("x.exe"), "");
});

test("i18n picks singular forms and Persian digits", async () => {
  const { t, setLang, digits } = await import("../src/lib/i18n.js");
  setLang("en");
  assert.equal(t("tabs.nTabs", { n: 1 }), "1 tab");
  assert.equal(t("tabs.nTabs", { n: 3 }), "3 tabs");
  setLang("fa");
  assert.equal(t("tabs.nTabs", { n: 1 }), "۱ زبانه");
  assert.equal(digits("25:00"), "۲۵:۰۰");
  setLang("en");
  assert.equal(digits("25:00"), "25:00");
});

test("QR encoder: sizes, finder patterns, versions and capacity", () => {
  const small = encodeQR("HELLO", "M");
  assert.equal(small.version, 1);
  assert.equal(small.size, 21);
  // Finder pattern corners: dark 7×7 ring with light separator.
  for (const [x, y] of [
    [0, 0],
    [small.size - 7, 0],
    [0, small.size - 7],
  ]) {
    assert.equal(small.modules[y][x], true);
    assert.equal(small.modules[y + 1][x + 1], false);
    assert.equal(small.modules[y + 3][x + 3], true);
  }
  // Dark module and timing pattern.
  assert.equal(small.modules[small.size - 8][8], true);
  for (let i = 8; i < small.size - 8; i += 1) assert.equal(small.modules[6][i], i % 2 === 0);
  // Longer data picks a bigger version (with version info from v7 up).
  const long = encodeQR("https://example.com/" + "a".repeat(200), "M");
  assert.ok(long.version >= 7);
  assert.equal(long.size, long.version * 4 + 17);
  // UTF-8 (Persian) works and output is deterministic.
  assert.deepEqual(encodeQR("سلام", "Q").modules, encodeQR("سلام", "Q").modules);
  assert.throws(() => encodeQR("x".repeat(5000), "H"));
});

test("instant answers", () => {
  const ctx = { t: (k, v) => `${k}${v ? JSON.stringify(v) : ""}`, dateTime: (d) => d.toISOString(), timeIn: (d, tz) => ({ time: tz, date: "", offset: "" }) };
  assert.match(instantAnswers("uuid", ctx)[0].title, /^[0-9a-f-]{36}$/);
  const pwd = instantAnswers("password 32", ctx)[0].title;
  assert.equal(pwd.length, 32);
  assert.match(pwd, /[a-z]/);
  assert.match(pwd, /[A-Z]/);
  assert.match(pwd, /[0-9]/);
  assert.match(pwd, /[!@#$%^&*\-_=+?]/);
  assert.equal(randomPassword(3).length, 6); // clamped minimum
  assert.equal(instantAnswers("time in tokyo", ctx)[0].title, "Asia/Tokyo");
  assert.equal(instantAnswers("ساعت تهران", ctx)[0].title, "Asia/Tehran");
  assert.equal(instantAnswers("new york time", ctx)[0].title, "America/New_York");
  assert.equal(findTimeZone("atlantis"), null);
  assert.equal(findTimeZone("san francisco").label, "San Francisco");
  assert.equal(findTimeZone("tokyo").label, "Tokyo");
  const ts = instantAnswers("1700000000", ctx)[0];
  assert.equal(ts.copy, "2023-11-14T22:13:20.000Z");
  assert.equal(ts.weak, true);
  assert.deepEqual(parseColor("#7c9cff"), { hex: "#7c9cff", rgb: "rgb(124, 156, 255)", hsl: "hsl(225, 100%, 74%)" });
  assert.equal(parseColor("rgb(255, 0, 0)").hex, "#ff0000");
  assert.equal(parseColor("hsl(120, 100%, 50%)").hex, "#00ff00");
  assert.equal(parseColor("bad"), null);
  assert.equal(instantAnswers("base64 سلام", ctx)[0].title, "2LPZhNin2YU=");
  assert.equal(instantAnswers("base64d 2LPZhNin2YU=", ctx)[0].title, "سلام");
  assert.deepEqual(instantAnswers("hello world", ctx), []);
});

test("quotes are stable per day", () => {
  const d = new Date(2026, 4, 5);
  assert.deepEqual(quoteOfDay("en", d), quoteOfDay("en", d));
  assert.ok(QUOTES.fa.length > 10 && QUOTES.en.length > 10);
});
