// Search engines and "!bang" shortcuts.

export const BUILTIN_ENGINES = [
  { id: "default", name: "Browser default", bang: "", url: "" },
  { id: "google", name: "Google", bang: "g", url: "https://www.google.com/search?q=%s" },
  { id: "bing", name: "Bing", bang: "b", url: "https://www.bing.com/search?q=%s" },
  { id: "duckduckgo", name: "DuckDuckGo", bang: "d", url: "https://duckduckgo.com/?q=%s" },
  { id: "brave", name: "Brave Search", bang: "br", url: "https://search.brave.com/search?q=%s" },
  { id: "chatgpt", name: "ChatGPT", bang: "gpt", url: "https://chatgpt.com/?q=%s" },
  { id: "claude", name: "Claude", bang: "cl", url: "https://claude.ai/new?q=%s" },
  { id: "perplexity", name: "Perplexity", bang: "p", url: "https://www.perplexity.ai/search?q=%s" },
  { id: "youtube", name: "YouTube", bang: "yt", url: "https://www.youtube.com/results?search_query=%s" },
  { id: "github", name: "GitHub", bang: "gh", url: "https://github.com/search?q=%s&type=repositories" },
  { id: "stackoverflow", name: "Stack Overflow", bang: "so", url: "https://stackoverflow.com/search?q=%s" },
  { id: "mdn", name: "MDN", bang: "mdn", url: "https://developer.mozilla.org/search?q=%s" },
  { id: "npm", name: "npm", bang: "npm", url: "https://www.npmjs.com/search?q=%s" },
  { id: "wikipedia", name: "Wikipedia", bang: "w", url: "https://en.wikipedia.org/wiki/Special:Search?search=%s" },
  { id: "wikipedia-fa", name: "ویکی‌پدیا", bang: "wfa", url: "https://fa.wikipedia.org/wiki/Special:Search?search=%s" },
  { id: "translate-en", name: "Translate → English", bang: "tr", url: "https://translate.google.com/?sl=auto&tl=en&text=%s&op=translate" },
  { id: "translate-fa", name: "Translate → فارسی", bang: "trfa", url: "https://translate.google.com/?sl=auto&tl=fa&text=%s&op=translate" },
  { id: "maps", name: "Google Maps", bang: "m", url: "https://www.google.com/maps/search/%s" },
  { id: "images", name: "Google Images", bang: "i", url: "https://www.google.com/search?tbm=isch&q=%s" },
  { id: "scholar", name: "Google Scholar", bang: "sc", url: "https://scholar.google.com/scholar?q=%s" },
  { id: "reddit", name: "Reddit", bang: "r", url: "https://www.reddit.com/search/?q=%s" },
  { id: "x", name: "X", bang: "x", url: "https://x.com/search?q=%s" },
  { id: "amazon", name: "Amazon", bang: "a", url: "https://www.amazon.com/s?k=%s" },
  { id: "digikala", name: "Digikala", bang: "dk", url: "https://www.digikala.com/search/?q=%s" },
  { id: "aparat", name: "Aparat", bang: "ap", url: "https://www.aparat.com/search/%s" },
];

export function allEngines(settings) {
  const custom = (settings?.search?.custom || [])
    .filter((e) => e && e.name && /%s/.test(e.url || "") && /^https?:\/\//i.test(e.url))
    .map((e) => ({ id: e.id, name: e.name, bang: String(e.bang || "").replace(/^!/, "").toLowerCase(), url: e.url, custom: true }));
  return [...BUILTIN_ENGINES, ...custom];
}

export function engineById(settings, id) {
  return allEngines(settings).find((e) => e.id === id) || BUILTIN_ENGINES[0];
}

/** Detect "!yt cats", "cats !yt" or "yt: cats". Returns { engine, query } or null. */
export function parseBang(text, settings) {
  const engines = allEngines(settings).filter((e) => e.bang);
  const input = String(text || "").trim();
  let m = /^!(\S+)\s*(.*)$/s.exec(input) || /^(.*?)\s+!(\S+)$/s.exec(input);
  if (m) {
    const [bang, query] = input.startsWith("!") ? [m[1], m[2]] : [m[2], m[1]];
    const engine = engines.find((e) => e.bang === bang.toLowerCase());
    if (engine) return { engine, query: query.trim() };
  }
  m = /^([a-z]{1,6}):\s+(.+)$/i.exec(input);
  if (m) {
    const engine = engines.find((e) => e.bang === m[1].toLowerCase());
    if (engine) return { engine, query: m[2].trim() };
  }
  return null;
}

export function engineUrl(engine, query) {
  return engine.url.replace(/%s/g, encodeURIComponent(query));
}

export function engineHome(engine) {
  try {
    return new URL(engine.url.replace(/%s/g, "")).origin;
  } catch {
    return "";
  }
}
