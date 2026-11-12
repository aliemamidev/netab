// Widget registry + grid host (new tab) with edit-layout mode and gallery.

import { h, clear, fill } from "../../lib/utils.js";
import { icon } from "../../lib/icons.js";
import { t } from "../../lib/i18n.js";
import { app, on, updateSettings } from "../app.js";
import { dialog, openMenu, sortable } from "../../lib/ui.js";

import daily from "./daily.js";
import todo from "./todo.js";
import focus from "./focus.js";
import weather from "./weather.js";
import calendar from "./calendar.js";
import notes from "./notes.js";
import markets from "./markets.js";
import readlater from "./readlater.js";
import sessions from "./sessions.js";
import worldclock from "./worldclock.js";
import system from "./system.js";

export const WIDGETS = { daily, todo, focus, weather, calendar, notes, markets, readlater, sessions, worldclock, system };

/** Build a card frame and mount a widget into it. */
export function mountWidget(def, { surface = "newtab", editing = false, onHide } = {}) {
  const actions = h("div", { class: "widget-actions" });
  const badge = h("span", { class: "badge widget-badge hidden" });
  const body = h("div", { class: "widget-body", dataset: { widget: def.id } });
  let menuItems = null;
  const frameItems = () =>
    surface === "newtab"
      ? [
          { label: t("widgets.hide"), icon: "eyeOff", onClick: () => onHide?.(def.id) },
          { label: t("widgets.arrange"), icon: "layout", onClick: () => setEditing(true) },
        ]
      : [];
  const menuBtn = h(
    "button",
    {
      class: "icon-btn sm widget-menu",
      type: "button",
      title: t("widgets.options"),
      onclick: (e) => {
        const own = menuItems ? menuItems().filter(Boolean) : [];
        const frame = frameItems();
        openMenu(e.currentTarget, [...own, ...(own.length && frame.length ? ["separator"] : []), ...frame]);
      },
    },
    icon("more", 16),
  );
  if (surface !== "newtab") menuBtn.classList.add("hidden");
  const card = h(
    "article",
    { class: `widget glass size-${def.size || "md"}`, dataset: { id: def.id } },
    h(
      "header",
      { class: "widget-header" },
      h("span", { class: "widget-handle", title: t("widgets.drag") }, icon("grip", 16)),
      h("span", { class: "widget-icon" }, icon(def.icon, 16)),
      h("h3", { class: "widget-title" }, def.title()),
      badge,
      h("span", { class: "spacer" }),
      actions,
      menuBtn,
    ),
    body,
  );
  if (editing) card.draggable = true;
  const ctx = {
    surface,
    card,
    setActions(nodes) {
      fill(actions, ...nodes);
    },
    /** Widget-specific items shown in the card's ⋯ menu. */
    setMenu(itemsFn) {
      menuItems = itemsFn;
      menuBtn.classList.remove("hidden");
    },
    setBadge(value) {
      badge.textContent = value === "" || value === undefined ? "" : String(value);
      badge.classList.toggle("hidden", !badge.textContent);
    },
  };
  let instance = {};
  try {
    instance = def.mount(body, ctx) || {};
  } catch (error) {
    console.error(`Widget ${def.id} failed`, error);
    body.textContent = t("common.error");
  }
  return { card, instance };
}

// ---------------------------------------------------------------------------
// New tab grid

let grid = null;
let mounted = [];
let editing = false;

function setEditing(value) {
  editing = value;
  document.getElementById("widgetsToolbar")?.classList.toggle("hidden", !editing);
  grid?.classList.toggle("editing", editing);
  for (const { card } of mounted) card.draggable = editing;
  if (editing) document.getElementById("widgetsSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function hideWidget(id) {
  updateSettings((cur) => {
    cur.widgets.enabled[id] = false;
    return cur;
  });
}

export function renderWidgets() {
  for (const m of mounted) m.instance.destroy?.();
  mounted = [];
  clear(grid);
  const s = app.settings;
  document.getElementById("widgetsSection")?.classList.toggle("hidden", !s.widgets.show);
  if (!s.widgets.show) return;
  const ids = s.widgets.order.filter((id) => s.widgets.enabled[id] && WIDGETS[id]);
  ids.forEach((id, index) => {
    const m = mountWidget(WIDGETS[id], { surface: "newtab", editing, onHide: hideWidget });
    m.card.dataset.index = String(index);
    m.card.style.animationDelay = `${Math.min(index, 8) * 40}ms`;
    grid.appendChild(m.card);
    mounted.push({ id, ...m });
  });
  if (!ids.length) {
    grid.appendChild(
      h(
        "div",
        { class: "widgets-empty" },
        h("button", { class: "btn", type: "button", onclick: openGallery }, icon("plus", 16), h("span", {}, t("widgets.add"))),
      ),
    );
  }
}

export function findWidget(id) {
  return mounted.find((m) => m.id === id);
}

export function initWidgets() {
  grid = document.getElementById("widgetsGrid");
  document.getElementById("widgetsDoneBtn")?.addEventListener("click", () => setEditing(false));
  sortable(
    grid,
    ".widget",
    (from, to) => {
      const visible = mounted.map((m) => m.id);
      const moved = visible[from];
      const target = visible[to];
      updateSettings((cur) => {
        const order = cur.widgets.order.filter((id) => id !== moved);
        const at = order.indexOf(target);
        order.splice(from < to ? at + 1 : at, 0, moved);
        cur.widgets.order = order;
        return cur;
      });
    },
    { enabled: () => editing },
  );
  renderWidgets();
  on("settings", ({ settings, prev, langChanged }) => {
    if (langChanged || JSON.stringify(settings.widgets) !== JSON.stringify(prev?.widgets)) renderWidgets();
  });
}

export async function openGallery() {
  const list = h("div", { class: "gallery" });
  const render = () => {
    clear(list);
    for (const id of app.settings.widgets.order) {
      const def = WIDGETS[id];
      if (!def) continue;
      const on = app.settings.widgets.enabled[id];
      list.appendChild(
        h(
          "label",
          { class: `gallery-item ${on ? "on" : ""}` },
          h("span", { class: "gallery-icon" }, icon(def.icon, 20)),
          h("span", { class: "gallery-text" }, h("strong", {}, def.title()), h("small", {}, def.desc())),
          h(
            "span",
            { class: "switch" },
            h("input", {
              type: "checkbox",
              checked: on,
              onchange: async (e) => {
                await updateSettings((cur) => {
                  cur.widgets.enabled[id] = e.target.checked;
                  cur.widgets.show = true;
                  return cur;
                });
                render();
              },
            }),
            h("span", {}),
          ),
        ),
      );
    }
  };
  render();
  await dialog({
    title: t("widgets.gallery"),
    wide: true,
    body: h("div", {}, h("p", { class: "dialog-text" }, t("widgets.galleryIntro")), list),
    buttons: [
      {
        label: t("widgets.arrange"),
        value: () => {
          setTimeout(() => setEditing(true), 200);
          return "arrange";
        },
      },
      { label: t("common.done"), kind: "primary", value: true },
    ],
  });
}
