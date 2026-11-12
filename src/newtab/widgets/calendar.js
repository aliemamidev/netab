// Month calendar with Gregorian / Persian (Jalali) / Islamic views,
// a secondary calendar in each cell and dots for tasks with due dates.

import { h, clear, todayKey, fill } from "../../lib/utils.js";
import { icon } from "../../lib/icons.js";
import { t, lang } from "../../lib/i18n.js";
import { app, on } from "../app.js";
import { KEYS, getList, subscribe } from "../../lib/storage.js";
import { addDays, monthGrid, monthTitle, shiftMonth, weekdayNames, resolveCalendars, resolveWeekStart, formatDayNumber, calendarParts, formatDate } from "../../lib/dates.js";
import { segmented } from "../../lib/ui.js";

const VIEW_KEY = "netab.calendar.view";

export default {
  id: "calendar",
  icon: "calendar",
  size: "md",
  title: () => t("w.calendar"),
  desc: () => t("w.calendar.desc"),

  mount(body, ctx) {
    let anchor = new Date();
    let tasks = [];
    let selected = null;
    let view = null;
    try {
      view = localStorage.getItem(VIEW_KEY);
    } catch {
      /* ignore */
    }

    const title = h("div", { class: "cal-title" });
    const prev = h("button", { class: "icon-btn sm", type: "button", title: t("cal.prev"), onclick: () => move(-1) }, icon(lang() === "fa" ? "chevronRight" : "chevronLeft", 16));
    const next = h("button", { class: "icon-btn sm", type: "button", title: t("cal.next"), onclick: () => move(1) }, icon(lang() === "fa" ? "chevronLeft" : "chevronRight", 16));
    const todayBtn = h("button", { class: "btn btn-sm", type: "button", onclick: () => ((anchor = new Date()), (selected = null), render()) }, t("todo.today"));
    const grid = h("div", { class: "cal-grid" });
    const detail = h("div", { class: "cal-detail" });

    const calSeg = segmented(
      [
        { value: "gregory", label: t("cal.gregorian") },
        { value: "persian", label: t("cal.persian") },
        { value: "islamic-umalqura", label: t("cal.islamic") },
      ],
      currentCal(),
      (v) => {
        view = v;
        try {
          localStorage.setItem(VIEW_KEY, v);
        } catch {
          /* ignore */
        }
        render();
      },
      { className: "small" },
    );

    body.append(h("div", { class: "cal-head" }, prev, title, next, h("span", { class: "spacer" }), todayBtn), grid, detail, h("div", { class: "widget-footer center" }, calSeg));

    function currentCal() {
      return view || resolveCalendars(app.settings, lang()).primary;
    }

    function secondaryCal(primary) {
      const pref = resolveCalendars(app.settings, lang());
      if (pref.secondary !== "none" && pref.secondary !== primary) return pref.secondary;
      return primary === "gregory" ? (lang() === "fa" ? "persian" : null) : "gregory";
    }

    function move(delta) {
      anchor = shiftMonth(anchor, currentCal(), delta);
      render();
    }

    function render() {
      const cal = currentCal();
      const second = secondaryCal(cal);
      const weekStart = resolveWeekStart(app.settings, lang(), cal);
      const data = monthGrid(anchor, cal, weekStart);
      let secondTitle = "";
      if (second) {
        const last = addDays(data.first, data.length - 1);
        const a = formatDate(data.first, second, lang(), { month: "long" });
        const b = formatDate(last, second, lang(), { month: "long" });
        const year = formatDate(last, second, lang(), { year: "numeric" });
        secondTitle = a === b ? `${a} ${year}` : `${a} – ${b} ${year}`;
      }
      fill(title, h("strong", {}, monthTitle(data.first, cal, lang())), second ? h("small", {}, secondTitle) : null);

      const due = new Map();
      for (const task of tasks) {
        if (!task.due || task.done) continue;
        due.set(task.due, [...(due.get(task.due) || []), task]);
      }

      clear(grid);
      for (const name of weekdayNames(lang(), weekStart, "narrow")) grid.appendChild(h("div", { class: "cal-wd" }, name));
      for (const cell of data.cells) {
        const key = todayKey(cell.date);
        const dayTasks = due.get(key) || [];
        const secondDay = second ? calendarParts(cell.date, second).day : null;
        grid.appendChild(
          h(
            "button",
            {
              type: "button",
              class: ["cal-day", cell.inMonth ? "" : "out", cell.isToday ? "today" : "", cell.weekend ? "weekend" : "", selected === key ? "selected" : ""].join(" "),
              title: formatDate(cell.date, cal, lang()),
              onclick: () => {
                selected = selected === key ? null : key;
                render();
              },
            },
            h("span", { class: "n" }, formatDayNumber(cell.day, lang())),
            secondDay ? h("span", { class: "n2" }, formatDayNumber(secondDay, lang())) : null,
            dayTasks.length ? h("span", { class: "dot" }) : null,
          ),
        );
      }

      clear(detail);
      if (selected) {
        const [y, m, d] = selected.split("-").map(Number);
        const date = new Date(y, m - 1, d, 12);
        const list = due.get(selected) || [];
        detail.append(
          h("div", { class: "cal-detail-title" }, formatDate(date, cal, lang()), second ? h("span", { class: "muted" }, ` · ${formatDate(date, second, lang(), { day: "numeric", month: "long", year: "numeric" })}`) : null),
          list.length ? h("ul", { class: "cal-tasks" }, list.map((x) => h("li", {}, x.star ? "★ " : "• ", x.text))) : h("div", { class: "muted small" }, t("cal.noTasks")),
        );
      }
    }

    const unsubs = [
      subscribe(KEYS.todos, (value) => {
        tasks = Array.isArray(value) ? value : [];
        render();
      }),
      on("settings", render),
    ];
    getList(KEYS.todos).then((list) => {
      tasks = list;
      render();
    });
    render();

    // Roll over at midnight.
    const midnight = setInterval(() => {
      if (!grid.querySelector(".today") || !document.hidden) render();
    }, 10 * 60_000);

    return {
      destroy() {
        clearInterval(midnight);
        unsubs.forEach((u) => u());
      },
    };
  },
};
