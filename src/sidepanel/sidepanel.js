// Side panel: tasks, notes, focus timer, read later and sessions next to any page.

import { h, clear } from "../lib/utils.js";
import { hydrateIcons, icon } from "../lib/icons.js";
import { t } from "../lib/i18n.js";
import { initApp, on } from "../newtab/app.js";
import { WIDGETS, mountWidget } from "../newtab/widgets/index.js";

const TABS = ["todo", "notes", "focus", "readlater", "sessions", "calendar"];
const KEY = "netab.sidepanel.tab";
let active = "todo";
let mounted = null;

function renderTabs() {
  const nav = document.getElementById("tabs");
  clear(nav);
  for (const id of TABS) {
    const def = WIDGETS[id];
    nav.appendChild(
      h(
        "button",
        {
          class: `sp-tab ${id === active ? "active" : ""}`,
          type: "button",
          role: "tab",
          "aria-selected": String(id === active),
          onclick: () => select(id),
        },
        icon(def.icon, 15),
        h("span", {}, def.title()),
      ),
    );
  }
}

function select(id) {
  active = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* ignore */
  }
  renderTabs();
  mounted?.instance?.destroy?.();
  const panel = document.getElementById("panel");
  mounted = mountWidget(WIDGETS[id], { surface: "sidepanel" });
  clear(panel).appendChild(mounted.card);
  setTimeout(() => mounted.instance?.focus?.(), 50);
}

async function main() {
  await initApp("sidepanel");
  hydrateIcons(document);
  document.title = `NeTab — ${t("about.kSidePanel")}`;
  try {
    const saved = localStorage.getItem(KEY);
    if (TABS.includes(saved)) active = saved;
  } catch {
    /* ignore */
  }
  document.getElementById("openDashboard").addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("src/newtab/newtab.html") }));
  select(active);
  on("settings", ({ langChanged }) => {
    if (langChanged) select(active);
  });
}

main().catch((error) => console.error(error));
