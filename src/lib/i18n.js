// Runtime i18n with live language switching (English / فارسی).

import { STRINGS } from "./strings.js";

let current = "en";

export const LANGS = [
  { id: "auto", labelKey: "lang.auto" },
  { id: "en", label: "English" },
  { id: "fa", label: "فارسی" },
];

export function resolveLang(pref) {
  if (pref === "en" || pref === "fa") return pref;
  const nav = (globalThis.navigator?.language || "en").toLowerCase();
  return nav.startsWith("fa") ? "fa" : "en";
}

export function setLang(pref) {
  current = resolveLang(pref);
  if (globalThis.document?.documentElement) {
    document.documentElement.lang = current;
    document.documentElement.dir = current === "fa" ? "rtl" : "ltr";
  }
  return current;
}

export function lang() {
  return current;
}

export function isRtl() {
  return current === "fa";
}

export function locale() {
  return current === "fa" ? "fa-IR" : "en-US";
}

export function t(key, vars) {
  const table = STRINGS[current] || STRINGS.en;
  // Optional singular form: "<key>.one" is used when n === 1 (English needs it, Persian doesn't).
  const singular = vars && vars.n === 1 ? table[`${key}.one`] : undefined;
  let text = singular ?? table[key] ?? STRINGS.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, typeof v === "number" ? fmtNumber(v) : String(v));
    }
  }
  return text;
}

/** Show ASCII digits as Persian digits when the UI is in Persian. */
export function digits(text) {
  const str = String(text ?? "");
  return current === "fa" ? str.replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]) : str;
}

export function fmtNumber(n, options = {}) {
  return new Intl.NumberFormat(locale(), options).format(n);
}

export function fmtPercent(n, digits = 2) {
  return new Intl.NumberFormat(locale(), { style: "percent", maximumFractionDigits: digits, minimumFractionDigits: digits, signDisplay: "exceptZero" }).format(n / 100);
}

/** Translate static markup: data-i18n, data-i18n-placeholder, data-i18n-title, data-i18n-aria. */
export function applyI18n(root = document) {
  for (const el of root.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll("[data-i18n-placeholder]")) el.placeholder = t(el.dataset.i18nPlaceholder);
  for (const el of root.querySelectorAll("[data-i18n-title]")) {
    el.title = t(el.dataset.i18nTitle);
    if (!el.hasAttribute("aria-label")) el.setAttribute("aria-label", el.title);
  }
  for (const el of root.querySelectorAll("[data-i18n-aria]")) el.setAttribute("aria-label", t(el.dataset.i18nAria));
}
