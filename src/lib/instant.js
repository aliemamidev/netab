// Instant answers for the search box: UUIDs, passwords, world time,
// Unix timestamps, colour conversions and Base64. All offline.

import { toLatinDigits } from "./utils.js";

const TZ_ALIASES = {
  tehran: "Asia/Tehran",
  "تهران": "Asia/Tehran",
  "ایران": "Asia/Tehran",
  iran: "Asia/Tehran",
  mashhad: "Asia/Tehran",
  "مشهد": "Asia/Tehran",
  isfahan: "Asia/Tehran",
  "اصفهان": "Asia/Tehran",
  shiraz: "Asia/Tehran",
  "شیراز": "Asia/Tehran",
  tabriz: "Asia/Tehran",
  "تبریز": "Asia/Tehran",
  "san francisco": "America/Los_Angeles",
  "silicon valley": "America/Los_Angeles",
  seattle: "America/Los_Angeles",
  "los angeles": "America/Los_Angeles",
  "new york": "America/New_York",
  nyc: "America/New_York",
  "نیویورک": "America/New_York",
  washington: "America/New_York",
  boston: "America/New_York",
  miami: "America/New_York",
  texas: "America/Chicago",
  austin: "America/Chicago",
  dallas: "America/Chicago",
  beijing: "Asia/Shanghai",
  china: "Asia/Shanghai",
  "پکن": "Asia/Shanghai",
  delhi: "Asia/Kolkata",
  "new delhi": "Asia/Kolkata",
  mumbai: "Asia/Kolkata",
  bangalore: "Asia/Kolkata",
  india: "Asia/Kolkata",
  london: "Europe/London",
  "لندن": "Europe/London",
  uk: "Europe/London",
  paris: "Europe/Paris",
  "پاریس": "Europe/Paris",
  berlin: "Europe/Berlin",
  "برلین": "Europe/Berlin",
  germany: "Europe/Berlin",
  dubai: "Asia/Dubai",
  "دبی": "Asia/Dubai",
  uae: "Asia/Dubai",
  istanbul: "Europe/Istanbul",
  "استانبول": "Europe/Istanbul",
  turkey: "Europe/Istanbul",
  tokyo: "Asia/Tokyo",
  "توکیو": "Asia/Tokyo",
  japan: "Asia/Tokyo",
  sydney: "Australia/Sydney",
  toronto: "America/Toronto",
  vancouver: "America/Vancouver",
  moscow: "Europe/Moscow",
  "مسکو": "Europe/Moscow",
  kabul: "Asia/Kabul",
  "کابل": "Asia/Kabul",
  baghdad: "Asia/Baghdad",
  "بغداد": "Asia/Baghdad",
  riyadh: "Asia/Riyadh",
  doha: "Asia/Qatar",
  utc: "UTC",
  gmt: "UTC",
};

function zones() {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return Object.values(TZ_ALIASES);
  }
}

const titleCase = (text) => text.replace(/(^|\s)([a-z])/g, (_, sp, c) => sp + c.toUpperCase());

export function findTimeZone(place) {
  const q = String(place || "").trim().toLowerCase();
  if (!q) return null;
  if (TZ_ALIASES[q]) return { tz: TZ_ALIASES[q], label: q.length <= 3 ? q.toUpperCase() : titleCase(q) };
  for (const tz of zones()) {
    const city = tz.split("/").pop().replace(/_/g, " ").toLowerCase();
    if (city === q || tz.toLowerCase() === q) return { tz, label: tz.split("/").pop().replace(/_/g, " ") };
  }
  return null;
}

export function randomPassword(length = 20, random = (n) => crypto.getRandomValues(new Uint32Array(n))) {
  const len = Math.min(128, Math.max(6, Math.round(length)));
  const sets = ["abcdefghijkmnopqrstuvwxyz", "ABCDEFGHJKLMNPQRSTUVWXYZ", "23456789", "!@#$%^&*-_=+?"];
  const all = sets.join("");
  const rnd = random(len + sets.length);
  const chars = sets.map((set, i) => set[rnd[i] % set.length]);
  for (let i = sets.length; i < len; i += 1) chars.push(all[rnd[i] % all.length]);
  // Fisher–Yates shuffle so the guaranteed characters aren't always first.
  const order = random(len);
  for (let i = len - 1; i > 0; i -= 1) {
    const j = order[i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function hexToRgb(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}

function hslToRgb(h, s, l) {
  const sn = s / 100;
  const ln = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n) => ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

export function parseColor(input) {
  const s = String(input || "").trim().toLowerCase();
  let rgb = null;
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s);
  if (m) rgb = hexToRgb(m[1]);
  m = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/.exec(s);
  if (m) rgb = [m[1], m[2], m[3]].map((v) => Math.min(255, Number(v)));
  m = /^hsla?\(\s*(\d{1,3}(?:\.\d+)?)(?:deg)?[\s,]+(\d{1,3}(?:\.\d+)?)%[\s,]+(\d{1,3}(?:\.\d+)?)%/.exec(s);
  if (m) rgb = hslToRgb(Number(m[1]) % 360, Math.min(100, Number(m[2])), Math.min(100, Number(m[3])));
  if (!rgb) return null;
  const hex = `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  const [h, sat, l] = rgbToHsl(...rgb);
  return { hex, rgb: `rgb(${rgb.join(", ")})`, hsl: `hsl(${h}, ${sat}%, ${l}%)` };
}

function utf8ToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64ToUtf8(text) {
  const bin = atob(text.replace(/\s+/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/**
 * Returns an array of { kind, title, sub, copy, swatch? } answers for `raw`.
 * `t` translates labels; `fmt` = { lang, date(d) , time(d, tz) }.
 */
export function instantAnswers(raw, { t, dateTime, timeIn }) {
  const text = String(raw || "").trim();
  const q = toLatinDigits(text).toLowerCase();
  const out = [];
  if (!q || q.length > 300) return out;

  if (/^(uuid|guid)$/.test(q)) {
    const id = crypto.randomUUID();
    out.push({ kind: "uuid", title: id, sub: t("instant.uuid"), copy: id });
  }

  let m = /^(?:password|pass|pwd|رمز|پسورد)(?:\s+(\d{1,3}))?$/.exec(q);
  if (m) {
    const pwd = randomPassword(m[1] ? Number(m[1]) : 20);
    out.push({ kind: "password", title: pwd, sub: t("instant.password", { n: pwd.length }), copy: pwd });
  }

  m = /^(?:time\s+(?:in\s+)?|ساعت\s+)(.+)$/.exec(q) || /^(.+?)\s+time$/.exec(q);
  if (m) {
    const found = findTimeZone(m[1]);
    if (found) {
      const value = timeIn(new Date(), found.tz);
      out.push({ kind: "time", title: value.time, sub: `${found.label} · ${value.date} · ${value.offset}`, copy: value.time });
    }
  }

  if (/^(now|timestamp|unix|epoch)$/.test(q)) {
    const s = String(Math.floor(Date.now() / 1000));
    out.push({ kind: "timestamp", title: s, sub: t("instant.unixNow"), copy: s });
  }
  m = /^(\d{10}|\d{13})$/.exec(q);
  if (m) {
    const ms = m[1].length === 13 ? Number(m[1]) : Number(m[1]) * 1000;
    const d = new Date(ms);
    // "weak": a bare number may be a phone number, so web search stays the default action.
    if (Number.isFinite(d.getTime())) out.push({ kind: "timestamp", weak: true, title: dateTime(d), sub: `${t("instant.unixToDate")} · ${d.toISOString()}`, copy: d.toISOString() });
  }

  const color = parseColor(q);
  if (color) out.push({ kind: "color", title: color.hex, sub: `${color.rgb} · ${color.hsl}`, copy: color.hex, swatch: color.hex });

  m = /^(base64|b64)\s+(.+)$/s.exec(text);
  if (m) {
    const enc = utf8ToBase64(m[2]);
    out.push({ kind: "base64", title: enc, sub: t("instant.base64Encode"), copy: enc });
  }
  m = /^(base64d|b64d|unbase64)\s+(.+)$/s.exec(text);
  if (m) {
    try {
      const dec = base64ToUtf8(m[2]);
      out.push({ kind: "base64", title: dec, sub: t("instant.base64Decode"), copy: dec });
    } catch {
      /* not base64 */
    }
  }
  return out;
}
