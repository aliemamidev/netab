// Calendar helpers built on Intl so Gregorian, Persian (Jalali / Solar Hijri)
// and Islamic calendars all work without bundling conversion tables.

export const CALENDARS = ["gregory", "persian", "islamic-umalqura"];

function noon(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
}

export function addDays(date, days) {
  const d = noon(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function uiLocale(lang) {
  return lang === "fa" ? "fa-IR" : "en-US";
}

/** Resolve "auto" calendar preferences against the active language. */
export function resolveCalendars(settings, lang) {
  const cal = settings?.calendar || {};
  const primary = cal.primary && cal.primary !== "auto" ? cal.primary : lang === "fa" ? "persian" : "gregory";
  let secondary = cal.secondary && cal.secondary !== "auto" ? cal.secondary : lang === "fa" ? "gregory" : "none";
  if (secondary === primary) secondary = "none";
  return { primary, secondary };
}

export function resolveWeekStart(settings, lang, calendar) {
  const ws = settings?.calendar?.weekStart;
  if (ws !== undefined && ws !== "auto" && ws !== null) return Number(ws);
  if (calendar === "persian" || lang === "fa") return 6; // Saturday
  try {
    const info = new Intl.Locale(navigator.language || "en-US");
    const first = info.getWeekInfo?.().firstDay ?? info.weekInfo?.firstDay;
    if (first) return first % 7;
  } catch {
    /* fall through */
  }
  return 1;
}

/** Numeric year/month/day of `date` in `calendar` (always ASCII digits). */
export function calendarParts(date, calendar) {
  const fmt = new Intl.DateTimeFormat(`en-US-u-ca-${calendar}-nu-latn`, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(String(parts.year || parts.relatedYear || "0").replace(/\D/g, "")),
    month: Number(parts.month),
    day: Number(parts.day),
  };
}

export function formatDate(date, calendar, lang, options = { weekday: "long", year: "numeric", month: "long", day: "numeric" }) {
  const locale = `${uiLocale(lang)}-u-ca-${calendar}`;
  try {
    const text = new Intl.DateTimeFormat(locale, options).format(date);
    return lang === "fa" ? text.replace(/,/g, "،") : text;
  } catch {
    return date.toDateString();
  }
}

export function monthTitle(date, calendar, lang) {
  return formatDate(date, calendar, lang, { year: "numeric", month: "long" });
}

export function resolveHour12(format, lang) {
  if (format === "12") return true;
  if (format === "24") return false;
  if (lang === "fa") return false;
  try {
    return new Intl.DateTimeFormat(navigator.language, { hour: "numeric" }).resolvedOptions().hour12 ?? false;
  } catch {
    return false;
  }
}

export function formatTime(date, { lang = "en", hour12 = false, seconds = false, timeZone } = {}) {
  const opts = { hour: "2-digit", minute: "2-digit", hour12 };
  if (seconds) opts.second = "2-digit";
  if (timeZone) opts.timeZone = timeZone;
  try {
    return new Intl.DateTimeFormat(uiLocale(lang), opts).format(date);
  } catch {
    return date.toLocaleTimeString();
  }
}

/** Split a time string into [main, dayPeriod] so the AM/PM marker can be styled. */
export function timeParts(date, { lang = "en", hour12 = false, seconds = false } = {}) {
  const opts = { hour: hour12 ? "numeric" : "2-digit", minute: "2-digit", hour12 };
  if (seconds) opts.second = "2-digit";
  const parts = new Intl.DateTimeFormat(uiLocale(lang), opts).formatToParts(date);
  const period = parts.find((p) => p.type === "dayPeriod")?.value || "";
  const main = parts
    .filter((p) => p.type !== "dayPeriod")
    .map((p) => p.value)
    .join("")
    .trim();
  return { main, period };
}

export function greetingKey(date = new Date()) {
  const h = date.getHours();
  if (h >= 5 && h < 12) return "greet.morning";
  if (h >= 12 && h < 17) return "greet.afternoon";
  if (h >= 17 && h < 22) return "greet.evening";
  return "greet.night";
}

/**
 * Build a month grid for any calendar.
 * `anchor` is any date inside the month to show.
 */
export function monthGrid(anchor, calendar, weekStart = 1, today = new Date()) {
  const a = noon(anchor);
  const { day } = calendarParts(a, calendar);
  const first = addDays(a, -(day - 1));
  const firstParts = calendarParts(first, calendar);

  let length = 28;
  while (length < 32 && calendarParts(addDays(first, length), calendar).month === firstParts.month) length += 1;

  const lead = (first.getDay() - weekStart + 7) % 7;
  const cells = [];
  const start = addDays(first, -lead);
  const total = Math.ceil((lead + length) / 7) * 7;
  for (let i = 0; i < total; i += 1) {
    const date = addDays(start, i);
    const parts = calendarParts(date, calendar);
    cells.push({
      date,
      day: parts.day,
      inMonth: i >= lead && i < lead + length,
      isToday: sameDay(date, today),
      weekend: isWeekend(date, calendar),
    });
  }
  return { first, length, cells, year: firstParts.year, month: firstParts.month };
}

export function isWeekend(date, calendar) {
  const d = date.getDay();
  if (calendar === "persian") return d === 5; // Friday
  if (calendar === "islamic-umalqura") return d === 5 || d === 6;
  return d === 0 || d === 6;
}

export function shiftMonth(anchor, calendar, delta) {
  // Jump to the middle of the month then move ~30 days; robust for every calendar.
  const { day } = calendarParts(anchor, calendar);
  const mid = addDays(anchor, 15 - day);
  return addDays(mid, delta * 30);
}

export function weekdayNames(lang, weekStart = 1, style = "short") {
  const base = new Date(2024, 0, 7, 12); // a Sunday
  const fmt = new Intl.DateTimeFormat(uiLocale(lang), { weekday: style });
  const names = [];
  for (let i = 0; i < 7; i += 1) names.push(fmt.format(addDays(base, (weekStart + i) % 7)));
  return names;
}

export function formatDayNumber(n, lang) {
  return new Intl.NumberFormat(uiLocale(lang), { useGrouping: false }).format(n);
}

export function relativeTime(dateLike, lang) {
  const then = new Date(dateLike).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = (then - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(uiLocale(lang), { numeric: "auto" });
  if (abs < 45) return rtf.format(Math.round(diff), "second");
  if (abs < 2700) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 64800) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 518400) return rtf.format(Math.round(diff / 86400), "day");
  if (abs < 2419200) return rtf.format(Math.round(diff / 604800), "week");
  if (abs < 29030400) return rtf.format(Math.round(diff / 2592000), "month");
  return rtf.format(Math.round(diff / 31536000), "year");
}

export function timeZoneOffsetLabel(timeZone, date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" }).formatToParts(date);
    return parts.find((p) => p.type === "timeZoneName")?.value || "";
  } catch {
    return "";
  }
}

export function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

export function listTimeZones() {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["UTC", "Europe/London", "America/New_York", "Asia/Tehran", "Asia/Tokyo"];
  }
}
