// Quick links: groups as tabs, links as tiles (or list), inline add/edit,
// drag to reorder, drag onto another group to move, optional "Most visited".

import { h, clear, uid, setFavicon, hostname, normalizeUrl, isHttpUrl, copyText, isExtension } from "../lib/utils.js";
import { icon } from "../lib/icons.js";
import { t } from "../lib/i18n.js";
import { app, on } from "./app.js";
import { loadLinks, saveLinks, normalizeLink, normalizeGroup } from "../lib/config.js";
import { KEYS, subscribe } from "../lib/storage.js";
import { toast, openMenu, formDialog, confirmDialog, sortable, emptyState } from "../lib/ui.js";

const ACTIVE_KEY = "netab.links.activeGroup";
const TOP_SITES = "__top__";

let links = { title: "Quick Links", groups: [] };
let activeGroup = null;
let topSites = [];

export function getLinks() {
  return links;
}

async function persist(next) {
  links = await saveLinks(next);
  render();
}

function visibleGroups() {
  return links.groups.filter((g) => g.enabled);
}

function setActive(id) {
  activeGroup = id;
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    /* ignore */
  }
  render();
}

async function hasTopSitesPermission() {
  if (!isExtension) return false;
  try {
    return await chrome.permissions.contains({ permissions: ["topSites"] });
  } catch {
    return false;
  }
}

async function loadTopSites() {
  if (!app.settings.links.topSites || !(await hasTopSitesPermission())) {
    topSites = [];
    return;
  }
  try {
    topSites = (await chrome.topSites.get()).filter((s) => isHttpUrl(s.url)).slice(0, 12);
  } catch {
    topSites = [];
  }
}

/** Add (existing = null) or edit a link. `prefill` seeds a new link's fields. */
export async function linkDialog(existing = null, groupId = null, prefill = {}) {
  const groups = links.groups;
  if (!groups.length) groups.push(normalizeGroup({ id: "inbox", name: t("links.inbox"), icon: "📥" }));
  const values = await formDialog({
    title: existing ? t("links.edit") : t("links.add"),
    fields: [
      { name: "url", label: "URL", value: existing?.url || prefill.url || "", placeholder: "https://", required: true, autofocus: !existing && !prefill.url, dir: "ltr", wide: true },
      { name: "label", label: t("links.label"), value: existing?.label || prefill.label || "", placeholder: t("links.labelHint"), autofocus: Boolean(!existing && prefill.url) },
      { name: "icon", label: t("links.icon"), value: existing?.icon || "", placeholder: t("links.iconHint"), maxlength: 4 },
      { name: "note", label: t("links.note"), value: existing?.note || "", wide: true },
      {
        name: "group",
        label: t("links.group"),
        type: "select",
        value: groupId || activeGroup || groups[0].id,
        options: groups.map((g) => ({ value: g.id, label: `${g.icon} ${g.name}` })),
        wide: true,
      },
    ],
  });
  if (!values) return null;
  const url = normalizeUrl(values.url);
  const link = normalizeLink({ ...(existing || {}), url, label: values.label || hostname(url) || url, icon: values.icon, note: values.note });
  const next = structuredClone(links);
  for (const g of next.groups) g.links = g.links.filter((l) => l.id !== link.id);
  const target = next.groups.find((g) => g.id === values.group) || next.groups[0];
  if (existing && groupId === target.id) {
    const original = links.groups.find((g) => g.id === groupId);
    const index = original.links.findIndex((l) => l.id === link.id);
    target.links.splice(index < 0 ? target.links.length : index, 0, link);
  } else {
    target.links.push(link);
  }
  await persist(next);
  if (target.id !== activeGroup) setActive(target.id);
  return link;
}

export async function groupDialog(existing = null) {
  const values = await formDialog({
    title: existing ? t("links.editGroup") : t("links.addGroup"),
    fields: [
      { name: "name", label: t("common.name"), value: existing?.name || "", required: true, autofocus: true },
      { name: "icon", label: t("links.icon"), value: existing?.icon || "📁", maxlength: 4 },
    ],
  });
  if (!values) return;
  const next = structuredClone(links);
  if (existing) {
    const g = next.groups.find((x) => x.id === existing.id);
    Object.assign(g, { name: values.name, icon: values.icon || "📁" });
  } else {
    const g = normalizeGroup({ id: uid("group"), name: values.name, icon: values.icon || "📁", links: [] });
    next.groups.push(g);
    activeGroup = g.id;
  }
  await persist(next);
}

async function deleteGroup(group) {
  if (!(await confirmDialog(t("links.deleteGroupConfirm", { name: group.name, n: group.links.length }), { danger: true, okLabel: t("common.delete") }))) return;
  const before = structuredClone(links);
  const next = structuredClone(links);
  next.groups = next.groups.filter((g) => g.id !== group.id);
  await persist(next);
  toast(t("links.groupDeleted"), { action: () => persist(before) });
}

async function deleteLink(link) {
  const before = structuredClone(links);
  const next = structuredClone(links);
  for (const g of next.groups) g.links = g.links.filter((l) => l.id !== link.id);
  await persist(next);
  toast(t("links.deleted", { name: link.label }), { action: () => persist(before) });
}

function open(url, newTab) {
  if (newTab) window.open(url, "_blank", "noopener");
  else location.href = url;
}

function tile(link, index, group) {
  const iconBox = h("span", { class: "tile-icon" });
  if (link.icon) iconBox.textContent = link.icon;
  else {
    const img = h("img", { alt: "", loading: "lazy", decoding: "async" });
    setFavicon(img, link.url, 64);
    iconBox.appendChild(img);
  }
  const readonly = group === TOP_SITES;
  const el = h(
    "a",
    {
      class: "tile",
      href: link.url,
      title: `${link.label}\n${link.url}`,
      draggable: readonly ? "false" : "true",
      dataset: { index: String(index), id: link.id || "" },
      target: app.settings.links.newTab ? "_blank" : null,
      rel: "noopener noreferrer",
      style: { animationDelay: `${Math.min(index, 14) * 18}ms` },
    },
    iconBox,
    h("span", { class: "tile-text" }, h("span", { class: "tile-label" }, link.label), h("span", { class: "tile-note" }, link.note || hostname(link.url))),
    h(
      "button",
      {
        class: "icon-btn sm tile-menu",
        type: "button",
        title: t("common.more"),
        onclick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          tileMenu(e.currentTarget, link, group);
        },
      },
      icon("more", 15),
    ),
  );
  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    tileMenu(e, link, group);
  });
  return el;
}

function tileMenu(anchor, link, group) {
  const readonly = group === TOP_SITES;
  const moveTargets = links.groups.filter((g) => g.id !== group);
  openMenu(anchor, [
    { label: t("links.openNewTab"), icon: "external", onClick: () => open(link.url, true) },
    { label: t("links.copyUrl"), icon: "copy", onClick: async () => (await copyText(link.url)) && toast(t("common.copied")) },
    readonly
      ? { label: t("links.pin"), icon: "pin", onClick: () => linkDialog(null, null, { url: link.url, label: link.label }) }
      : { label: t("common.edit"), icon: "edit", onClick: () => linkDialog(link, group) },
    ...(!readonly && moveTargets.length
      ? [
          "separator",
          ...moveTargets.slice(0, 8).map((g) => ({
            label: t("links.moveTo", { name: g.name }),
            icon: "folder",
            onClick: () => moveLink(link, g.id),
          })),
        ]
      : []),
    ...(!readonly ? ["separator", { label: t("common.delete"), icon: "trash", danger: true, onClick: () => deleteLink(link) }] : []),
  ]);
}

async function moveLink(link, groupId) {
  const next = structuredClone(links);
  for (const g of next.groups) g.links = g.links.filter((l) => l.id !== link.id);
  next.groups.find((g) => g.id === groupId)?.links.push(link);
  await persist(next);
  toast(t("links.moved", { name: next.groups.find((g) => g.id === groupId)?.name || "" }));
}

function groupMenu(anchor, group) {
  const idx = links.groups.findIndex((g) => g.id === group.id);
  openMenu(anchor, [
    { label: t("links.add"), icon: "plus", onClick: () => linkDialog(null, group.id) },
    { label: t("links.editGroup"), icon: "edit", onClick: () => groupDialog(group) },
    { label: t("links.moveLeft"), icon: "chevronLeft", disabled: idx <= 0, onClick: () => moveGroup(idx, idx - 1) },
    { label: t("links.moveRight"), icon: "chevronRight", disabled: idx >= links.groups.length - 1, onClick: () => moveGroup(idx, idx + 1) },
    { label: t("links.openAll", { n: group.links.length }), icon: "tabs", disabled: !group.links.length, onClick: () => openAll(group) },
    "separator",
    { label: t("links.deleteGroup"), icon: "trash", danger: true, onClick: () => deleteGroup(group) },
  ]);
}

async function moveGroup(from, to) {
  const next = structuredClone(links);
  const [g] = next.groups.splice(from, 1);
  next.groups.splice(to, 0, g);
  await persist(next);
}

function openAll(group) {
  const urls = group.links.filter((l) => l.enabled).map((l) => l.url);
  if (isExtension) urls.forEach((url, i) => chrome.tabs.create({ url, active: i === 0 }));
  else urls.forEach((url) => window.open(url, "_blank", "noopener"));
}

export function render() {
  const section = document.getElementById("linksSection");
  const tabs = document.getElementById("linksTabs");
  const grid = document.getElementById("linksGrid");
  section.classList.toggle("hidden", !app.settings.links.show);
  if (!app.settings.links.show) return;

  const groups = visibleGroups();
  const ids = [...groups.map((g) => g.id), ...(topSites.length ? [TOP_SITES] : [])];
  if (!ids.includes(activeGroup)) activeGroup = ids[0] || null;

  clear(tabs);
  for (const g of groups) {
    const btn = h(
      "button",
      {
        class: `links-tab ${g.id === activeGroup ? "active" : ""}`,
        type: "button",
        role: "tab",
        "aria-selected": String(g.id === activeGroup),
        dataset: { group: g.id },
        onclick: () => setActive(g.id),
        ondblclick: () => groupDialog(g),
        oncontextmenu: (e) => {
          e.preventDefault();
          groupMenu(e, g);
        },
      },
      h("span", {}, g.icon),
      h("span", {}, g.name),
      h("span", { class: "count" }, String(g.links.filter((l) => l.enabled).length)),
    );
    // Drop a tile on a group tab to move it there.
    btn.addEventListener("dragover", (e) => {
      if (e.dataTransfer.types.includes("text/netab-link")) {
        e.preventDefault();
        btn.classList.add("drop-target");
      }
    });
    btn.addEventListener("dragleave", () => btn.classList.remove("drop-target"));
    btn.addEventListener("drop", (e) => {
      const id = e.dataTransfer.getData("text/netab-link");
      btn.classList.remove("drop-target");
      if (!id || g.id === activeGroup) return;
      e.preventDefault();
      e.stopPropagation();
      const link = links.groups.flatMap((x) => x.links).find((l) => l.id === id);
      if (link) moveLink(link, g.id);
    });
    tabs.appendChild(btn);
  }
  if (topSites.length) {
    tabs.appendChild(
      h(
        "button",
        { class: `links-tab ${activeGroup === TOP_SITES ? "active" : ""}`, type: "button", role: "tab", onclick: () => setActive(TOP_SITES) },
        h("span", {}, "🔥"),
        h("span", {}, t("links.mostVisited")),
      ),
    );
  }
  tabs.appendChild(h("button", { class: "links-tab add", type: "button", title: t("links.addGroup"), onclick: () => groupDialog() }, icon("plus", 14)));
  tabs.classList.toggle("glass", true);

  clear(grid);
  grid.classList.toggle("list", app.settings.links.style === "list");
  if (activeGroup === TOP_SITES) {
    topSites.forEach((s, i) => grid.appendChild(tile({ id: "", label: s.title || hostname(s.url), url: s.url, note: hostname(s.url) }, i, TOP_SITES)));
    return;
  }
  const group = links.groups.find((g) => g.id === activeGroup);
  if (!group) {
    grid.appendChild(h("div", { class: "links-empty" }, emptyState("link", t("links.noGroups"), { label: t("links.addGroup"), onClick: () => groupDialog() })));
    return;
  }
  const visible = group.links.map((l, i) => ({ l, i })).filter(({ l }) => l.enabled);
  for (const { l, i } of visible) grid.appendChild(tile(l, i, group.id));
  grid.appendChild(
    h(
      "button",
      { class: "tile add", type: "button", onclick: () => linkDialog(null, group.id) },
      h("span", { class: "tile-icon" }, icon("plus", 22)),
      h("span", { class: "tile-text" }, h("span", { class: "tile-label" }, t("links.add"))),
    ),
  );
}

export async function initLinks() {
  try {
    activeGroup = localStorage.getItem(ACTIVE_KEY);
  } catch {
    /* ignore */
  }
  try {
    links = (await loadLinks()).links;
  } catch (error) {
    console.error(error);
    links = { title: "Quick Links", groups: [] };
  }
  await loadTopSites();
  render();

  const grid = document.getElementById("linksGrid");
  grid.addEventListener("dragstart", (e) => {
    const el = e.target.closest?.(".tile");
    if (el?.dataset.id) e.dataTransfer.setData("text/netab-link", el.dataset.id);
  });
  sortable(grid, ".tile[draggable=true]", async (from, to) => {
    const next = structuredClone(links);
    const g = next.groups.find((x) => x.id === activeGroup);
    if (!g) return;
    const [moved] = g.links.splice(from, 1);
    g.links.splice(to, 0, moved);
    await persist(next);
  });

  subscribe(KEYS.links, async (value) => {
    if (!value) {
      links = (await loadLinks()).links;
    } else {
      const fresh = (await loadLinks()).links;
      if (JSON.stringify(fresh) === JSON.stringify(links)) return;
      links = fresh;
    }
    render();
  });
  on("settings", async ({ settings, prev, langChanged }) => {
    if (settings.links.topSites !== prev?.links?.topSites) await loadTopSites();
    if (langChanged || JSON.stringify(settings.links) !== JSON.stringify(prev?.links)) render();
  });
}

