// "Main focus for today" + quote of the day.

import { h, clear, todayKey, fill } from "../../lib/utils.js";
import { KEYS, get, set, subscribe } from "../../lib/storage.js";
import { icon } from "../../lib/icons.js";
import { t, lang } from "../../lib/i18n.js";
import { quoteOfDay, randomQuote } from "../../lib/quotes.js";
import { on } from "../app.js";

export default {
  id: "daily",
  icon: "target",
  size: "sm",
  title: () => t("w.daily"),
  desc: () => t("w.daily.desc"),

  mount(body) {
    let daily = null;
    let quote = quoteOfDay(lang());
    const focusBox = h("div", { class: "daily-focus" });
    const quoteBox = h("figure", { class: "daily-quote" });
    body.append(focusBox, quoteBox);

    function renderFocus() {
      clear(focusBox);
      const today = daily && daily.date === todayKey() ? daily : null;
      if (!today?.text) {
        const input = h("input", {
          class: "input daily-input",
          type: "text",
          maxlength: 140,
          placeholder: t("daily.placeholder"),
          onkeydown: async (e) => {
            if (e.key === "Enter" && input.value.trim()) await set(KEYS.daily, { date: todayKey(), text: input.value.trim(), done: false });
          },
        });
        focusBox.append(h("label", { class: "daily-label" }, t("daily.question")), input);
        return;
      }
      fill(
        focusBox,
        h("div", { class: "daily-label" }, t("daily.today")),
        h(
          "div",
          { class: `daily-item ${today.done ? "done" : ""}` },
          h("input", {
            type: "checkbox",
            checked: today.done,
            "aria-label": today.text,
            onchange: (e) => set(KEYS.daily, { ...today, done: e.target.checked }),
          }),
          h("span", { class: "daily-text" }, today.text),
          h("button", { class: "icon-btn sm", type: "button", title: t("common.clear"), onclick: () => set(KEYS.daily, null) }, icon("x", 14)),
        ),
        today.done ? h("div", { class: "daily-cheer" }, t("daily.cheer")) : null,
      );
    }

    function renderQuote() {
      fill(quoteBox, 
        h("blockquote", {}, quote.text),
        h(
          "figcaption",
          {},
          h("span", {}, `— ${quote.author}`),
          h(
            "button",
            {
              class: "icon-btn sm",
              type: "button",
              title: t("daily.another"),
              onclick: () => {
                quote = randomQuote(lang(), quote.text);
                renderQuote();
              },
            },
            icon("refresh", 14),
          ),
        ),
      );
    }

    const unsubs = [
      subscribe(KEYS.daily, (v) => {
        daily = v;
        renderFocus();
      }),
      on("settings", ({ langChanged }) => {
        if (!langChanged) return;
        quote = quoteOfDay(lang());
        renderQuote();
        renderFocus();
      }),
    ];
    get(KEYS.daily, null).then((v) => {
      daily = v;
      renderFocus();
    });
    renderQuote();
    return { destroy: () => unsubs.forEach((u) => u()) };
  },
};
