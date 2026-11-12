// Read later queue: filled from the popup, the context menu or the shortcut.

import { h, clear, uid, setFavicon, hostname, isHttpUrl, normalizeUrl, fill } from "../../lib/utils.js";
import { KEYS, getList, updateList, subscribe } from "../../lib/storage.js";
import { icon } from "../../lib/icons.js";
import { t, lang } from "../../lib/i18n.js";
import { toast, openMenu, emptyState, segmented, formDialog } from "../../lib/ui.js";
import { relativeTime } from "../../lib/dates.js";

export async function addReadLater(url, title) {
  if (!isHttpUrl(url)) return false;
  let added = false;
  await updateList(KEYS.readLater, (list) => {
    if (list.some((x) => x.url === url && !x.done)) return list;
    added = true;
    return [{ id: uid("rl"), url, title: title || url, addedAt: new Date().toISOString(), done: false }, ...list].slice(0, 500);
  });
  return added;
}

export default {
  id: "readlater",
  icon: "bookmark",
  size: "md",
  title: () => t("w.readlater"),
  desc: () => t("w.readlater.desc"),

  mount(body, ctx) {
    let items = [];
    let filter = "unread";

    ctx.setActions?.([
      h(
        "button",
        {
          class: "icon-btn sm",
          type: "button",
          title: t("readlater.add"),
          onclick: async () => {
            const v = await formDialog({
              title: t("readlater.add"),
              fields: [
                { name: "url", label: "URL", required: true, placeholder: "https://", dir: "ltr", autofocus: true, wide: true },
                { name: "title", label: t("common.title"), wide: true },
              ],
              okLabel: t("common.add"),
            });
            if (v?.url) await addReadLater(normalizeUrl(v.url), v.title);
          },
        },
        icon("plus", 16),
      ),
    ]);

    const seg = segmented(
      [
        { value: "unread", label: t("readlater.unread") },
        { value: "done", label: t("readlater.read") },
      ],
      filter,
      (v) => {
        filter = v;
        render();
      },
      { className: "small" },
    );
    const list = h("div", { class: "rl-list" });
    const footer = h("div", { class: "widget-footer" });
    body.append(seg, list, footer);

    async function setItem(id, patch) {
      await updateList(KEYS.readLater, (all) => all.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    }

    async function removeItem(item) {
      await updateList(KEYS.readLater, (all) => all.filter((x) => x.id !== item.id));
      toast(t("readlater.removed"), { action: () => updateList(KEYS.readLater, (all) => [item, ...all]) });
    }

    function render() {
      clear(list);
      const visible = items.filter((x) => (filter === "done" ? x.done : !x.done));
      if (!visible.length) list.appendChild(emptyState("bookmark", filter === "done" ? t("readlater.noneRead") : t("readlater.empty")));
      for (const item of visible.slice(0, 50)) {
        const img = h("img", { alt: "", loading: "lazy" });
        setFavicon(img, item.url, 32);
        list.appendChild(
          h(
            "div",
            { class: "rl-item" },
            h(
              "a",
              {
                class: "rl-link",
                href: item.url,
                title: item.url,
                onclick: () => {
                  if (!item.done) setItem(item.id, { done: true, readAt: new Date().toISOString() });
                },
              },
              h("span", { class: "rl-icon" }, img),
              h("span", { class: "rl-text" }, h("strong", {}, item.title || item.url), h("small", {}, `${hostname(item.url)} · ${relativeTime(item.addedAt, lang())}`)),
            ),
            h(
              "button",
              {
                class: "icon-btn sm",
                type: "button",
                title: item.done ? t("readlater.markUnread") : t("readlater.markRead"),
                onclick: () => setItem(item.id, { done: !item.done }),
              },
              icon(item.done ? "reset" : "check", 15),
            ),
            h(
              "button",
              {
                class: "icon-btn sm",
                type: "button",
                title: t("common.more"),
                onclick: (e) =>
                  openMenu(e.currentTarget, [
                    { label: t("links.openNewTab"), icon: "external", onClick: () => window.open(item.url, "_blank", "noopener") },
                    { label: t("common.delete"), icon: "trash", danger: true, onClick: () => removeItem(item) },
                  ]),
              },
              icon("more", 15),
            ),
          ),
        );
      }
      const unread = items.filter((x) => !x.done).length;
      fill(footer, 
        h("span", {}, t("readlater.count", { n: unread })),
        filter === "done" && items.some((x) => x.done)
          ? h("button", { class: "link-btn", type: "button", onclick: () => updateList(KEYS.readLater, (all) => all.filter((x) => !x.done)) }, t("readlater.clearRead"))
          : null,
      );
      ctx.setBadge?.(unread || "");
    }

    const unsub = subscribe(KEYS.readLater, (v) => {
      items = Array.isArray(v) ? v : [];
      render();
    });
    getList(KEYS.readLater).then((v) => {
      items = v;
      render();
    });
    return { destroy: unsub };
  },
};
