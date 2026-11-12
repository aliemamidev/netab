// World clocks with offsets relative to local time.

import { h, clear, uid } from "../../lib/utils.js";
import { icon } from "../../lib/icons.js";
import { t, lang } from "../../lib/i18n.js";
import { app, on, updateSettings } from "../app.js";
import { formatTime, resolveHour12, listTimeZones, isValidTimeZone, uiLocale } from "../../lib/dates.js";
import { formDialog, openMenu, emptyState } from "../../lib/ui.js";

function offsetMinutes(tz, date = new Date()) {
  const local = new Date(date.toLocaleString("en-US"));
  const there = new Date(date.toLocaleString("en-US", { timeZone: tz }));
  return Math.round((there - local) / 60000);
}

function diffLabel(mins) {
  if (mins === 0) return t("wc.same");
  const sign = mins > 0 ? "+" : "−";
  const abs = Math.abs(mins);
  const hh = Math.floor(abs / 60);
  const mm = abs % 60;
  return `${sign}${hh}${mm ? `:${String(mm).padStart(2, "0")}` : ""}${t("wc.h")}`;
}

export default {
  id: "worldclock",
  icon: "globe",
  size: "sm",
  title: () => t("w.worldclock"),
  desc: () => t("w.worldclock.desc"),

  mount(body, ctx) {
    const list = h("div", { class: "wc-list" });
    body.append(list);

    ctx.setActions?.([h("button", { class: "icon-btn sm", type: "button", title: t("wc.add"), onclick: add }, icon("plus", 16))]);

    async function add() {
      const zones = listTimeZones();
      const datalist = h("datalist", { id: "tzList" }, zones.map((z) => h("option", { value: z })));
      const v = await formDialog({
        title: t("wc.add"),
        fields: [
          { name: "tz", label: t("wc.zone"), placeholder: "Asia/Tehran", required: true, autofocus: true, wide: true, dir: "ltr", list: "tzList" },
          { name: "label", label: t("wc.label"), placeholder: t("wc.labelHint"), wide: true },
        ],
        okLabel: t("common.add"),
        extra: datalist,
      });
      if (!v) return;
      const tz = zones.find((z) => z.toLowerCase() === v.tz.toLowerCase()) || v.tz;
      if (!isValidTimeZone(tz)) return;
      const label = v.label || tz.split("/").pop().replace(/_/g, " ");
      await updateSettings((cur) => {
        cur.worldClocks = [...cur.worldClocks, { id: uid("wc"), label, tz }].slice(0, 12);
        return cur;
      });
    }

    function render() {
      clear(list);
      const clocks = app.settings.worldClocks;
      if (!clocks.length) list.appendChild(emptyState("globe", t("wc.empty"), { label: t("wc.add"), onClick: add }));
      const now = new Date();
      const hour12 = resolveHour12(app.settings.clock.format, lang());
      for (const c of clocks) {
        const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: c.tz }).format(now));
        const day = hour >= 6 && hour < 18;
        const mins = offsetMinutes(c.tz, now);
        const weekday = new Intl.DateTimeFormat(uiLocale(lang()), { weekday: "short", timeZone: c.tz }).format(now);
        list.appendChild(
          h(
            "div",
            { class: "wc-row" },
            h("span", { class: "wc-emoji" }, day ? "☀️" : "🌙"),
            h("span", { class: "wc-name" }, h("strong", {}, c.label), h("small", {}, `${weekday} · ${diffLabel(mins)}`)),
            h("span", { class: "wc-time" }, formatTime(now, { lang: lang(), hour12, timeZone: c.tz })),
            h(
              "button",
              {
                class: "icon-btn sm wc-more",
                type: "button",
                title: t("common.more"),
                onclick: (e) =>
                  openMenu(e.currentTarget, [
                    {
                      label: t("common.delete"),
                      icon: "trash",
                      danger: true,
                      onClick: () =>
                        updateSettings((cur) => {
                          cur.worldClocks = cur.worldClocks.filter((x) => x.id !== c.id);
                          return cur;
                        }),
                    },
                  ]),
              },
              icon("more", 15),
            ),
          ),
        );
      }
    }

    render();
    const timer = setInterval(render, 20_000);
    const off = on("settings", render);
    return {
      destroy() {
        clearInterval(timer);
        off();
      },
    };
  },
};
