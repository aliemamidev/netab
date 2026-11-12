// Hero clock, greeting and multi-calendar date line.

import { h, fill } from "../lib/utils.js";
import { t, lang } from "../lib/i18n.js";
import { app, on, updateSettings } from "./app.js";
import { timeParts, formatDate, greetingKey, resolveCalendars, resolveHour12 } from "../lib/dates.js";

let timer = null;

function render() {
  const s = app.settings;
  const now = new Date();
  const clockEl = document.getElementById("clock");
  const greetEl = document.getElementById("greeting");
  const dateEl = document.getElementById("dateLine");

  clockEl.classList.toggle("hidden", !s.clock.show);
  const { main, period } = timeParts(now, { lang: lang(), hour12: resolveHour12(s.clock.format, lang()), seconds: s.clock.seconds });
  clockEl.querySelector(".clock-main").textContent = main;
  clockEl.querySelector(".clock-period").textContent = period;

  greetEl.classList.toggle("hidden", !s.clock.greeting);
  const name = s.name?.trim();
  greetEl.textContent = name ? t(`${greetingKey(now)}.name`, { name }) : t(greetingKey(now));

  dateEl.classList.toggle("hidden", !s.clock.date);
  const { primary, secondary } = resolveCalendars(s, lang());
  fill(dateEl, h("span", { class: "primary" }, formatDate(now, primary, lang())));
  if (secondary !== "none") {
    dateEl.append(
      h("span", { class: "sep" }, "•"),
      h("span", { class: "secondary" }, formatDate(now, secondary, lang(), { year: "numeric", month: "long", day: "numeric" })),
    );
  }
}

function schedule() {
  clearTimeout(timer);
  const s = app.settings;
  const now = Date.now();
  const delay = s.clock.seconds ? 1000 - (now % 1000) + 5 : 60000 - (now % 60000) + 5;
  timer = setTimeout(() => {
    render();
    schedule();
  }, delay);
}

export function initClock() {
  render();
  schedule();
  document.getElementById("clock").addEventListener("click", () => updateSettings({ clock: { seconds: !app.settings.clock.seconds } }));
  on("settings", () => {
    render();
    schedule();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      render();
      schedule();
    }
  });
}
