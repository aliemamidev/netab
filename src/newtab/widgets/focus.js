// Focus timer widget (Pomodoro). The service worker owns phase completion,
// notifications and site blocking; this view renders state and sends intents.

import { h, clear, isExtension, dayKeyOffset, todayKey, fill } from "../../lib/utils.js";
import { KEYS, get, update, subscribe } from "../../lib/storage.js";
import * as Focus from "../../lib/focus.js";
import { icon } from "../../lib/icons.js";
import { t, fmtNumber, lang, digits } from "../../lib/i18n.js";
import { app, on, updateSettings } from "../app.js";
import { formatDate } from "../../lib/dates.js";

const RING = 2 * Math.PI * 54;

export async function focusAction(action, phase) {
  const s = app.settings.focus;
  await update(KEYS.focusState, (raw) => {
    const state = Focus.normalizeFocusState(raw);
    if (action === "toggle") return Focus.toggle(state, s);
    if (action === "start") return Focus.start(state, s);
    if (action === "pause") return Focus.pause(state, s);
    if (action === "reset") return Focus.reset(state, s);
    if (action === "phase") return Focus.setPhase(state, phase);
    if (action === "skip") return Focus.complete(state, { ...s, autoBreak: false, autoWork: false }).state;
    return state;
  });
}

export default {
  id: "focus",
  icon: "timer",
  size: "md",
  title: () => t("w.focus"),
  desc: () => t("w.focus.desc"),

  mount(body, ctx) {
    let state = Focus.defaultFocusState();
    let stats = {};
    let timer = null;

    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 120 120");
    svg.setAttribute("class", "focus-ring");
    const track = document.createElementNS(ns, "circle");
    const bar = document.createElementNS(ns, "circle");
    for (const c of [track, bar]) {
      c.setAttribute("cx", "60");
      c.setAttribute("cy", "60");
      c.setAttribute("r", "54");
      c.setAttribute("fill", "none");
      c.setAttribute("stroke-width", "6");
    }
    track.setAttribute("class", "track");
    bar.setAttribute("class", "bar");
    bar.setAttribute("stroke-dasharray", String(RING));
    bar.setAttribute("stroke-linecap", "round");
    bar.setAttribute("transform", "rotate(-90 60 60)");
    svg.append(track, bar);

    const timeEl = h("div", { class: "focus-time" }, "25:00");
    const phaseEl = h("div", { class: "focus-phase" });
    const ringBox = h("div", { class: "focus-ring-box" }, svg, h("div", { class: "focus-center" }, timeEl, phaseEl));

    const phaseTabs = h("div", { class: "segmented small focus-tabs" });
    const playBtn = h("button", { class: "btn btn-primary focus-play", type: "button", onclick: () => focusAction("toggle") });
    const resetBtn = h("button", { class: "icon-btn", type: "button", title: t("focus.reset"), onclick: () => focusAction("reset") }, icon("reset", 18));
    const skipBtn = h("button", { class: "icon-btn", type: "button", title: t("focus.skip"), onclick: () => focusAction("skip") }, icon("skip", 18));
    const controls = h("div", { class: "focus-controls" }, resetBtn, playBtn, skipBtn);

    const goalDots = h("div", { class: "focus-goal" });
    const week = h("div", { class: "focus-week" });
    const blockToggle = h("button", {
      class: "chip focus-block",
      type: "button",
      onclick: () => updateSettings({ focus: { block: !app.settings.focus.block } }),
    });

    body.append(h("div", { class: "focus-main" }, ringBox, h("div", { class: "focus-side" }, phaseTabs, controls, goalDots, blockToggle)), week);

    function renderTabs() {
      clear(phaseTabs);
      for (const p of Focus.PHASES) {
        phaseTabs.appendChild(
          h(
            "button",
            { type: "button", class: state.phase === p ? "active" : "", onclick: () => focusAction("phase", p) },
            t(`focus.phase.${p}`),
          ),
        );
      }
    }

    function tick() {
      const s = app.settings.focus;
      const ms = Focus.remainingMs(state, s);
      timeEl.textContent = digits(Focus.formatClock(ms));
      const p = Math.min(1, Math.max(0, Focus.progress(state, s)));
      bar.setAttribute("stroke-dashoffset", String(RING * (1 - p)));
      if (state.status === "running" && ms <= 0) {
        if (!isExtension) {
          // No service worker in plain-file previews: complete locally.
          update(KEYS.focusState, (raw) => Focus.complete(Focus.normalizeFocusState(raw), s).state);
        } else {
          chrome.runtime.sendMessage({ type: "focus-complete-check" }).catch(() => {});
        }
      }
      if (ctx.surface === "newtab" && state.status === "running") {
        document.title = `${digits(Focus.formatClock(ms))} · ${t(`focus.phase.${state.phase}`)}`;
      }
    }

    function render() {
      body.dataset.phase = state.phase;
      body.dataset.status = state.status;
      renderTabs();
      phaseEl.textContent = state.status === "paused" ? t("focus.paused") : t(`focus.phase.${state.phase}`);
      fill(playBtn, 
        icon(state.status === "running" ? "pause" : "play", 16),
        h("span", {}, state.status === "running" ? t("focus.pause") : state.status === "paused" ? t("focus.resume") : t("focus.start")),
      );
      const s = app.settings.focus;
      fill(blockToggle, icon("shield", 14), h("span", {}, s.block ? t("focus.blockOn") : t("focus.blockOff")));
      blockToggle.classList.toggle("on", s.block);
      renderStats();
      clearInterval(timer);
      tick();
      if (state.status === "running") timer = setInterval(tick, 1000);
      else if (ctx.surface === "newtab") document.title = t("app.newTab");
    }

    function renderStats() {
      const goal = app.settings.focus.dailyGoal || 8;
      const today = stats[todayKey()] || { sessions: 0, minutes: 0 };
      clear(goalDots);
      const dots = h("div", { class: "dots" });
      for (let i = 0; i < Math.max(goal, today.sessions); i += 1) dots.appendChild(h("span", { class: i < today.sessions ? "on" : "" }));
      goalDots.append(dots, h("div", { class: "focus-goal-text" }, t("focus.today", { n: today.sessions, m: today.minutes })));

      clear(week);
      const days = [];
      for (let i = 6; i >= 0; i -= 1) {
        const key = dayKeyOffset(-i);
        days.push({ key, minutes: stats[key]?.minutes || 0 });
      }
      const max = Math.max(60, ...days.map((d) => d.minutes));
      const total = days.reduce((sum, d) => sum + d.minutes, 0);
      const bars = h("div", { class: "bars" });
      for (const d of days) {
        const [y, m, dd] = d.key.split("-").map(Number);
        const label = formatDate(new Date(y, m - 1, dd, 12), "gregory", lang(), { weekday: "narrow" });
        bars.appendChild(
          h(
            "div",
            { class: `bar-col ${d.key === todayKey() ? "today" : ""}`, title: `${fmtNumber(d.minutes)} ${t("focus.min")}` },
            h("div", { class: "bar-track" }, h("div", { class: "bar-fill", style: { height: `${Math.round((d.minutes / max) * 100)}%` } })),
            h("span", {}, label),
          ),
        );
      }
      week.append(h("div", { class: "focus-week-head" }, h("span", {}, t("focus.week")), h("strong", {}, t("focus.hours", { n: Math.round((total / 60) * 10) / 10 }))), bars);
    }

    const unsubs = [
      subscribe(KEYS.focusState, (value) => {
        state = Focus.normalizeFocusState(value);
        render();
      }),
      subscribe(KEYS.focusStats, (value) => {
        stats = value || {};
        renderStats();
      }),
      on("settings", render),
    ];

    Promise.all([get(KEYS.focusState, null), get(KEYS.focusStats, {})]).then(([s, st]) => {
      state = Focus.normalizeFocusState(s);
      stats = st || {};
      render();
    });

    return {
      destroy() {
        clearInterval(timer);
        unsubs.forEach((u) => u());
      },
    };
  },
};

