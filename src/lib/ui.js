// Shared UI primitives: toasts, dialogs, popover menus, drag-to-reorder.

import { h, clear } from "./utils.js";
import { icon } from "./icons.js";
import { t } from "./i18n.js";

// ---------------------------------------------------------------------------
// Toasts

function toastHost() {
  let host = document.getElementById("toastHost");
  if (!host) {
    host = h("div", { id: "toastHost", class: "toast-host", role: "status", "aria-live": "polite" });
    document.body.appendChild(host);
  }
  return host;
}

export function toast(message, { action, actionLabel, timeout = 3800, kind = "info" } = {}) {
  const host = toastHost();
  const el = h("div", { class: `toast toast-${kind}` }, h("span", { class: "toast-text" }, message));
  let timer = null;
  const close = () => {
    clearTimeout(timer);
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 220);
  };
  if (action) {
    el.appendChild(
      h(
        "button",
        {
          class: "toast-action",
          type: "button",
          onclick: () => {
            action();
            close();
          },
        },
        actionLabel || t("common.undo"),
      ),
    );
  }
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add("shown"));
  timer = setTimeout(close, timeout);
  return close;
}

// ---------------------------------------------------------------------------
// Dialogs

let openDialogs = 0;
export function dialogOpen() {
  return openDialogs > 0;
}

/**
 * Generic modal dialog. `body` is a node; `buttons` = [{label, kind, value}].
 * Resolves with the clicked button value (or null on dismiss).
 */
export function dialog({ title, body, buttons = [], wide = false, className = "", onOpen } = {}) {
  return new Promise((resolve) => {
    const previous = document.activeElement;
    const card = h("div", { class: `dialog-card ${wide ? "wide" : ""} ${className}`, role: "dialog", "aria-modal": "true" });
    const overlay = h("div", { class: "dialog-overlay" }, card);
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      openDialogs -= 1;
      overlay.classList.remove("shown");
      document.removeEventListener("keydown", onKey, true);
      setTimeout(() => overlay.remove(), 180);
      previous?.focus?.();
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        finish(null);
      }
      if (e.key === "Enter" && !e.shiftKey && e.target.tagName !== "TEXTAREA") {
        const primary = buttons.find((b) => b.kind === "primary" || b.kind === "danger");
        if (primary && card.contains(e.target)) {
          e.preventDefault();
          finish(typeof primary.value === "function" ? primary.value() : primary.value);
        }
      }
    };
    const header = h(
      "header",
      { class: "dialog-header" },
      h("h2", { class: "dialog-title" }, title || ""),
      h("button", { class: "icon-btn", type: "button", "aria-label": t("common.close"), onclick: () => finish(null) }, icon("x")),
    );
    const footer = buttons.length
      ? h(
          "footer",
          { class: "dialog-footer" },
          buttons.map((b) =>
            h(
              "button",
              {
                class: `btn ${b.kind === "primary" ? "btn-primary" : b.kind === "danger" ? "btn-danger" : ""}`,
                type: "button",
                onclick: () => finish(typeof b.value === "function" ? b.value() : b.value),
              },
              b.label,
            ),
          ),
        )
      : null;
    card.append(header, h("div", { class: "dialog-body" }, body || ""), footer || "");
    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay) finish(null);
    });
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(overlay);
    openDialogs += 1;
    requestAnimationFrame(() => {
      overlay.classList.add("shown");
      const first = card.querySelector("[autofocus], input, textarea, select, .btn-primary");
      first?.focus?.();
      onOpen?.(card, finish);
    });
  });
}

export async function confirmDialog(message, { title, okLabel, danger = false } = {}) {
  const value = await dialog({
    title: title || t("common.confirm"),
    body: h("p", { class: "dialog-text" }, message),
    buttons: [
      { label: t("common.cancel"), value: false },
      { label: okLabel || t("common.ok"), kind: danger ? "danger" : "primary", value: true },
    ],
  });
  return value === true;
}

/**
 * Form dialog. fields = [{name, label, type, value, placeholder, options, required}]
 * Resolves with an object of values or null.
 */
export async function formDialog({ title, fields, okLabel, extra }) {
  const inputs = {};
  const body = h(
    "div",
    { class: "form-grid" },
    fields.map((f) => {
      let input;
      if (f.type === "select") {
        input = h(
          "select",
          { class: "input", name: f.name },
          f.options.map((o) => h("option", { value: o.value, selected: String(o.value) === String(f.value) }, o.label)),
        );
      } else if (f.type === "textarea") {
        input = h("textarea", { class: "input", name: f.name, rows: f.rows || 4, placeholder: f.placeholder || "" });
        input.value = f.value ?? "";
      } else if (f.type === "checkbox") {
        input = h("input", { type: "checkbox", name: f.name, checked: Boolean(f.value) });
      } else {
        input = h("input", {
          class: "input",
          name: f.name,
          type: f.type || "text",
          placeholder: f.placeholder || "",
          autocomplete: "off",
          dir: f.dir || null,
          maxlength: f.maxlength || null,
          min: f.min ?? null,
          max: f.max ?? null,
          list: f.list || null,
        });
        input.value = f.value ?? "";
      }
      if (f.autofocus) input.setAttribute("autofocus", "");
      inputs[f.name] = input;
      if (f.type === "checkbox") return h("label", { class: "check-row" }, input, h("span", {}, f.label));
      return h("label", { class: `field ${f.wide ? "wide" : ""}` }, h("span", { class: "field-label" }, f.label), input, f.hint ? h("small", { class: "field-hint" }, f.hint) : null);
    }),
    extra || null,
  );
  const collect = () => {
    const out = {};
    for (const [name, input] of Object.entries(inputs)) out[name] = input.type === "checkbox" ? input.checked : input.value.trim();
    for (const f of fields) {
      if (f.required && !out[f.name]) {
        inputs[f.name].classList.add("invalid");
        inputs[f.name].focus();
        return undefined;
      }
    }
    return out;
  };
  for (;;) {
    const result = await dialog({
      title,
      body,
      buttons: [
        { label: t("common.cancel"), value: null },
        { label: okLabel || t("common.save"), kind: "primary", value: () => collect() ?? "__invalid__" },
      ],
    });
    if (result !== "__invalid__") return result;
  }
}

// ---------------------------------------------------------------------------
// Popover menu

let activeMenu = null;

export function closeMenu() {
  activeMenu?.remove();
  activeMenu = null;
}

/** items = [{label, icon, onClick, danger, disabled} | "separator"] */
export function openMenu(anchorOrEvent, items) {
  closeMenu();
  const menu = h(
    "div",
    { class: "menu", role: "menu" },
    items.map((item) =>
      item === "separator"
        ? h("div", { class: "menu-sep" })
        : h(
            "button",
            {
              class: `menu-item ${item.danger ? "danger" : ""}`,
              type: "button",
              role: "menuitem",
              disabled: item.disabled || false,
              onclick: (e) => {
                e.stopPropagation();
                closeMenu();
                item.onClick?.();
              },
            },
            item.icon ? icon(item.icon, 16) : null,
            h("span", {}, item.label),
          ),
    ),
  );
  document.body.appendChild(menu);
  const rect =
    anchorOrEvent instanceof Event
      ? { left: anchorOrEvent.clientX, right: anchorOrEvent.clientX, top: anchorOrEvent.clientY, bottom: anchorOrEvent.clientY }
      : anchorOrEvent.getBoundingClientRect();
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  const rtl = document.documentElement.dir === "rtl";
  let left = rtl ? rect.right - mw : rect.left;
  let top = rect.bottom + 6;
  if (left + mw > innerWidth - 8) left = innerWidth - mw - 8;
  if (left < 8) left = 8;
  if (top + mh > innerHeight - 8) top = Math.max(8, rect.top - mh - 6);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  activeMenu = menu;
  menu.querySelector("button:not([disabled])")?.focus();
  setTimeout(() => {
    const off = (e) => {
      if (!menu.contains(e.target)) {
        closeMenu();
        document.removeEventListener("mousedown", off, true);
      }
    };
    document.addEventListener("mousedown", off, true);
  });
  menu.addEventListener("keydown", (e) => {
    const buttons = [...menu.querySelectorAll("button:not([disabled])")];
    const i = buttons.indexOf(document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      buttons[(i + 1) % buttons.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      buttons[(i - 1 + buttons.length) % buttons.length]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeMenu();
    }
  });
  return menu;
}

// ---------------------------------------------------------------------------
// Drag & drop reordering

/**
 * Make children of `container` matching `itemSelector` reorderable.
 * Calls onReorder(fromIndex, toIndex). Items need data-index attributes.
 */
export function sortable(container, itemSelector, onReorder, { handle = null, enabled = () => true } = {}) {
  let dragIndex = -1;
  container.addEventListener("dragstart", (e) => {
    const item = e.target.closest?.(itemSelector);
    if (!item || !enabled()) return;
    if (handle && !e.target.closest(handle) && !item.matches("[draggable=true]")) return;
    dragIndex = Number(item.dataset.index);
    item.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(dragIndex));
  });
  container.addEventListener("dragover", (e) => {
    if (dragIndex < 0) return;
    const item = e.target.closest?.(itemSelector);
    e.preventDefault();
    for (const el of container.querySelectorAll(".drop-target")) el.classList.remove("drop-target");
    if (item && Number(item.dataset.index) !== dragIndex) item.classList.add("drop-target");
  });
  container.addEventListener("dragleave", (e) => {
    const item = e.target.closest?.(itemSelector);
    item?.classList.remove("drop-target");
  });
  container.addEventListener("drop", (e) => {
    if (dragIndex < 0) return;
    e.preventDefault();
    const item = e.target.closest?.(itemSelector);
    const to = item ? Number(item.dataset.index) : -1;
    const from = dragIndex;
    dragIndex = -1;
    for (const el of container.querySelectorAll(".drop-target, .dragging")) el.classList.remove("drop-target", "dragging");
    if (to >= 0 && to !== from) onReorder(from, to);
  });
  container.addEventListener("dragend", () => {
    dragIndex = -1;
    for (const el of container.querySelectorAll(".drop-target, .dragging")) el.classList.remove("drop-target", "dragging");
  });
}

export function emptyState(iconName, text, action) {
  return h(
    "div",
    { class: "empty" },
    icon(iconName, 28),
    h("p", {}, text),
    action ? h("button", { class: "btn btn-sm", type: "button", onclick: action.onClick }, action.label) : null,
  );
}

export function segmented(options, value, onChange, { className = "" } = {}) {
  const wrap = h("div", { class: `segmented ${className}`, role: "tablist" });
  const render = (v) => {
    clear(wrap);
    for (const o of options) {
      wrap.appendChild(
        h(
          "button",
          {
            type: "button",
            role: "tab",
            class: o.value === v ? "active" : "",
            "aria-selected": String(o.value === v),
            onclick: () => {
              render(o.value);
              onChange(o.value);
            },
          },
          o.icon ? icon(o.icon, 15) : null,
          o.label ? h("span", {}, o.label) : null,
        ),
      );
    }
  };
  render(value);
  wrap.setValue = render;
  return wrap;
}

export function sparkline(values, { width = 120, height = 32, stroke = "currentColor", fill = true } = {}) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("class", "sparkline");
  svg.setAttribute("preserveAspectRatio", "none");
  const nums = values.filter(Number.isFinite);
  if (nums.length < 2) return svg;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const pts = nums.map((v, i) => [(i / (nums.length - 1)) * width, height - 2 - ((v - min) / span) * (height - 4)]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  if (fill) {
    const area = document.createElementNS(ns, "path");
    area.setAttribute("d", `${d} L${width} ${height} L0 ${height} Z`);
    area.setAttribute("fill", stroke);
    area.setAttribute("opacity", "0.14");
    svg.appendChild(area);
  }
  const line = document.createElementNS(ns, "path");
  line.setAttribute("d", d);
  line.setAttribute("fill", "none");
  line.setAttribute("stroke", stroke);
  line.setAttribute("stroke-width", "1.6");
  line.setAttribute("stroke-linejoin", "round");
  line.setAttribute("vector-effect", "non-scaling-stroke");
  svg.appendChild(line);
  return svg;
}
