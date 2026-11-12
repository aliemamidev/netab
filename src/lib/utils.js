// Shared helpers used by every NeTab surface (new tab, popup, side panel,
// service worker). Nothing here touches the DOM unless a document exists.

export const isExtension = Boolean(globalThis.chrome?.runtime?.id);

export function extUrl(path) {
  if (!path) return "";
  if (/^(https?:|data:|blob:|chrome-extension:)/i.test(path)) return path;
  const clean = String(path).replace(/^\/+/, "");
  if (isExtension) return chrome.runtime.getURL(clean);
  // Plain-file preview: pages live in src/<surface>/, assets at the repo root.
  return new URL(`../../${clean}`, globalThis.location?.href || "http://localhost/").href;
}

export function uid(prefix = "id") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function asBool(value, fallback = true) {
  return typeof value === "boolean" ? value : fallback;
}

export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Deep merge `patch` into a copy of `base`. Arrays are replaced, not merged. */
export function deepMerge(base, patch) {
  if (!isPlainObject(base)) return clone(patch);
  const out = clone(base);
  if (!isPlainObject(patch)) return out;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    out[key] = isPlainObject(value) && isPlainObject(out[key]) ? deepMerge(out[key], value) : clone(value);
  }
  return out;
}

export function debounce(fn, wait = 250) {
  let timer = null;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  wrapped.flush = (...args) => {
    clearTimeout(timer);
    fn(...args);
  };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}

export function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export function basename(path = "") {
  return String(path).split(/[\\/]/).filter(Boolean).pop() || "Untitled";
}

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** Convert Persian / Arabic-Indic digits (and separators) to ASCII. */
export function toLatinDigits(text) {
  return String(text ?? "")
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/٫/g, ".")
    .replace(/٬/g, ",");
}

export function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function dayKeyOffset(days, from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days, 12);
  return todayKey(d);
}

const TLD_HINT = /\.(com|org|net|io|dev|app|ir|co|ai|edu|gov|me|info|xyz|tv|gg|uk|de|fr|ru|tr|ae|ca|us|eu|so|sh|to|ly|page|site|cloud|tech|blog|news|store|shop)(\/|:|\?|#|$)/i;

/** Decide whether free text typed in the search box is meant as an address. */
export function looksLikeUrl(input) {
  const text = String(input || "").trim();
  if (!text || /\s/.test(text)) return false;
  if (/^(https?|ftp|file|chrome|edge|about|chrome-extension):/i.test(text)) return true;
  if (/^localhost(:\d+)?(\/|$)/i.test(text)) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(text)) return true;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/i.test(text) && TLD_HINT.test(text)) return true;
  return /^[\w-]+(\.[\w-]+)+\/\S*$/.test(text);
}

export function normalizeUrl(input) {
  const text = String(input || "").trim();
  if (!text) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/^localhost:/i.test(text)) return text;
  if (/^(localhost|\d{1,3}(\.\d{1,3}){3})/i.test(text)) return `http://${text}`;
  return `https://${text}`;
}

export function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Does `host` equal or sit under one of the domains in `list`? */
export function hostMatches(host, list = []) {
  const h = String(host || "").toLowerCase().replace(/^www\./, "");
  if (!h) return false;
  return list.some((raw) => {
    const domain = String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, "");
    return domain && (h === domain || h.endsWith(`.${domain}`));
  });
}

export function hashHue(text) {
  let hash = 0;
  for (const ch of String(text)) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  return hash % 360;
}

export function letterIconDataUrl(text, size = 64) {
  const host = String(text || "?");
  const letter = (host.replace(/^www\./, "").match(/[\p{L}\p{N}]/u)?.[0] || "?").toUpperCase();
  const hue = hashHue(host);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 70% 58%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360} 70% 42%)"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#g)"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui,Segoe UI,Arial" font-size="30" font-weight="700" fill="white">${letter.replace(/[<&>"]/g, "")}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function faviconUrl(pageUrl, size = 64) {
  if (!isExtension || !isHttpUrl(pageUrl)) return "";
  const url = new URL(chrome.runtime.getURL("/_favicon/"));
  url.searchParams.set("pageUrl", pageUrl);
  url.searchParams.set("size", String(size));
  return url.toString();
}

// Chrome's favicon endpoint answers with a generic globe for sites it has never
// seen. Fingerprint that default image once so we can swap in a letter tile.
const defaultFaviconSigs = new Map();

function imageSignature(img) {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, 16, 16);
  const data = ctx.getImageData(0, 0, 16, 16).data;
  let hash = 0;
  for (let i = 0; i < data.length; i += 4) hash = (hash * 31 + data[i] + data[i + 1] * 3 + data[i + 2] * 7 + data[i + 3] * 11) >>> 0;
  return hash;
}

function defaultFaviconSignature(size) {
  if (!defaultFaviconSigs.has(size)) {
    defaultFaviconSigs.set(
      size,
      new Promise((resolve) => {
        const probe = new Image();
        probe.onload = () => {
          try {
            resolve(imageSignature(probe));
          } catch {
            resolve(null);
          }
        };
        probe.onerror = () => resolve(null);
        probe.src = faviconUrl("https://netab-default-favicon.invalid/", size);
      }),
    );
  }
  return defaultFaviconSigs.get(size);
}

/** Set an <img> to the Chrome favicon for `pageUrl`, falling back to a letter tile. */
export function setFavicon(img, pageUrl, size = 64) {
  const fallback = letterIconDataUrl(hostname(pageUrl) || pageUrl, size);
  const primary = faviconUrl(pageUrl, size);
  if (!primary) {
    img.src = fallback;
    return;
  }
  img.onerror = () => {
    img.onerror = null;
    img.onload = null;
    img.src = fallback;
  };
  img.onload = async () => {
    img.onload = null;
    const def = await defaultFaviconSignature(size);
    if (def === null) return;
    try {
      if (imageSignature(img) === def) img.src = fallback;
    } catch {
      /* ignore */
    }
  };
  img.src = primary;
}

/** Convert a data: URL to a Blob without fetch() (data: is outside our CSP connect-src). */
export function dataUrlToBlob(dataUrl) {
  const [head, body] = String(dataUrl).split(",", 2);
  const mime = /data:([^;,]+)/.exec(head)?.[1] || "application/octet-stream";
  if (/;base64/i.test(head)) {
    const bin = atob(body);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(body)], { type: mime });
}

export function downloadFile(filename, data, type = "application/json") {
  const blob = data instanceof Blob ? data : new Blob([typeof data === "string" ? data : JSON.stringify(data, null, 2)], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

/**
 * Tiny element factory: h("button", { class: "x", onclick }, "Label", child)
 * Strings become text nodes, so user content is never parsed as HTML.
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") el.className = value;
    else if (key === "text") el.textContent = value;
    else if (key === "dataset") Object.assign(el.dataset, value);
    else if (key === "style" && typeof value === "object") Object.assign(el.style, value);
    else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2), value);
    else if (key === "html") throw new Error("h(): raw html is not allowed");
    else if (value === true) el.setAttribute(key, "");
    else if (key in el && typeof value !== "string") el[key] = value;
    else el.setAttribute(key, String(value));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

/** Replace all children of `el` (null/false children are skipped, unlike Element.append). */
export function fill(el, ...children) {
  clear(el);
  append(el, children);
  return el;
}

/** Parse an SVG string that NeTab itself authored (icons) into a node. */
export function svgNode(markup) {
  const doc = new DOMParser().parseFromString(markup, "image/svg+xml");
  return document.importNode(doc.documentElement, true);
}

export function formatBytes(bytes, locale) {
  const n = Number(bytes) || 0;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: v < 10 && i ? 1 : 0 }).format(v)} ${units[i]}`;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function moveItem(list, from, to) {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item);
  return list;
}
