// Tab manager: live tab stats, one-click cleanup, and saved sessions you can restore.

import { h, clear, setFavicon, hostname, isExtension, fill } from "../../lib/utils.js";
import { KEYS, getList, updateList, subscribe } from "../../lib/storage.js";
import { icon } from "../../lib/icons.js";
import { t, lang, fmtNumber } from "../../lib/i18n.js";
import { toast, openMenu, emptyState, formDialog, confirmDialog } from "../../lib/ui.js";
import { relativeTime } from "../../lib/dates.js";
import * as Tabs from "../../lib/tabs.js";

export async function runTabAction(action) {
  if (!isExtension) return toast(t("tabs.extOnly"));
  try {
    if (action === "dedupe") {
      const n = await Tabs.closeDuplicates();
      toast(n ? t("tabs.dedupeDone", { n }) : t("tabs.noDupes"), { kind: "success" });
    } else if (action === "group") {
      const n = await Tabs.groupByDomain();
      toast(n ? t("tabs.groupDone", { n }) : t("tabs.nothingToGroup"), { kind: "success" });
    } else if (action === "ungroup") {
      await Tabs.ungroupAll();
      toast(t("tabs.ungroupDone"));
    } else if (action === "sort") {
      await Tabs.sortByDomain();
      toast(t("tabs.sortDone"), { kind: "success" });
    } else if (action === "discard") {
      const n = await Tabs.discardInactive();
      toast(t("tabs.discardDone", { n }), { kind: "success" });
    } else if (action === "merge") {
      const n = await Tabs.mergeWindows();
      toast(n ? t("tabs.mergeDone", { n }) : t("tabs.oneWindow"), { kind: "success" });
    } else if (action === "save") {
      const v = await formDialog({
        title: t("tabs.saveSession"),
        fields: [
          { name: "name", label: t("common.name"), value: new Date().toLocaleString(lang() === "fa" ? "fa-IR" : "en-US", { dateStyle: "medium", timeStyle: "short" }), autofocus: true, wide: true },
          {
            name: "scope",
            label: t("tabs.scope"),
            type: "select",
            value: "window",
            options: [
              { value: "window", label: t("tabs.scopeWindow") },
              { value: "all", label: t("tabs.scopeAll") },
            ],
            wide: true,
          },
          { name: "close", label: t("tabs.closeAfter"), type: "checkbox", value: false },
        ],
      });
      if (!v) return;
      const session = await Tabs.saveSession({ name: v.name, scope: v.scope, close: v.close });
      toast(session ? t("tabs.saved", { n: session.tabs.length }) : t("tabs.nothingToSave"), { kind: "success" });
    }
  } catch (error) {
    console.error(error);
    toast(t("common.error"), { kind: "error" });
  }
}

export default {
  id: "sessions",
  icon: "tabs",
  size: "md",
  title: () => t("w.sessions"),
  desc: () => t("w.sessions.desc"),

  mount(body, ctx) {
    let sessions = [];
    const expanded = new Set();

    const statsEl = h("div", { class: "tab-stats" });
    const actions = h(
      "div",
      { class: "tab-actions" },
      [
        ["save", "save", "tabs.save"],
        ["dedupe", "copy", "tabs.dedupe"],
        ["group", "layers", "tabs.group"],
        ["discard", "zap", "tabs.discard"],
      ].map(([action, ic, key]) =>
        h(
          "button",
          {
            class: "tab-action",
            type: "button",
            onclick: async () => {
              await runTabAction(action);
              refreshStats();
            },
          },
          icon(ic, 17),
          h("span", {}, t(key)),
        ),
      ),
    );
    const list = h("div", { class: "session-list" });
    body.append(statsEl, actions, h("div", { class: "subhead" }, t("tabs.savedSessions")), list);

    ctx.setMenu?.(() => [
      { label: t("tabs.sort"), icon: "sort", onClick: () => runTabAction("sort").then(refreshStats) },
      { label: t("tabs.ungroup"), icon: "layers", onClick: () => runTabAction("ungroup") },
      { label: t("tabs.merge"), icon: "merge", onClick: () => runTabAction("merge").then(refreshStats) },
    ]);

    async function refreshStats() {
      if (!isExtension) {
        clear(statsEl).appendChild(h("span", { class: "muted small" }, t("tabs.extOnly")));
        return;
      }
      const s = await Tabs.tabStats();
      fill(statsEl, 
        stat(s.tabs, t("tabs.tabs")),
        stat(s.windows, t("tabs.windows")),
        stat(s.duplicates, t("tabs.duplicates"), s.duplicates ? "warn" : ""),
        stat(s.discardable, t("tabs.inactive")),
      );
    }

    function stat(n, label, cls = "") {
      return h("div", { class: `tab-stat ${cls}` }, h("strong", {}, fmtNumber(n)), h("span", {}, label));
    }

    async function restore(session, newWindow) {
      if (!isExtension) return;
      const n = await Tabs.restoreSession(session, { newWindow });
      toast(t("tabs.restored", { n }));
    }

    async function rename(session) {
      const v = await formDialog({ title: t("common.rename"), fields: [{ name: "name", label: t("common.name"), value: session.name, autofocus: true, wide: true }] });
      if (v?.name) await updateList(KEYS.sessions, (all) => all.map((x) => (x.id === session.id ? { ...x, name: v.name } : x)));
    }

    async function remove(session) {
      if (!(await confirmDialog(t("tabs.deleteConfirm", { name: session.name }), { danger: true, okLabel: t("common.delete") }))) return;
      const index = sessions.findIndex((x) => x.id === session.id);
      await updateList(KEYS.sessions, (all) => all.filter((x) => x.id !== session.id));
      toast(t("tabs.deleted"), {
        action: () =>
          updateList(KEYS.sessions, (all) => {
            const copy = [...all];
            copy.splice(index, 0, session);
            return copy;
          }),
      });
    }

    function render() {
      clear(list);
      if (!sessions.length) list.appendChild(emptyState("save", t("tabs.noSessions")));
      for (const s of sessions) {
        const open = expanded.has(s.id);
        const icons = h("span", { class: "session-favs" });
        for (const tab of s.tabs.slice(0, 5)) {
          const img = h("img", { alt: "", loading: "lazy" });
          setFavicon(img, tab.url, 32);
          icons.appendChild(img);
        }
        const item = h(
          "div",
          { class: `session ${open ? "open" : ""}` },
          h(
            "div",
            { class: "session-head" },
            h(
              "button",
              {
                class: "session-toggle",
                type: "button",
                onclick: () => {
                  open ? expanded.delete(s.id) : expanded.add(s.id);
                  render();
                },
              },
              icon("chevronDown", 14, "chev"),
              h("span", { class: "session-text" }, h("strong", {}, s.name), h("small", {}, `${t("tabs.nTabs", { n: s.tabs.length })} · ${relativeTime(s.createdAt, lang())}`)),
              icons,
            ),
            h("button", { class: "icon-btn sm", type: "button", title: t("tabs.restore"), onclick: () => restore(s, true) }, icon("external", 15)),
            h(
              "button",
              {
                class: "icon-btn sm",
                type: "button",
                title: t("common.more"),
                onclick: (e) =>
                  openMenu(e.currentTarget, [
                    { label: t("tabs.restoreNewWindow"), icon: "external", onClick: () => restore(s, true) },
                    { label: t("tabs.restoreHere"), icon: "tabs", onClick: () => restore(s, false) },
                    { label: t("common.rename"), icon: "edit", onClick: () => rename(s) },
                    "separator",
                    { label: t("common.delete"), icon: "trash", danger: true, onClick: () => remove(s) },
                  ]),
              },
              icon("more", 15),
            ),
          ),
          open
            ? h(
                "ul",
                { class: "session-tabs" },
                s.tabs.map((tab) => {
                  const img = h("img", { alt: "", loading: "lazy" });
                  setFavicon(img, tab.url, 32);
                  return h("li", {}, h("a", { href: tab.url, title: tab.url }, img, h("span", {}, tab.title || hostname(tab.url))));
                }),
              )
            : null,
        );
        list.appendChild(item);
      }
    }

    const unsub = subscribe(KEYS.sessions, (v) => {
      sessions = Array.isArray(v) ? v : [];
      render();
    });
    getList(KEYS.sessions).then((v) => {
      sessions = v;
      render();
    });
    refreshStats();

    const listeners = [];
    if (isExtension && chrome.tabs?.onCreated) {
      let pending = null;
      const schedule = () => {
        clearTimeout(pending);
        pending = setTimeout(refreshStats, 400);
      };
      for (const ev of [chrome.tabs.onCreated, chrome.tabs.onRemoved, chrome.tabs.onUpdated]) {
        ev.addListener(schedule);
        listeners.push([ev, schedule]);
      }
    }

    return {
      destroy() {
        unsub();
        for (const [ev, fn] of listeners) ev.removeListener(fn);
      },
    };
  },
};
