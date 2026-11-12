// Shown instead of a distracting site while a focus session is running.

import { applyI18n, t, digits } from "../lib/i18n.js";
import { applyTheme } from "../lib/theme.js";
import { KEYS, get, update, loadSettings, subscribe } from "../lib/storage.js";
import * as Focus from "../lib/focus.js";
import { hostname, isHttpUrl } from "../lib/utils.js";

const target = new URLSearchParams(location.search).get("u") || "";
const host = hostname(target);

async function main() {
  const settings = await loadSettings();
  applyTheme(settings);
  applyI18n(document);
  document.title = t("blocked.title");
  document.getElementById("site").textContent = host;
  const messages = ["blocked.m1", "blocked.m2", "blocked.m3", "blocked.m4"];
  document.getElementById("message").textContent = t(messages[Math.floor(Math.random() * messages.length)]);

  let state = Focus.normalizeFocusState(await get(KEYS.focusState, null));
  const timeEl = document.getElementById("time");
  const tick = () => {
    timeEl.textContent = digits(Focus.formatClock(Focus.remainingMs(state, settings.focus)));
    // Session over → let the user continue to the page.
    if (!Focus.isFocusing(state) && isHttpUrl(target)) location.replace(target);
  };
  tick();
  setInterval(tick, 1000);
  subscribe(KEYS.focusState, (v) => {
    state = Focus.normalizeFocusState(v);
    tick();
  });

  document.getElementById("backBtn").addEventListener("click", () => {
    if (history.length > 2) history.go(-2);
    else location.replace(chrome.runtime.getURL("src/newtab/newtab.html"));
  });
  document.getElementById("allowBtn").addEventListener("click", async () => {
    await update(KEYS.focusAllow, (allow) => ({ ...(allow || {}), [host]: Date.now() + 5 * 60_000 }), {});
    if (isHttpUrl(target)) location.replace(target);
  });
}

main();
