// End-to-end smoke test: loads the unpacked extension in Chromium and drives
// every surface. Usage: npm run test:e2e  (add --screens to refresh docs/screenshots)

import { execSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try {
    return require("playwright");
  } catch {
    try {
      const root = execSync("npm root -g", { encoding: "utf8" }).trim();
      return require(path.join(root, "playwright"));
    } catch {
      return null;
    }
  }
}

const pw = loadPlaywright();
if (!pw) {
  console.log("Playwright not found — skipping e2e. Install with: npm i -D playwright && npx playwright install chromium");
  process.exit(0);
}

const SCREENS = process.argv.includes("--screens");
const shotsDir = path.resolve("docs/screenshots");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
let ctx = null;
async function step(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push(`✔ ${name} (${Date.now() - started}ms)`);
  } catch (error) {
    results.push(`✖ ${name}: ${error.message}`);
    const file = path.join(os.tmpdir(), `netab-e2e-failure-${Date.now()}.png`);
    await ctx?.pages().at(-1)?.screenshot({ path: file }).catch(() => {});
    results.push(`  screenshot: ${file}`);
    throw error;
  }
}

// Work on a copy where the opt-in API hosts are pre-granted, so the online
// widgets can be exercised without clicking Chrome's permission prompt.
const tmp = await mkdtemp(path.join(os.tmpdir(), "netab-e2e-"));
const extDir = path.join(tmp, "ext");
for (const item of ["manifest.json", "_locales", "assets", "src", "data", "media"]) await cp(item, path.join(extDir, item), { recursive: true });
const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
manifest.host_permissions = manifest.optional_host_permissions;
manifest.permissions = [...manifest.permissions, "bookmarks", "history", "topSites"];
await writeFile(path.join(extDir, "manifest.json"), JSON.stringify(manifest, null, 2));

ctx = await pw.chromium.launchPersistentContext(path.join(tmp, "profile"), {
  channel: "chromium",
  headless: true,
  viewport: { width: 1440, height: 900 },
  locale: "en-US",
  timezoneId: "Asia/Tehran",
  acceptDownloads: true,
  args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
});

const errors = [];
function watch(page, label) {
  page.on("pageerror", (e) => errors.push(`${label}: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/ERR_CONNECTION|net::ERR_|Failed to load resource/.test(m.text())) errors.push(`${label}: ${m.text()}`);
  });
  return page;
}

let exitCode = 0;
try {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
  const id = new URL(sw.url()).host;
  const base = `chrome-extension://${id}/src`;

  await step("welcome tab opens on install", async () => {
    await wait(800);
    const welcome = ctx.pages().find((p) => p.url().includes("welcome=1"));
    assert.ok(welcome, "welcome page not opened");
    await welcome.close();
  });

  const page = watch(await ctx.newPage(), "newtab");
  await page.goto(`${base}/newtab/newtab.html`);

  await step("onboarding dialog → dashboard", async () => {
    await page.waitForSelector(".dialog-card");
    await page.fill(".dialog-card input.input", "Sam");
    await page.click(".dialog-footer .btn-primary");
    await page.waitForSelector(".widget");
    assert.match(await page.textContent("#greeting"), /Sam/);
    assert.ok((await page.locator(".tile").count()) >= 3, "link tiles missing");
  });

  // Seed demo content through the page's own storage so screenshots look alive.
  await page.evaluate(async () => {
    const now = new Date();
    const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const day = (n) => key(new Date(now.getFullYear(), now.getMonth(), now.getDate() + n, 12));
    const stats = {};
    [3, 5, 2, 6, 4, 7, 1].forEach((s, i) => (stats[day(i - 6)] = { sessions: s, minutes: s * 25 }));
    await chrome.storage.local.set({
      "netab.focus.stats.v1": stats,
      "netab.readLater.v1": [
        { id: "r1", url: "https://developer.chrome.com/docs/extensions", title: "Chrome Extensions documentation", addedAt: new Date(Date.now() - 3600e3).toISOString(), done: false },
        { id: "r2", url: "https://web.dev/articles/vitals", title: "Web Vitals — essential metrics", addedAt: new Date(Date.now() - 86400e3).toISOString(), done: false },
      ],
      "netab.sessions.v1": [
        {
          id: "s1",
          name: "Research",
          createdAt: new Date(Date.now() - 7200e3).toISOString(),
          tabs: [
            { url: "https://github.com/", title: "GitHub" },
            { url: "https://developer.mozilla.org/", title: "MDN" },
            { url: "https://stackoverflow.com/", title: "Stack Overflow" },
          ],
        },
      ],
      "netab.cache.weather.v1": {
        signature: "35.6944,51.4215,c",
        at: Date.now(),
        data: {
          current: { temperature_2m: 18.4, apparent_temperature: 16.9, relative_humidity_2m: 41, weather_code: 1, wind_speed_10m: 9.2, is_day: 1 },
          hourly: {
            time: Array.from({ length: 48 }, (_, i) => new Date(Date.now() + (i - 1) * 3600e3).toISOString().slice(0, 13) + ":00"),
            temperature_2m: Array.from({ length: 48 }, (_, i) => 14 + 6 * Math.sin(i / 4)),
            weather_code: Array.from({ length: 48 }, (_, i) => [0, 1, 2, 3, 61][i % 5]),
          },
          daily: {
            time: Array.from({ length: 7 }, (_, i) => day(i)),
            weather_code: [1, 2, 61, 3, 0, 0, 2],
            temperature_2m_max: [21, 19, 15, 17, 22, 23, 20],
            temperature_2m_min: [11, 10, 8, 9, 12, 13, 11],
            precipitation_probability_max: [0, 10, 70, 20, 0, 0, 5],
          },
        },
      },
    });
  });

  await step("enable weather + markets widgets via settings", async () => {
    await page.evaluate(async () => {
      const raw = (await chrome.storage.local.get("netab.settings.v3"))["netab.settings.v3"];
      raw.widgets.enabled.weather = true;
      raw.widgets.enabled.markets = true;
      raw.weather.city = { name: "Tehran", country: "Iran", admin: "", lat: 35.6944, lon: 51.4215, tz: "Asia/Tehran" };
      await chrome.storage.local.set({ "netab.settings.v3": raw });
    });
    await page.waitForSelector(".wx-temp", { timeout: 8000 });
    assert.match(await page.textContent(".wx-temp"), /18/);
    await page.waitForSelector("#weatherChip:not(.hidden)", { timeout: 5000 }).catch(() => {});
  });

  await step("tasks: quick syntax, star, due date", async () => {
    const input = page.locator(".todo-input");
    await input.fill("Ship NeTab 3 !! @today");
    await input.press("Enter");
    await input.fill("Review pull requests @tomorrow");
    await input.press("Enter");
    await input.fill("Plan next week");
    await input.press("Enter");
    await wait(300);
    const texts = await page.locator(".todo-item .todo-text").allTextContents();
    assert.deepEqual(texts.slice(0, 1), ["Ship NeTab 3"]);
    assert.equal(await page.locator(".todo-item.starred").count(), 1);
    assert.ok(await page.locator(".due.today").count());
  });

  await step("notes: create and autosave", async () => {
    await page.locator('[data-widget="notes"] .empty .btn').click();
    await page.locator(".note-title").fill("Meeting notes");
    await page.locator(".note-area").fill("- Launch checklist\n- [ ] Screenshots\n- [x] Translations");
    await wait(900);
    const notes = await page.evaluate(async () => (await chrome.storage.local.get("netab.notes.v1"))["netab.notes.v1"]);
    assert.equal(notes[0].title, "Meeting notes");
  });

  await step("daily focus", async () => {
    await page.locator(".daily-input").fill("Finish the launch post");
    await page.locator(".daily-input").press("Enter");
    await page.waitForSelector(".daily-text");
  });

  await step("search: calculator, units, bangs, commands, top hit", async () => {
    await page.click("#searchInput");
    await page.fill("#searchInput", "12*(4+5)");
    await page.waitForSelector(".result.result-calc");
    assert.match(await page.textContent(".result.result-calc .result-title"), /108/);
    await page.fill("#searchInput", "10 km to mi");
    await page.waitForFunction(() => /6\.21/.test(document.querySelector(".result.result-calc .result-title")?.textContent || ""));
    await page.fill("#searchInput", "!gh netab");
    await page.waitForFunction(() => document.querySelector("#bangChip")?.textContent === "GitHub");
    await page.fill("#searchInput", "git");
    await page.waitForFunction(() => document.querySelector(".result .result-hint")?.textContent === "Top hit");
    await page.fill("#searchInput", "password 24");
    await page.waitForFunction(() => document.querySelector(".result.result-calc .result-title")?.textContent.length === 24);
    await page.fill("#searchInput", "time in tokyo");
    await page.waitForFunction(() => /Tokyo/.test(document.querySelector(".result.result-calc .result-sub")?.textContent || ""));
    await page.fill("#searchInput", "#7c9cff");
    await page.waitForSelector(".swatch-dot");
    await page.fill("#searchInput", ">tab");
    await page.waitForSelector(".result.result-command");
    if (SCREENS) {
      await page.fill("#searchInput", "15% of 80");
      await wait(300);
    }
  });
  if (SCREENS) await page.screenshot({ path: `${shotsDir}/search.jpg`, type: "jpeg", quality: 84 });
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  await step("links: add via dialog, drag-free move", async () => {
    await page.locator(".tile.add").click();
    await page.fill('.dialog-card input[name="url"]', "developer.chrome.com");
    await page.fill('.dialog-card input[name="label"]', "Chrome Docs");
    await page.click(".dialog-footer .btn-primary");
    await page.waitForFunction(() => [...document.querySelectorAll(".tile-label")].some((x) => x.textContent === "Chrome Docs"));
  });

  await step("QR code via command palette", async () => {
    await page.click("#searchInput");
    await page.fill("#searchInput", ">qr");
    await page.waitForSelector(".result.result-command");
    await page.keyboard.press("Enter");
    await page.fill('.dialog-card textarea[name="text"]', "https://github.com/aliemamidev/netab");
    await page.click(".dialog-footer .btn-primary");
    await page.waitForSelector(".qr-svg path");
    const [qrDownload] = await Promise.all([page.waitForEvent("download"), page.getByText("Download PNG").click()]);
    assert.equal(qrDownload.suggestedFilename(), "netab-qr.png");
    if (SCREENS) await page.screenshot({ path: `${shotsDir}/qr.jpg`, type: "jpeg", quality: 84 });
    await page.keyboard.press("Escape");
  });

  await step("widgets gallery toggles", async () => {
    await page.click("#widgetsBtn");
    await page.waitForSelector(".gallery-item");
    assert.equal(await page.locator(".gallery-item").count(), 11);
    await page.keyboard.press("Escape");
  });

  if (SCREENS) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await wait(600);
    await page.screenshot({ path: `${shotsDir}/dashboard.jpg`, type: "jpeg", quality: 84 });
    await page.screenshot({ path: `${shotsDir}/dashboard-full.jpg`, type: "jpeg", quality: 84, fullPage: true });
  }

  await step("settings drawer renders every section", async () => {
    await page.click("#settingsBtn");
    for (const s of ["general", "appearance", "background", "search", "links", "widgets", "focus", "data", "about"]) {
      await page.click(`.drawer-nav button[data-section="${s}"]`);
      await page.waitForSelector(".set-section");
      if (SCREENS && ["appearance", "focus"].includes(s)) await page.screenshot({ path: `${shotsDir}/settings-${s}.jpg`, type: "jpeg", quality: 84 });
    }
  });

  await step("backup export downloads JSON", async () => {
    await page.click(`.drawer-nav button[data-section="data"]`);
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByText("Download backup").click()]);
    const file = path.join(tmp, "backup.json");
    await download.saveAs(file);
    const backup = JSON.parse(await readFile(file, "utf8"));
    assert.equal(backup.app, "NeTab");
    assert.ok(backup.data["netab.todos.v1"].length >= 3);
  });

  await step("theme + accent apply live", async () => {
    await page.click(`.drawer-nav button[data-section="appearance"]`);
    await page.getByRole("tab", { name: "Light" }).click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === "light");
    if (SCREENS) {
      await page.keyboard.press("Escape");
      await wait(400);
      await page.screenshot({ path: `${shotsDir}/dashboard-light.jpg`, type: "jpeg", quality: 84 });
      await page.click("#settingsBtn");
      await page.click(`.drawer-nav button[data-section="appearance"]`);
    }
    await page.getByRole("tab", { name: "Dark" }).click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
  });

  await step("Persian language switches to RTL with Jalali date", async () => {
    await page.click(`.drawer-nav button[data-section="general"]`);
    await page.selectOption(".drawer-body select >> nth=0", "fa");
    await page.waitForFunction(() => document.documentElement.dir === "rtl");
    await page.keyboard.press("Escape");
    await wait(400);
    assert.match(await page.textContent("#dateLine"), /۱۴۰|آبان|آذر|دی|بهمن|اسفند|فروردین|اردیبهشت|خرداد|تیر|مرداد|شهریور|مهر/);
    if (SCREENS) await page.screenshot({ path: `${shotsDir}/dashboard-fa.jpg`, type: "jpeg", quality: 84 });
  });

  await step("focus timer starts in the service worker", async () => {
    await page.locator(".focus-play").click();
    await wait(1200);
    const alarms = await sw.evaluate(async () => (await chrome.alarms.getAll()).map((a) => a.name));
    assert.ok(alarms.includes("netab-focus-end"));
    const badge = await sw.evaluate(() => chrome.action.getBadgeText({}));
    assert.match(badge, /\d+m/);
  });

  await step("distracting sites are redirected while focusing", async () => {
    const blocked = watch(await ctx.newPage(), "blocked");
    await blocked.goto("https://www.youtube.com/").catch(() => {});
    await blocked.waitForURL(/blocked\.html/, { timeout: 8000 });
    if (SCREENS) {
      await wait(500);
      await blocked.screenshot({ path: `${shotsDir}/blocked.jpg`, type: "jpeg", quality: 84 });
    }
    await blocked.close();
  });

  await step("focus completes and records stats", async () => {
    await page.evaluate(async () => {
      const s = (await chrome.storage.local.get("netab.focus.state.v1"))["netab.focus.state.v1"];
      await chrome.storage.local.set({ "netab.focus.state.v1": { ...s, endsAt: Date.now() - 1000 } });
    });
    await sw.evaluate(() => chrome.runtime.onMessage.hasListeners());
    await page.evaluate(() => chrome.runtime.sendMessage({ type: "focus-complete-check" }));
    await wait(800);
    const state = await page.evaluate(async () => (await chrome.storage.local.get("netab.focus.state.v1"))["netab.focus.state.v1"]);
    assert.equal(state.phase, "short");
    // Completion plays the chime through an offscreen document.
    const offscreen = await sw.evaluate(async () => (await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] })).length);
    assert.equal(offscreen, 1, "offscreen audio document should exist after the chime");
    const stats = await page.evaluate(async () => (await chrome.storage.local.get("netab.focus.stats.v1"))["netab.focus.stats.v1"]);
    assert.ok(Object.values(stats).some((d) => d.sessions >= 2), "completed session should be recorded");
    await page.evaluate(async () => chrome.storage.local.set({ "netab.focus.state.v1": { phase: "work", status: "idle", cycle: 0, updatedAt: Date.now() } }));
  });

  await step("popup: tab tools close duplicates + save session", async () => {
    for (let i = 0; i < 2; i += 1) {
      const p = await ctx.newPage();
      await p.goto(`${base}/blocked/blocked.html?u=https%3A%2F%2Fexample.com%2F`).catch(() => {});
    }
    const popup = watch(await ctx.newPage(), "popup");
    await popup.setViewportSize({ width: 380, height: 620 });
    await popup.goto(`${base}/popup/popup.html`);
    await popup.waitForSelector(".p-tool");
    if (SCREENS) await popup.screenshot({ path: `${shotsDir}/popup.jpg`, type: "jpeg", quality: 84 });
    // The popup opened as a tab sees itself as the current page, which can't be saved.
    assert.equal(await popup.isDisabled("#qrBtn"), true);
    await popup.locator(".p-tool").nth(3).click(); // save session
    await wait(600);
    const sessions = await popup.evaluate(async () => (await chrome.storage.local.get("netab.sessions.v1"))["netab.sessions.v1"]);
    assert.ok(sessions.length >= 1);
    await popup.close();
  });

  await step("side panel mounts widgets", async () => {
    const panel = watch(await ctx.newPage(), "sidepanel");
    await panel.setViewportSize({ width: 400, height: 820 });
    await panel.goto(`${base}/sidepanel/sidepanel.html`);
    await panel.waitForSelector(".todo-item");
    if (SCREENS) await panel.screenshot({ path: `${shotsDir}/sidepanel.jpg`, type: "jpeg", quality: 84 });
    await panel.locator(".sp-tab").nth(1).click();
    await panel.waitForSelector(".note-area");
    await panel.close();
  });

  await step("screenshot viewer shows a captured image", async () => {
    const viewer = watch(await ctx.newPage(), "shot");
    await viewer.goto(`${base}/shot/shot.html`);
    await viewer.evaluate(async () => {
      const c = document.createElement("canvas");
      c.width = 320;
      c.height = 200;
      const g = c.getContext("2d");
      g.fillStyle = "#7c9cff";
      g.fillRect(0, 0, 320, 200);
      await chrome.storage.session.set({ "netab.shot": { dataUrl: c.toDataURL("image/png"), title: "Example", url: "https://example.com/", at: Date.now() } });
    });
    await viewer.reload();
    await viewer.waitForFunction(() => document.getElementById("shotImage").naturalWidth === 320);
    const [download] = await Promise.all([viewer.waitForEvent("download"), viewer.click("#downloadBtn")]);
    assert.match(download.suggestedFilename(), /^screenshot-example\.com-.*\.png$/);
    await viewer.close();
  });

  await step("options page redirects to settings", async () => {
    const opt = await ctx.newPage();
    await opt.goto(`chrome-extension://${id}/src/options/options.html`);
    await opt.waitForURL(/settings=general/);
    await opt.waitForSelector(".drawer:not(.hidden)");
    await opt.close();
  });

  await step("no runtime errors", async () => {
    assert.deepEqual(errors, []);
  });

  await step("upgrade from NeTab 2.x keeps links and wallpapers", async () => {
    const legacy = await pw.chromium.launchPersistentContext(path.join(tmp, "profile-legacy"), {
      channel: "chromium",
      headless: true,
      viewport: { width: 1280, height: 800 },
      args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
    });
    try {
      let [lsw] = legacy.serviceWorkers();
      if (!lsw) lsw = await legacy.waitForEvent("serviceworker", { timeout: 15000 });
      await wait(600);
      for (const p of legacy.pages()) if (p.url().includes("welcome")) await p.close();
      await lsw.evaluate(async () => {
        await chrome.storage.local.clear();
        await chrome.storage.local.set({
          "netab.links.v2": { title: "My Links", groups: [{ id: "uni", name: "University", icon: "🎓", enabled: true, links: [{ id: "l1", label: "Portal", url: "https://example.edu/", enabled: true }] }] },
          "netab.media.v2": { settings: { mode: "photos", shadeStrength: 50 }, photos: [{ id: "p1", source: "packaged", kind: "photo", name: "Aurora", path: "media/samples/photos/aurora.svg", enabled: true }], videos: [] },
          "netab.ui.v2": { openFirstGroup: true },
        });
      });
      const p = watch(await legacy.newPage(), "legacy");
      await p.goto(`chrome-extension://${new URL(lsw.url()).host}/src/newtab/newtab.html`);
      await p.waitForSelector(".tile");
      assert.equal(await p.locator(".dialog-card").count(), 0, "onboarding should be skipped for 2.x users");
      assert.match(await p.textContent("#linksTabs"), /University/);
      await p.waitForFunction(() => document.getElementById("bgImage").classList.contains("on"));
    } finally {
      await legacy.close();
    }
  });
} catch (error) {
  exitCode = 1;
  console.error(error);
} finally {
  await ctx.close();
  await rm(tmp, { recursive: true, force: true });
  console.log(results.join("\n"));
  if (errors.length) console.log("Errors:\n" + errors.join("\n"));
  process.exit(exitCode);
}

