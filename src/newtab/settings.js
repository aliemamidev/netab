// Settings drawer: every option is applied live and saved instantly.

import { h, clear, debounce, uid, downloadFile, formatBytes, isExtension, basename, extUrl, fill } from "../lib/utils.js";
import { icon } from "../lib/icons.js";
import { t, LANGS, locale } from "../lib/i18n.js";
import { app, on, updateSettings } from "./app.js";
import { ACCENTS } from "../lib/theme.js";
import { BUILTIN_ENGINES, allEngines } from "../lib/engines.js";
import { KEYS, BACKUP_KEYS, getMany, setMany, remove as removeKeys, normalizeSettings } from "../lib/storage.js";
import { GRADIENTS, getMedia, setMedia } from "./background.js";
import { saveMedia, loadMedia, loadLinks, saveLinks, normalizeGroup, normalizeLink, fileKind, normalizeLinks, normalizeMedia } from "../lib/config.js";
import { MediaDB, blobUrlFor, revokeBlobUrl } from "../lib/media-db.js";
import { FEATURE_HOSTS, hasFeature, requestFeature, revokeFeature } from "../lib/net.js";
import { toast, confirmDialog, formDialog, sortable, segmented } from "../lib/ui.js";
import { WIDGETS } from "./widgets/index.js";

const SECTIONS = [
  ["general", "settings", "set.general"],
  ["appearance", "palette", "set.appearance"],
  ["background", "image", "set.background"],
  ["search", "search", "set.search"],
  ["links", "link", "set.links"],
  ["widgets", "layout", "set.widgets"],
  ["focus", "timer", "set.focus"],
  ["data", "shield", "set.data"],
  ["about", "info", "set.about"],
];

let drawer;
let overlay;
let current = "general";
let bodyEl;
let navEl;

// ---------------------------------------------------------------------------
// Builders

function groupBox(title, ...rows) {
  return h("div", { class: "set-group" }, title ? h("div", { class: "set-group-title" }, title) : null, ...rows);
}

function row(label, control, { hint, stack = false } = {}) {
  return h(
    "div",
    { class: `set-row ${stack ? "stack" : ""}` },
    h("div", { class: "set-row-text" }, h("div", { class: "set-row-label" }, label), hint ? h("div", { class: "set-row-hint" }, hint) : null),
    h("div", { class: "set-row-control" }, control),
  );
}

function toggle(value, onChange) {
  return h("label", { class: "switch" }, h("input", { type: "checkbox", checked: Boolean(value), onchange: (e) => onChange(e.target.checked) }), h("span", {}));
}

function select(options, value, onChange) {
  return h(
    "select",
    { class: "input", onchange: (e) => onChange(e.target.value) },
    options.map((o) => h("option", { value: o.value, selected: String(o.value) === String(value) }, o.label)),
  );
}

function range({ min, max, step = 1, value, format = (v) => v, onInput }) {
  const out = h("span", { class: "range-value" }, format(value));
  const save = debounce(onInput, 120);
  const input = h("input", {
    type: "range",
    min,
    max,
    step,
    value,
    oninput: (e) => {
      out.textContent = format(Number(e.target.value));
      save(Number(e.target.value));
    },
  });
  return h("span", { class: "set-row-control" }, input, out);
}

function textInput(value, onChange, attrs = {}) {
  const save = debounce(onChange, 400);
  return h("input", { class: "input", type: "text", value: value ?? "", oninput: (e) => save(e.target.value), ...attrs });
}

function numberInput(value, onChange, { min, max } = {}) {
  const save = debounce(onChange, 300);
  return h("input", {
    class: "input",
    type: "number",
    value,
    min,
    max,
    oninput: (e) => {
      const v = Number(e.target.value);
      if (Number.isFinite(v) && v >= min && v <= max) save(v);
    },
  });
}

const S = () => app.settings;
const pct = (v) => `${v}%`;
const px = (v) => `${v}px`;

// ---------------------------------------------------------------------------
// Sections

function general() {
  return [
    groupBox(
      t("set.language"),
      row(
        t("set.language"),
        select(
          LANGS.map((l) => ({ value: l.id, label: l.label || t(l.labelKey) })),
          S().lang,
          (v) => updateSettings({ lang: v }),
        ),
      ),
      row(t("set.name"), textInput(S().name, (v) => updateSettings({ name: v.trim() }), { placeholder: t("set.namePlaceholder"), maxlength: 40 }), { hint: t("set.nameHint") }),
    ),
    groupBox(
      t("set.clock"),
      row(t("set.showClock"), toggle(S().clock.show, (v) => updateSettings({ clock: { show: v } }))),
      row(
        t("set.clockFormat"),
        select(
          [
            { value: "auto", label: t("common.auto") },
            { value: "24", label: t("set.24h") },
            { value: "12", label: t("set.12h") },
          ],
          S().clock.format,
          (v) => updateSettings({ clock: { format: v } }),
        ),
      ),
      row(t("set.seconds"), toggle(S().clock.seconds, (v) => updateSettings({ clock: { seconds: v } })), { hint: t("set.secondsHint") }),
      row(t("set.greeting"), toggle(S().clock.greeting, (v) => updateSettings({ clock: { greeting: v } }))),
      row(t("set.date"), toggle(S().clock.date, (v) => updateSettings({ clock: { date: v } }))),
    ),
    groupBox(
      t("set.calendars"),
      row(
        t("set.primaryCal"),
        select(
          [
            { value: "auto", label: t("common.auto") },
            { value: "gregory", label: t("cal.gregorian") },
            { value: "persian", label: t("cal.persianLong") },
            { value: "islamic-umalqura", label: t("cal.islamicLong") },
          ],
          S().calendar.primary,
          (v) => updateSettings({ calendar: { primary: v } }),
        ),
      ),
      row(
        t("set.secondaryCal"),
        select(
          [
            { value: "auto", label: t("common.auto") },
            { value: "none", label: t("common.none") },
            { value: "gregory", label: t("cal.gregorian") },
            { value: "persian", label: t("cal.persianLong") },
            { value: "islamic-umalqura", label: t("cal.islamicLong") },
          ],
          S().calendar.secondary,
          (v) => updateSettings({ calendar: { secondary: v } }),
        ),
      ),
      row(
        t("set.weekStart"),
        select(
          [
            { value: "auto", label: t("common.auto") },
            { value: "6", label: t("set.saturday") },
            { value: "0", label: t("set.sunday") },
            { value: "1", label: t("set.monday") },
          ],
          String(S().calendar.weekStart),
          (v) => updateSettings({ calendar: { weekStart: v === "auto" ? "auto" : Number(v) } }),
        ),
      ),
    ),
  ];
}

function appearance() {
  const swatches = h("div", { class: "swatches" });
  const renderSwatches = () => {
    clear(swatches);
    for (const c of ACCENTS) {
      swatches.appendChild(
        h("button", {
          class: `swatch ${S().accent.toLowerCase() === c ? "active" : ""}`,
          type: "button",
          style: { background: c },
          title: c,
          onclick: async () => {
            await updateSettings({ accent: c });
            renderSwatches();
          },
        }),
      );
    }
    const custom = h("input", { type: "color", class: `swatch ${ACCENTS.includes(S().accent.toLowerCase()) ? "" : "active"}`, value: S().accent, title: t("set.customColor") });
    custom.addEventListener("change", (e) => updateSettings({ accent: e.target.value }).then(renderSwatches));
    swatches.appendChild(custom);
  };
  renderSwatches();
  return [
    groupBox(
      t("set.theme"),
      row(
        t("set.theme"),
        segmented(
          [
            { value: "dark", label: t("set.dark"), icon: "moon" },
            { value: "light", label: t("set.light"), icon: "sun" },
            { value: "auto", label: t("common.auto"), icon: "sparkles" },
          ],
          S().theme,
          (v) => updateSettings({ theme: v }),
        ),
      ),
      row(t("set.accent"), swatches, { stack: false }),
      row(t("set.glass"), range({ min: 0, max: 40, value: S().glass, format: px, onInput: (v) => updateSettings({ glass: v }) })),
      row(t("set.opacity"), range({ min: 15, max: 95, value: S().cardOpacity, format: pct, onInput: (v) => updateSettings({ cardOpacity: v }) })),
      row(t("set.radius"), range({ min: 4, max: 28, value: S().radius, format: px, onInput: (v) => updateSettings({ radius: v }) })),
      row(t("set.fontScale"), range({ min: 85, max: 120, value: S().fontScale, format: pct, onInput: (v) => updateSettings({ fontScale: v }) })),
    ),
    groupBox(
      t("set.layout"),
      row(t("set.showSearch"), toggle(S().search.show, (v) => updateSettings({ search: { show: v } }))),
      row(t("set.showLinks"), toggle(S().links.show, (v) => updateSettings({ links: { show: v } }))),
      row(t("set.showWidgets"), toggle(S().widgets.show, (v) => updateSettings({ widgets: { show: v } }))),
      row(t("set.zen"), toggle(S().zen, (v) => updateSettings({ zen: v })), { hint: t("set.zenHint") }),
    ),
  ];
}

function background() {
  const media = getMedia() || normalizeMedia({});
  const saveM = async (mutate, refresh = false) => {
    const next = structuredClone(getMedia());
    mutate(next);
    const saved = await saveMedia(next);
    setMedia(saved, { refresh });
  };

  const presets = h(
    "div",
    { class: "preset-grid" },
    GRADIENTS.map((g) =>
      h(
        "button",
        {
          class: `preset bg-gradient on ${S().background.source === "gradient" && S().background.gradient === g ? "active" : ""}`,
          type: "button",
          dataset: { preset: g },
          onclick: async () => {
            await updateSettings({ background: { source: "gradient", gradient: g } });
            renderSection();
          },
        },
        h("span", {}, t(`bg.${g}`)),
      ),
    ),
  );

  const library = h("div", { class: "media-grid" });
  const renderLibrary = async () => {
    clear(library);
    const m = getMedia();
    const all = [...m.photos, ...m.videos];
    if (!all.length) library.appendChild(h("div", { class: "muted small" }, t("bg.noMedia")));
    for (const item of all) {
      const url = item.source === "uploaded" ? await blobUrlFor(item.id) : extUrl(item.path);
      const preview =
        item.kind === "video"
          ? h("video", { src: url, muted: true, loop: true, preload: "metadata", playsinline: true, onmouseenter: (e) => e.target.play().catch(() => {}), onmouseleave: (e) => e.target.pause() })
          : h("img", { src: url, alt: item.name, loading: "lazy" });
      library.appendChild(
        h(
          "div",
          { class: `media-card ${item.enabled ? "" : "off"}` },
          h("div", { class: "media-preview" }, preview, h("span", { class: "media-kind" }, item.kind === "video" ? t("bg.video") : t("bg.photo"))),
          h(
            "div",
            { class: "media-meta" },
            h("span", { class: "media-name", title: item.source === "uploaded" ? t("bg.uploaded") : item.path }, item.name),
            toggle(item.enabled, (v) =>
              saveM((next) => {
                const list = item.kind === "video" ? next.videos : next.photos;
                const found = list.find((x) => x.id === item.id);
                if (found) found.enabled = v;
              }).then(renderLibrary),
            ),
            h(
              "button",
              {
                class: "icon-btn sm",
                type: "button",
                title: t("common.delete"),
                onclick: async () => {
                  if (!(await confirmDialog(t("bg.deleteConfirm", { name: item.name }), { danger: true, okLabel: t("common.delete") }))) return;
                  await saveM((next) => {
                    next.photos = next.photos.filter((x) => x.id !== item.id);
                    next.videos = next.videos.filter((x) => x.id !== item.id);
                  });
                  if (item.source === "uploaded") {
                    await MediaDB.remove(item.id);
                    revokeBlobUrl(item.id);
                  }
                  renderLibrary();
                },
              },
              icon("trash", 15),
            ),
          ),
        ),
      );
    }
  };
  renderLibrary();

  const fileInput = h("input", { type: "file", accept: "image/*,video/*", multiple: true });
  const upload = async (files) => {
    let added = 0;
    for (const file of files) {
      const kind = fileKind(file.name, file.type);
      if (!kind) continue;
      const id = uid(kind);
      await MediaDB.put({ id, blob: file, name: file.name, type: file.type, size: file.size, createdAt: new Date().toISOString() });
      const item = { id, source: "uploaded", kind, name: file.name, mime: file.type, size: file.size, enabled: true, createdAt: new Date().toISOString() };
      await saveM((next) => (kind === "photo" ? next.photos : next.videos).push(item));
      added += 1;
    }
    if (added) {
      if (S().background.source !== "media") await updateSettings({ background: { source: "media" } });
      toast(t("bg.uploadedN", { n: added }), { kind: "success" });
      renderLibrary();
    }
  };
  fileInput.addEventListener("change", () => upload([...fileInput.files]).finally(() => (fileInput.value = "")));
  const drop = h("label", { class: "dropzone" }, fileInput, icon("upload", 22), h("strong", {}, t("bg.upload")), h("small", {}, t("bg.uploadHint")));
  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.classList.add("over");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("over");
    upload([...e.dataTransfer.files]);
  });

  return [
    groupBox(
      t("bg.source"),
      row(
        t("bg.source"),
        segmented(
          [
            { value: "media", label: t("bg.media") },
            { value: "gradient", label: t("bg.gradient") },
            { value: "color", label: t("bg.color") },
          ],
          S().background.source,
          async (v) => {
            await updateSettings({ background: { source: v } });
            renderSection();
          },
        ),
      ),
      S().background.source === "color"
        ? row(
            t("bg.color"),
            h("input", {
              type: "color",
              class: "swatch",
              value: S().background.color,
              onchange: (e) => updateSettings({ background: { color: e.target.value } }),
            }),
          )
        : null,
      S().background.source === "media"
        ? row(
            t("bg.rotate"),
            select(
              [
                { value: "tab", label: t("bg.everyTab") },
                { value: "hour", label: t("bg.everyHour") },
                { value: "day", label: t("bg.everyDay") },
              ],
              S().background.rotate,
              (v) => updateSettings({ background: { rotate: v } }),
            ),
          )
        : null,
      S().background.source === "media"
        ? row(
            t("bg.mode"),
            select(
              [
                { value: "mixed", label: t("bg.mixed") },
                { value: "photos", label: t("bg.photosOnly") },
                { value: "videos", label: t("bg.videosOnly") },
              ],
              media.settings.mode,
              (v) => saveM((next) => (next.settings.mode = v), true),
            ),
          )
        : null,
    ),
    groupBox(t("bg.presets"), h("div", { style: { padding: "0.75rem 1rem 1rem" } }, presets)),
    groupBox(
      t("bg.adjust"),
      row(t("bg.shade"), range({ min: 0, max: 90, value: media.settings.shadeStrength, format: pct, onInput: (v) => saveM((n) => (n.settings.shadeStrength = v)) })),
      row(t("bg.blur"), range({ min: 0, max: 24, value: media.settings.blur, format: px, onInput: (v) => saveM((n) => (n.settings.blur = v)) })),
      row(t("bg.scale"), range({ min: 100, max: 115, value: media.settings.scale, format: pct, onInput: (v) => saveM((n) => (n.settings.scale = v)) })),
      row(t("bg.volume"), range({ min: 0, max: 100, value: media.settings.videoVolume, format: pct, onInput: (v) => saveM((n) => (n.settings.videoVolume = v)) })),
    ),
    groupBox(
      t("bg.library"),
      h("div", { style: { padding: "0.75rem 1rem", display: "grid", gap: "0.75rem" } }, drop, library),
      row(
        t("bg.packaged"),
        h(
          "span",
          { class: "set-row-control" },
          h(
            "button",
            {
              class: "btn btn-sm",
              type: "button",
              onclick: async () => {
                const v = await formDialog({ title: t("bg.addPath"), fields: [{ name: "path", label: t("bg.path"), placeholder: "media/photos/wallpaper.jpg", required: true, dir: "ltr", wide: true }] });
                if (!v) return;
                const kind = fileKind(v.path);
                if (!kind) return toast(t("bg.unsupported"), { kind: "error" });
                await saveM((next) => (kind === "photo" ? next.photos : next.videos).push({ id: uid(kind), source: "packaged", kind, name: basename(v.path), path: v.path, enabled: true }));
                renderLibrary();
              },
            },
            t("bg.addPath"),
          ),
          h(
            "button",
            {
              class: "btn btn-sm",
              type: "button",
              onclick: async () => {
                const { media: fresh, source } = await loadMedia({ ignoreStored: true });
                const saved = await saveMedia(fresh);
                setMedia(saved);
                renderLibrary();
                toast(t("bg.reloaded", { source }));
              },
            },
            t("bg.reloadJson"),
          ),
        ),
        { hint: t("bg.packagedHint") },
      ),
    ),
  ];
}

async function permissionRow(label, hint, perms) {
  const status = h("span", { class: "perm-status off" }, "…");
  const btn = h("button", { class: "btn btn-sm", type: "button" });
  const refresh = async () => {
    const granted = isExtension ? await chrome.permissions.contains({ permissions: perms }).catch(() => false) : false;
    status.className = `perm-status ${granted ? "on" : "off"}`;
    status.textContent = granted ? t("perm.granted") : t("perm.notGranted");
    btn.textContent = granted ? t("perm.revoke") : t("perm.grant");
    btn.onclick = async () => {
      if (!isExtension) return;
      if (granted) await chrome.permissions.remove({ permissions: perms }).catch(() => {});
      else await chrome.permissions.request({ permissions: perms }).catch(() => {});
      refresh();
    };
  };
  await refresh();
  return row(label, h("span", { class: "set-row-control" }, status, btn), { hint });
}

async function featureRow(label, hint, feature) {
  const status = h("span", { class: "perm-status off" }, "…");
  const btn = h("button", { class: "btn btn-sm", type: "button" });
  const refresh = async () => {
    const granted = isExtension ? await hasFeature(feature) : false;
    status.className = `perm-status ${granted ? "on" : "off"}`;
    status.textContent = granted ? t("perm.granted") : t("perm.notGranted");
    btn.textContent = granted ? t("perm.revoke") : t("perm.grant");
    btn.onclick = async () => {
      if (granted) await revokeFeature(feature);
      else await requestFeature(feature);
      refresh();
    };
  };
  await refresh();
  return row(label, h("span", { class: "set-row-control" }, status, btn), { hint: `${hint} (${FEATURE_HOSTS[feature].map((x) => new URL(x.replace("*", "")).host).join(", ")})` });
}

async function search() {
  const s = S().search;
  const engines = allEngines(S());
  const customList = h("div", { class: "editor-list" });
  const renderCustom = () => {
    clear(customList);
    if (!S().search.custom.length) customList.appendChild(h("div", { class: "muted small" }, t("search.noCustom")));
    for (const e of S().search.custom) {
      customList.appendChild(
        h(
          "div",
          { class: "editor-row" },
          icon("search", 16),
          h("span", { class: "grow" }, h("strong", {}, e.name), h("div", { class: "muted small code", dir: "ltr" }, `!${e.bang}  ${e.url}`)),
          h(
            "button",
            {
              class: "icon-btn sm",
              type: "button",
              title: t("common.delete"),
              onclick: async () => {
                await updateSettings((cur) => {
                  cur.search.custom = cur.search.custom.filter((x) => x.id !== e.id);
                  if (cur.search.engine === e.id) cur.search.engine = "default";
                  return cur;
                });
                renderCustom();
              },
            },
            icon("trash", 15),
          ),
        ),
      );
    }
  };
  renderCustom();

  const addCustom = async () => {
    const v = await formDialog({
      title: t("search.addEngine"),
      fields: [
        { name: "name", label: t("common.name"), required: true, autofocus: true },
        { name: "bang", label: t("search.bang"), placeholder: "so", required: true, dir: "ltr" },
        { name: "url", label: t("search.urlTemplate"), placeholder: "https://example.com/search?q=%s", required: true, dir: "ltr", wide: true, hint: t("search.urlTemplateHint") },
      ],
    });
    if (!v) return;
    if (!/^https?:\/\/.+%s/.test(v.url)) return toast(t("search.badTemplate"), { kind: "error" });
    await updateSettings((cur) => {
      cur.search.custom = [...cur.search.custom, { id: uid("engine"), name: v.name, bang: v.bang.replace(/^!/, "").toLowerCase(), url: v.url }];
      return cur;
    });
    renderCustom();
  };

  const src = (key, label, hint) => row(label, toggle(s.sources[key], (v) => updateSettings({ search: { sources: { [key]: v } } })), { hint });

  return [
    groupBox(
      t("search.engine"),
      row(
        t("search.defaultEngineLabel"),
        select(
          engines.map((e) => ({ value: e.id, label: e.id === "default" ? t("search.defaultEngine") : e.name })),
          s.engine,
          (v) => updateSettings({ search: { engine: v } }),
        ),
        { hint: t("search.defaultEngineHint") },
      ),
      row(t("search.newTab"), toggle(s.newTab, (v) => updateSettings({ search: { newTab: v } }))),
    ),
    groupBox(
      t("search.sources"),
      src("calc", t("search.srcCalc"), t("search.srcCalcHint")),
      src("links", t("search.srcLinks")),
      src("tabs", t("search.srcTabs")),
      src("commands", t("search.srcCommands"), t("search.srcCommandsHint")),
      src("bookmarks", t("search.srcBookmarks")),
      src("history", t("search.srcHistory")),
      await permissionRow(t("perm.bookmarksHistory"), t("perm.bookmarksHistoryHint"), ["bookmarks", "history"]),
    ),
    groupBox(
      t("search.customEngines"),
      h("div", { style: { padding: "0.75rem 1rem", display: "grid", gap: "0.6rem" } }, customList, h("div", {}, h("button", { class: "btn btn-sm", type: "button", onclick: addCustom }, icon("plus", 14), t("search.addEngine")))),
    ),
    groupBox(
      t("search.bangs"),
      h(
        "div",
        { class: "bang-grid" },
        BUILTIN_ENGINES.filter((e) => e.bang).map((e) => h("div", { class: "bang-item" }, h("kbd", {}, `!${e.bang}`), h("span", {}, e.name))),
      ),
    ),
  ];
}

async function linksSection() {
  let links = (await loadLinks()).links;
  const list = h("div", { class: "editor-list" });
  const save = async () => {
    links = await saveLinks(links);
  };
  const renderGroups = () => {
    clear(list);
    links.groups.forEach((g, i) => {
      list.appendChild(
        h(
          "div",
          { class: "editor-row", draggable: "true", dataset: { index: String(i) } },
          h("span", { class: "handle" }, icon("grip", 16)),
          h("input", { class: "input emoji-input", value: g.icon, maxlength: 4, oninput: debounce((e) => ((g.icon = e.target.value || "📁"), save()), 400) }),
          h("input", { class: "input grow", value: g.name, oninput: debounce((e) => ((g.name = e.target.value || "Group"), save()), 400) }),
          h("span", { class: "badge" }, String(g.links.length)),
          toggle(g.enabled, (v) => ((g.enabled = v), save())),
          h(
            "button",
            {
              class: "icon-btn sm",
              type: "button",
              title: t("common.delete"),
              onclick: async () => {
                if (!(await confirmDialog(t("links.deleteGroupConfirm", { name: g.name, n: g.links.length }), { danger: true, okLabel: t("common.delete") }))) return;
                links.groups.splice(i, 1);
                await save();
                renderGroups();
              },
            },
            icon("trash", 15),
          ),
        ),
      );
    });
  };
  renderGroups();
  sortable(list, ".editor-row", async (from, to) => {
    const [g] = links.groups.splice(from, 1);
    links.groups.splice(to, 0, g);
    await save();
    renderGroups();
  });

  const importBookmarks = async () => {
    if (!isExtension) return;
    const ok = await chrome.permissions.request({ permissions: ["bookmarks"] }).catch(() => false);
    if (!ok) return;
    const tree = await chrome.bookmarks.getTree();
    const folders = [];
    const walk = (nodes, depth) => {
      for (const n of nodes) {
        if (!n.url && n.children) {
          if (n.title) folders.push({ value: n.id, label: `${"  ".repeat(depth)}${n.title} (${n.children.filter((c) => c.url).length})` });
          walk(n.children, depth + 1);
        }
      }
    };
    walk(tree, 0);
    const v = await formDialog({ title: t("links.importBookmarks"), fields: [{ name: "folder", label: t("links.folder"), type: "select", options: folders, value: folders[0]?.value, wide: true }], okLabel: t("common.import") });
    if (!v) return;
    const [node] = await chrome.bookmarks.getSubTree(v.folder);
    const items = (node.children || []).filter((c) => c.url && /^https?:/.test(c.url)).slice(0, 60);
    links.groups.push(normalizeGroup({ id: uid("group"), name: node.title || "Bookmarks", icon: "⭐", links: items.map((c) => normalizeLink({ label: c.title || c.url, url: c.url })) }));
    await save();
    renderGroups();
    toast(t("links.imported", { n: items.length }), { kind: "success" });
  };

  return [
    groupBox(
      t("set.display"),
      row(
        t("links.style"),
        segmented(
          [
            { value: "tiles", label: t("links.tiles") },
            { value: "list", label: t("links.list") },
          ],
          S().links.style,
          (v) => updateSettings({ links: { style: v } }),
        ),
      ),
      row(t("links.newTab"), toggle(S().links.newTab, (v) => updateSettings({ links: { newTab: v } }))),
      row(
        t("links.mostVisited"),
        toggle(S().links.topSites, async (v) => {
          if (v && isExtension) {
            const ok = await chrome.permissions.request({ permissions: ["topSites"] }).catch(() => false);
            if (!ok) return renderSection();
          }
          updateSettings({ links: { topSites: v } });
        }),
        { hint: t("links.mostVisitedHint") },
      ),
    ),
    groupBox(
      t("links.groups"),
      h(
        "div",
        { style: { padding: "0.75rem 1rem", display: "grid", gap: "0.6rem" } },
        list,
        h(
          "div",
          { class: "swatches" },
          h(
            "button",
            {
              class: "btn btn-sm",
              type: "button",
              onclick: async () => {
                links.groups.push(normalizeGroup({ id: uid("group"), name: t("links.newGroup"), icon: "📁" }));
                await save();
                renderGroups();
              },
            },
            icon("plus", 14),
            t("links.addGroup"),
          ),
          h("button", { class: "btn btn-sm", type: "button", onclick: importBookmarks }, icon("star", 14), t("links.importBookmarks")),
          h(
            "button",
            {
              class: "btn btn-sm",
              type: "button",
              onclick: async () => {
                const { links: fresh, source } = await loadLinks({ ignoreStored: true });
                links = await saveLinks(fresh);
                renderGroups();
                toast(t("bg.reloaded", { source }));
              },
            },
            t("bg.reloadJson"),
          ),
        ),
        h("small", { class: "muted" }, t("links.tip")),
      ),
    ),
  ];
}

function widgetsSection() {
  const list = h("div", { class: "editor-list" });
  const render = () => {
    clear(list);
    S().widgets.order.forEach((id, i) => {
      const def = WIDGETS[id];
      if (!def) return;
      list.appendChild(
        h(
          "div",
          { class: "editor-row", draggable: "true", dataset: { index: String(i) } },
          h("span", { class: "handle" }, icon("grip", 16)),
          icon(def.icon, 18),
          h("span", { class: "grow" }, h("strong", {}, def.title()), h("div", { class: "muted small" }, def.desc())),
          toggle(S().widgets.enabled[id], (v) =>
            updateSettings((cur) => {
              cur.widgets.enabled[id] = v;
              return cur;
            }),
          ),
        ),
      );
    });
  };
  render();
  sortable(list, ".editor-row", async (from, to) => {
    await updateSettings((cur) => {
      const order = [...cur.widgets.order];
      const [m] = order.splice(from, 1);
      order.splice(to, 0, m);
      cur.widgets.order = order;
      return cur;
    });
    render();
  });
  return [
    groupBox(null, row(t("set.showWidgets"), toggle(S().widgets.show, (v) => updateSettings({ widgets: { show: v } })))),
    groupBox(t("widgets.order"), h("div", { style: { padding: "0.75rem 1rem" } }, list)),
    groupBox(
      t("w.weather"),
      row(
        t("weather.units"),
        segmented(
          [
            { value: "c", label: "°C" },
            { value: "f", label: "°F" },
          ],
          S().weather.units,
          (v) => updateSettings({ weather: { units: v } }),
        ),
      ),
      row(
        t("weather.city"),
        h(
          "span",
          { class: "set-row-control" },
          h("span", { class: "muted" }, S().weather.city ? `${S().weather.city.name}, ${S().weather.city.country}` : t("common.none")),
          S().weather.city ? h("button", { class: "btn btn-sm", type: "button", onclick: () => updateSettings({ weather: { city: null } }).then(renderSection) }, t("common.clear")) : null,
        ),
      ),
    ),
  ];
}

function focusSection() {
  const f = S().focus;
  const blocklist = h("textarea", { class: "input", rows: 6, dir: "ltr", placeholder: "youtube.com\ninstagram.com" });
  blocklist.value = f.blocklist.join("\n");
  blocklist.addEventListener(
    "input",
    debounce(() => {
      const list = blocklist.value
        .split(/[\n,]+/)
        .map((x) => x.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""))
        .filter(Boolean);
      updateSettings((cur) => {
        cur.focus.blocklist = [...new Set(list)];
        return cur;
      });
    }, 500),
  );
  const mins = (key, min, max) => numberInput(f[key], (v) => updateSettings({ focus: { [key]: v } }), { min, max });
  return [
    groupBox(
      t("focus.durations"),
      row(t("focus.workLen"), mins("work", 1, 180), { hint: t("focus.minutes") }),
      row(t("focus.shortLen"), mins("short", 1, 60), { hint: t("focus.minutes") }),
      row(t("focus.longLen"), mins("long", 1, 90), { hint: t("focus.minutes") }),
      row(t("focus.longEvery"), mins("longEvery", 2, 12), { hint: t("focus.longEveryHint") }),
      row(t("focus.goal"), mins("dailyGoal", 1, 24), { hint: t("focus.goalHint") }),
    ),
    groupBox(
      t("focus.behaviour"),
      row(t("focus.autoBreak"), toggle(f.autoBreak, (v) => updateSettings({ focus: { autoBreak: v } }))),
      row(t("focus.autoWork"), toggle(f.autoWork, (v) => updateSettings({ focus: { autoWork: v } }))),
      row(t("focus.notify"), toggle(f.notify, (v) => updateSettings({ focus: { notify: v } }))),
      row(
        t("focus.sound"),
        h(
          "span",
          { class: "set-row-control" },
          h("button", { class: "btn btn-sm", type: "button", onclick: () => isExtension && chrome.runtime.sendMessage({ type: "chime", kind: "done" }) }, icon("volume", 14), t("focus.test")),
          toggle(f.sound, (v) => updateSettings({ focus: { sound: v } })),
        ),
      ),
    ),
    groupBox(
      t("focus.blocking"),
      row(t("focus.block"), toggle(f.block, (v) => updateSettings({ focus: { block: v } })), { hint: t("focus.blockHint") }),
      row(t("focus.blocklist"), blocklist, { stack: true, hint: t("focus.blocklistHint") }),
    ),
  ];
}

async function dataSection() {
  const usage = h("span", { class: "muted" }, "…");
  if (isExtension) {
    const bytes = await chrome.storage.local.getBytesInUse(null).catch(() => 0);
    const est = await navigator.storage?.estimate?.().catch(() => null);
    usage.textContent = t("data.usage", { a: formatBytes(bytes, locale()), b: formatBytes(est?.usage || 0, locale()) });
  }
  const importInput = h("input", { type: "file", accept: "application/json,.json", class: "hidden" });
  importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    importInput.value = "";
    if (!file) return;
    try {
      await importBackup(JSON.parse(await file.text()));
      toast(t("data.imported"), { kind: "success" });
      setTimeout(() => location.reload(), 600);
    } catch (error) {
      toast(t("data.importFailed", { e: error.message }), { kind: "error", timeout: 6000 });
    }
  });

  return [
    groupBox(
      t("perm.title"),
      await permissionRow(t("perm.bookmarksHistory"), t("perm.bookmarksHistoryHint"), ["bookmarks", "history"]),
      await permissionRow(t("links.mostVisited"), t("links.mostVisitedHint"), ["topSites"]),
      await featureRow(t("w.weather"), t("perm.weatherHint"), "weather"),
      await featureRow(t("w.markets"), t("perm.marketsHint"), "markets"),
    ),
    groupBox(
      t("data.backup"),
      row(t("data.export"), h("button", { class: "btn btn-sm", type: "button", onclick: exportBackup }, icon("download", 14), t("data.exportBtn")), { hint: t("data.exportHint") }),
      row(t("data.import"), h("span", { class: "set-row-control" }, importInput, h("button", { class: "btn btn-sm", type: "button", onclick: () => importInput.click() }, icon("upload", 14), t("data.importBtn"))), { hint: t("data.importHint") }),
      row(t("data.storage"), usage),
    ),
    groupBox(
      t("data.danger"),
      row(
        t("data.reset"),
        h(
          "button",
          {
            class: "btn btn-sm btn-danger",
            type: "button",
            onclick: async () => {
              if (!(await confirmDialog(t("data.resetConfirm"), { danger: true, okLabel: t("data.resetBtn") }))) return;
              await removeKeys(Object.values(KEYS));
              await MediaDB.clear().catch(() => {});
              try {
                localStorage.clear();
              } catch {
                /* ignore */
              }
              location.reload();
            },
          },
          t("data.resetBtn"),
        ),
        { hint: t("data.resetHint") },
      ),
    ),
    h("p", { class: "set-intro", style: { margin: 0 } }, t("data.privacy")),
  ];
}

export async function exportBackup() {
  const data = await getMany(BACKUP_KEYS);
  const payload = { app: "NeTab", format: 3, exportedAt: new Date().toISOString(), version: isExtension ? chrome.runtime.getManifest().version : "dev", data };
  downloadFile(`netab-backup-${new Date().toISOString().slice(0, 10)}.json`, payload);
  toast(t("data.exported"), { kind: "success" });
}

async function importBackup(json) {
  if (json?.app === "NeTab" && json.data && typeof json.data === "object") {
    const values = {};
    for (const key of BACKUP_KEYS) if (key in json.data) values[key] = json.data[key];
    if (values[KEYS.settings]) values[KEYS.settings] = normalizeSettings(values[KEYS.settings]);
    if (values[KEYS.links]) values[KEYS.links] = normalizeLinks(values[KEYS.links]);
    if (values[KEYS.media]) values[KEYS.media] = normalizeMedia(values[KEYS.media]);
    await setMany(values);
    return;
  }
  // NeTab 2.x export: { version: 2, links, media, ui }
  if (json?.links || json?.groups) {
    await setMany({
      [KEYS.links]: normalizeLinks(json.links || json),
      ...(json.media ? { [KEYS.media]: normalizeMedia(json.media) } : {}),
    });
    return;
  }
  throw new Error(t("data.unknownFormat"));
}

function about() {
  const version = isExtension ? chrome.runtime.getManifest().version : "dev";
  const mod = /Mac/.test(navigator.platform) ? "⌘" : "Ctrl";
  const kb = (keys, label) => h("tr", {}, h("td", {}, label), h("td", {}, keys.map((k, i) => [i ? " + " : "", h("kbd", {}, k)])));
  return [
    groupBox(
      null,
      h(
        "div",
        { class: "about-card" },
        h("img", { src: "../../assets/icons/icon-128.png", alt: "" }),
        h("div", {}, h("h3", { style: { margin: 0 } }, "NeTab"), h("div", { class: "muted" }, t("about.tagline")), h("div", { class: "muted small" }, t("about.version", { v: version }))),
      ),
    ),
    groupBox(
      t("about.pageShortcuts"),
      h(
        "table",
        { class: "kbd-table" },
        kb([mod, "K"], t("about.kSearch")),
        kb(["/"], t("about.kSearch")),
        kb([">"], t("about.kCommands")),
        kb(["Alt", "Z"], t("set.zen")),
        kb(["Alt", "B"], t("top.nextBg")),
        kb(["Alt", "N"], t("notes.new")),
        kb(["Alt", "T"], t("todo.add")),
        kb(["Alt", ","], t("top.settings")),
        kb(["Esc"], t("about.kClose")),
      ),
    ),
    groupBox(
      t("about.globalShortcuts"),
      h(
        "table",
        { class: "kbd-table" },
        kb(["Alt", "Shift", "N"], t("about.kPopup")),
        kb(["Alt", "Shift", "F"], t("menu.toggleFocus")),
        kb(["Alt", "Shift", "L"], t("menu.readLater")),
        kb(["Alt", "Shift", "S"], t("about.kSidePanel")),
      ),
      row(
        t("about.customize"),
        h("button", { class: "btn btn-sm", type: "button", onclick: () => isExtension && chrome.tabs.create({ url: "chrome://extensions/shortcuts" }) }, icon("keyboard", 14), t("about.openShortcuts")),
      ),
    ),
    groupBox(
      t("about.tips"),
      h("ul", { class: "tips" }, ["about.tip1", "about.tip2", "about.tip3", "about.tip4", "about.tip5", "about.tip6"].map((k) => h("li", {}, t(k)))),
    ),
  ];
}

// ---------------------------------------------------------------------------
// Drawer

async function renderSection() {
  if (!bodyEl) return;
  const scroll = bodyEl.scrollTop;
  const builders = {
    general,
    appearance,
    background,
    search,
    links: linksSection,
    widgets: widgetsSection,
    focus: focusSection,
    data: dataSection,
    about,
  };
  const content = await builders[current]();
  const meta = SECTIONS.find((s) => s[0] === current);
  clear(bodyEl).appendChild(h("section", { class: "set-section" }, h("h3", {}, t(meta[2])), h("p", { class: "set-intro" }, t(`${meta[2]}.intro`)), ...content.filter(Boolean)));
  bodyEl.scrollTop = scroll;
  for (const btn of navEl.querySelectorAll("button")) btn.classList.toggle("active", btn.dataset.section === current);
}

function build() {
  navEl = h(
    "nav",
    { class: "drawer-nav" },
    SECTIONS.map(([id, ic, key]) =>
      h(
        "button",
        {
          type: "button",
          dataset: { section: id },
          onclick: () => {
            current = id;
            bodyEl.scrollTop = 0;
            renderSection();
          },
        },
        icon(ic, 17),
        h("span", {}, t(key)),
      ),
    ),
  );
  bodyEl = h("div", { class: "drawer-body" });
  fill(drawer, 
    h(
      "header",
      { class: "drawer-header" },
      h("h2", { class: "drawer-title", id: "settingsTitle" }, h("img", { src: "../../assets/icons/icon-48.png", alt: "" }), t("top.settings")),
      h("button", { class: "icon-btn", type: "button", title: t("common.close"), onclick: closeSettings }, icon("x", 18)),
    ),
    navEl,
    bodyEl,
  );
}

export function openSettings(section) {
  if (section && SECTIONS.some((s) => s[0] === section)) current = section;
  build();
  drawer.classList.remove("hidden");
  overlay.classList.remove("hidden");
  drawer.setAttribute("aria-hidden", "false");
  renderSection();
}

export function closeSettings() {
  drawer.classList.add("hidden");
  overlay.classList.add("hidden");
  drawer.setAttribute("aria-hidden", "true");
}

export function settingsOpen() {
  return drawer && !drawer.classList.contains("hidden");
}

export function initSettings() {
  drawer = document.getElementById("settingsDrawer");
  overlay = document.getElementById("drawerOverlay");
  overlay.addEventListener("click", closeSettings);
  on("settings", ({ langChanged }) => {
    if (!settingsOpen()) return;
    if (langChanged) build();
    // Re-render sections whose controls depend on other values.
    if (langChanged || ["background"].includes(current)) renderSection();
  });
}

