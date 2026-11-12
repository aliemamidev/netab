// Weather widget (Open-Meteo). Opt-in: asks for host access before any request.

import { h, clear, debounce, fill } from "../../lib/utils.js";
import { icon } from "../../lib/icons.js";
import { t, fmtNumber, lang } from "../../lib/i18n.js";
import { hasFeature, requestFeature, searchCity, getWeather, weatherInfo } from "../../lib/net.js";
import { app, on, emit, updateSettings } from "../app.js";
import { emptyState, segmented, sparkline } from "../../lib/ui.js";
import { formatDate, relativeTime, uiLocale } from "../../lib/dates.js";

export default {
  id: "weather",
  icon: "cloud",
  size: "md",
  title: () => t("w.weather"),
  desc: () => t("w.weather.desc"),

  mount(body, ctx) {
    let destroyed = false;
    let refreshTimer = null;

    ctx.setActions?.([
      h("button", { class: "icon-btn sm", type: "button", title: t("weather.changeCity"), onclick: () => renderSearch() }, icon("pin", 16)),
      h("button", { class: "icon-btn sm", type: "button", title: t("common.refresh"), onclick: () => load(true) }, icon("refresh", 16)),
    ]);

    async function start() {
      if (!(await hasFeature("weather"))) return renderGate();
      if (!app.settings.weather.city) return renderSearch();
      load(false);
    }

    function renderGate() {
      clear(body).appendChild(
        h(
          "div",
          { class: "gate" },
          h("div", { class: "gate-emoji" }, "⛅"),
          h("p", {}, t("weather.gate")),
          h(
            "button",
            {
              class: "btn btn-primary btn-sm",
              type: "button",
              onclick: async () => {
                if (await requestFeature("weather")) start();
              },
            },
            t("weather.enable"),
          ),
          h("small", { class: "gate-note" }, t("weather.privacy")),
        ),
      );
    }

    function renderSearch() {
      const results = h("div", { class: "city-results" });
      const input = h("input", { class: "input", type: "search", placeholder: t("weather.searchCity"), autofocus: true });
      const run = debounce(async () => {
        const q = input.value.trim();
        if (q.length < 2) return clear(results);
        clear(results).appendChild(h("div", { class: "muted small" }, t("common.loading")));
        try {
          const cities = await searchCity(q, lang());
          clear(results);
          if (!cities.length) results.appendChild(h("div", { class: "muted small" }, t("common.noResults")));
          for (const c of cities) {
            results.appendChild(
              h(
                "button",
                {
                  class: "city-option",
                  type: "button",
                  onclick: async () => {
                    await updateSettings({ weather: { city: c } });
                    load(true);
                  },
                },
                h("strong", {}, c.name),
                h("span", {}, [c.admin, c.country].filter(Boolean).join(", ")),
              ),
            );
          }
        } catch (error) {
          clear(results).appendChild(h("div", { class: "error small" }, t("common.networkError")));
          console.warn(error);
        }
      }, 350);
      input.addEventListener("input", run);
      const cancel = app.settings.weather.city
        ? h("button", { class: "btn btn-sm btn-ghost", type: "button", onclick: () => load(false) }, t("common.cancel"))
        : null;
      fill(body, h("div", { class: "city-search" }, h("div", { class: "row" }, input, cancel), results));
      setTimeout(() => input.focus(), 30);
    }

    async function load(force) {
      const city = app.settings.weather.city;
      if (!city) return renderSearch();
      if (!body.querySelector(".wx")) clear(body).appendChild(h("div", { class: "skeleton wx-skeleton" }));
      try {
        const res = await getWeather(city, app.settings.weather.units, { force });
        if (destroyed) return;
        render(res.data, res.at, res.stale);
        emit("weather", { data: res.data, city });
      } catch (error) {
        console.warn(error);
        clear(body).appendChild(emptyState("cloud", t("common.networkError"), { label: t("common.retry"), onClick: () => load(true) }));
      }
    }

    function render(data, at, stale) {
      const units = app.settings.weather.units;
      const cur = data.current || {};
      const info = weatherInfo(cur.weather_code, cur.is_day);
      const city = app.settings.weather.city;
      const deg = (v) => `${fmtNumber(Math.round(v))}°`;

      const daily = data.daily || {};
      const days = (daily.time || []).slice(0, 6).map((d, i) => ({
        date: new Date(`${d}T12:00:00`),
        code: daily.weather_code[i],
        max: daily.temperature_2m_max[i],
        min: daily.temperature_2m_min[i],
        rain: daily.precipitation_probability_max?.[i],
      }));

      const hourly = data.hourly || {};
      const nowIdx = Math.max(0, (hourly.time || []).findIndex((x) => new Date(x) >= new Date(Date.now() - 3600_000)));
      const temps = (hourly.temperature_2m || []).slice(nowIdx, nowIdx + 24);
      const hours = (hourly.time || []).slice(nowIdx, nowIdx + 24);

      const unitSeg = segmented(
        [
          { value: "c", label: "°C" },
          { value: "f", label: "°F" },
        ],
        units,
        async (v) => {
          await updateSettings({ weather: { units: v } });
          load(false);
        },
        { className: "small" },
      );

      const hourStrip = h(
        "div",
        { class: "wx-hours" },
        hours
          .filter((_, i) => i % 3 === 0)
          .slice(0, 8)
          .map((time, i) => {
            const idx = i * 3;
            return h(
              "div",
              { class: "wx-hour" },
              h("span", { class: "muted" }, new Intl.DateTimeFormat(uiLocale(lang()), { hour: "numeric" }).format(new Date(time))),
              h("span", { class: "wx-hour-emoji" }, weatherInfo(hourly.weather_code?.[nowIdx + idx], 1).emoji),
              h("strong", {}, deg(temps[idx])),
            );
          }),
      );

      fill(body, 
        h(
          "div",
          { class: "wx" },
          h(
            "div",
            { class: "wx-now" },
            h("div", { class: "wx-emoji" }, info.emoji),
            h(
              "div",
              { class: "wx-temp-box" },
              h("div", { class: "wx-temp" }, deg(cur.temperature_2m)),
              h("div", { class: "wx-cond" }, t(info.key)),
            ),
            h(
              "div",
              { class: "wx-meta" },
              h("div", { class: "wx-city" }, icon("pin", 13), h("span", {}, city.name)),
              h("div", {}, t("weather.feels", { v: deg(cur.apparent_temperature) })),
              h("div", {}, t("weather.humidity", { v: fmtNumber(cur.relative_humidity_2m) })),
              h("div", {}, t("weather.wind", { v: fmtNumber(Math.round(cur.wind_speed_10m)), u: units === "f" ? "mph" : t("weather.kmh") })),
            ),
          ),
          temps.length > 2 ? h("div", { class: "wx-spark" }, sparkline(temps, { width: 300, height: 34, stroke: "var(--accent)" })) : null,
          hourStrip,
          h(
            "div",
            { class: "wx-days" },
            days.map((d, i) =>
              h(
                "div",
                { class: "wx-day" },
                h("span", { class: "muted" }, i === 0 ? t("todo.today") : formatDate(d.date, "gregory", lang(), { weekday: "short" })),
                h("span", { class: "wx-day-emoji", title: t(weatherInfo(d.code, 1).key) }, weatherInfo(d.code, 1).emoji),
                h("strong", {}, deg(d.max)),
                h("span", { class: "muted" }, deg(d.min)),
                d.rain ? h("span", { class: "wx-rain" }, `💧${fmtNumber(d.rain)}%`) : h("span", { class: "wx-rain" }, ""),
              ),
            ),
          ),
          h("div", { class: "widget-footer" }, h("span", {}, `${stale ? "⚠ " : ""}${t("common.updated", { when: relativeTime(at, lang()) })}`), unitSeg),
        ),
      );
    }

    const off = on("settings", ({ settings, prev }) => {
      if (settings.weather.city?.lat !== prev?.weather?.city?.lat) start();
    });
    start();
    refreshTimer = setInterval(() => {
      if (document.visibilityState === "visible") load(false);
    }, 15 * 60_000);

    return {
      destroy() {
        destroyed = true;
        clearInterval(refreshTimer);
        off();
      },
    };
  },
};
