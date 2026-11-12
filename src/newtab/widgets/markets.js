// Markets widget: crypto (incl. PAXG ≈ 1 oz gold) via CoinGecko and fiat FX
// via open.er-api.com. Opt-in host access; cached to stay well within limits.

import { h, clear, fill } from "../../lib/utils.js";
import { icon } from "../../lib/icons.js";
import { t, fmtNumber, fmtPercent, lang } from "../../lib/i18n.js";
import { hasFeature, requestFeature, getCoins, getFx } from "../../lib/net.js";
import { app, on, updateSettings } from "../app.js";
import { emptyState, sparkline, formDialog, segmented } from "../../lib/ui.js";
import { relativeTime } from "../../lib/dates.js";
import { hashHue } from "../../lib/utils.js";

const TAB_KEY = "netab.markets.tab";

function price(v) {
  if (!Number.isFinite(v)) return "—";
  const digits = v >= 1000 ? 0 : v >= 1 ? 2 : 6;
  return `$${fmtNumber(v, { maximumFractionDigits: digits, minimumFractionDigits: v >= 1 && v < 1000 ? 2 : 0 })}`;
}

export default {
  id: "markets",
  icon: "chart",
  size: "md",
  title: () => t("w.markets"),
  desc: () => t("w.markets.desc"),

  mount(body, ctx) {
    let tab = "crypto";
    let destroyed = false;
    try {
      tab = localStorage.getItem(TAB_KEY) || "crypto";
    } catch {
      /* ignore */
    }

    ctx.setActions?.([
      h("button", { class: "icon-btn sm", type: "button", title: t("markets.customize"), onclick: customize }, icon("edit", 16)),
      h("button", { class: "icon-btn sm", type: "button", title: t("common.refresh"), onclick: () => load(true) }, icon("refresh", 16)),
    ]);

    async function customize() {
      const values = await formDialog({
        title: t("markets.customize"),
        fields: [
          { name: "coins", label: t("markets.coins"), value: app.settings.markets.coins.join(", "), hint: t("markets.coinsHint"), wide: true, dir: "ltr" },
          { name: "fiat", label: t("markets.fiat"), value: app.settings.markets.fiat.join(", "), hint: t("markets.fiatHint"), wide: true, dir: "ltr" },
        ],
      });
      if (!values) return;
      const split = (s, upper) =>
        s
          .split(/[\s,]+/)
          .map((x) => (upper ? x.toUpperCase() : x.toLowerCase()))
          .filter(Boolean)
          .slice(0, 12);
      await updateSettings((cur) => {
        cur.markets.coins = split(values.coins, false);
        cur.markets.fiat = split(values.fiat, true);
        return cur;
      });
      load(true);
    }

    async function start() {
      if (!(await hasFeature("markets"))) return renderGate();
      load(false);
    }

    function renderGate() {
      clear(body).appendChild(
        h(
          "div",
          { class: "gate" },
          h("div", { class: "gate-emoji" }, "📈"),
          h("p", {}, t("markets.gate")),
          h(
            "button",
            {
              class: "btn btn-primary btn-sm",
              type: "button",
              onclick: async () => {
                if (await requestFeature("markets")) start();
              },
            },
            t("markets.enable"),
          ),
          h("small", { class: "gate-note" }, t("markets.privacy")),
        ),
      );
    }

    async function load(force) {
      if (!body.querySelector(".mk")) clear(body).appendChild(h("div", { class: "skeleton mk-skeleton" }));
      try {
        const [coins, fx] = await Promise.allSettled([getCoins(app.settings.markets.coins, { force }), getFx({ force })]);
        if (destroyed) return;
        render(coins.status === "fulfilled" ? coins.value : null, fx.status === "fulfilled" ? fx.value : null);
      } catch (error) {
        console.warn(error);
        clear(body).appendChild(emptyState("chart", t("common.networkError"), { label: t("common.retry"), onClick: () => load(true) }));
      }
    }

    function render(coins, fx) {
      const seg = segmented(
        [
          { value: "crypto", label: t("markets.crypto") },
          { value: "fx", label: t("markets.fx") },
        ],
        tab,
        (v) => {
          tab = v;
          try {
            localStorage.setItem(TAB_KEY, v);
          } catch {
            /* ignore */
          }
          render(coins, fx);
        },
        { className: "small" },
      );
      const list = h("div", { class: "mk-list" });
      if (tab === "crypto") {
        if (!coins?.data?.length) list.appendChild(emptyState("chart", coins ? t("markets.noCoins") : t("common.networkError")));
        for (const c of coins?.data || []) {
          const up = (c.change || 0) >= 0;
          list.appendChild(
            h(
              "a",
              { class: "mk-row", href: `https://www.coingecko.com/en/coins/${encodeURIComponent(c.id)}`, target: "_blank", rel: "noopener noreferrer" },
              h("span", { class: "mk-badge", style: { background: `hsl(${hashHue(c.symbol)} 60% 45%)` } }, c.symbol.slice(0, 4)),
              h("span", { class: "mk-name" }, h("strong", {}, c.id === "pax-gold" ? `${c.name} · ${t("markets.goldOz")}` : c.name), h("small", {}, c.symbol)),
              h("span", { class: `mk-spark ${up ? "up" : "down"}` }, sparkline(c.spark || [], { width: 80, height: 26, stroke: "currentColor" })),
              h("span", { class: "mk-price" }, h("strong", {}, price(c.price)), h("small", { class: up ? "up" : "down" }, fmtPercent(c.change || 0))),
            ),
          );
        }
      } else {
        const rates = fx?.data?.rates || {};
        if (!fx) list.appendChild(emptyState("chart", t("common.networkError")));
        for (const code of app.settings.markets.fiat) {
          const rate = rates[code];
          if (!rate) continue;
          list.appendChild(
            h(
              "div",
              { class: "mk-row" },
              h("span", { class: "mk-badge fx" }, code),
              h("span", { class: "mk-name" }, h("strong", {}, currencyName(code)), h("small", {}, `USD → ${code}`)),
              h("span", {}),
              h(
                "span",
                { class: "mk-price" },
                h("strong", {}, fmtNumber(rate, { maximumFractionDigits: rate < 10 ? 4 : 2 })),
                h("small", { class: "muted" }, `1 ${code} = ${fmtNumber(1 / rate, { maximumFractionDigits: 4 })} USD`),
              ),
            ),
          );
        }
      }
      const at = tab === "crypto" ? coins?.at : fx?.at;
      fill(body, 
        h(
          "div",
          { class: "mk" },
          seg,
          list,
          h("div", { class: "widget-footer" }, h("span", {}, at ? t("common.updated", { when: relativeTime(at, lang()) }) : ""), h("span", { class: "muted" }, tab === "crypto" ? "CoinGecko" : "ExchangeRate-API")),
        ),
      );
    }

    function currencyName(code) {
      try {
        return new Intl.DisplayNames([lang() === "fa" ? "fa" : "en"], { type: "currency" }).of(code);
      } catch {
        return code;
      }
    }

    const off = on("settings", ({ langChanged }) => langChanged && start());
    start();
    const timer = setInterval(() => document.visibilityState === "visible" && load(false), 10 * 60_000);
    return {
      destroy() {
        destroyed = true;
        clearInterval(timer);
        off();
      },
    };
  },
};
