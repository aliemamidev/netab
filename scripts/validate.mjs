// Static checks for the Chrome Web Store build: manifest, permissions, CSP,
// required files, public data, and source safety rules.

import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const requiredFiles = [
  "manifest.json",
  "_locales/en/messages.json",
  "_locales/fa/messages.json",
  "assets/icons/icon-16.png",
  "assets/icons/icon-32.png",
  "assets/icons/icon-48.png",
  "assets/icons/icon-128.png",
  "assets/fonts/Vazirmatn-Variable.woff2",
  "assets/fonts/OFL.txt",
  "src/newtab/newtab.html",
  "src/newtab/main.js",
  "src/popup/popup.html",
  "src/sidepanel/sidepanel.html",
  "src/blocked/blocked.html",
  "src/offscreen/offscreen.html",
  "src/options/options.html",
  "src/shot/shot.html",
  "src/background/service-worker.js",
  "data/links.json",
  "data/media.json",
  "data/links.example.json",
  "data/media.example.json",
  ".gitignore",
  ".env.example",
  "PRIVACY.md",
  "STORE_LISTING.md",
];

const privateFiles = [".env", "data/links.local.json", "data/media.local.json"];

const ALLOWED_PERMISSIONS = new Set([
  "storage",
  "activeTab",
  "favicon",
  "alarms",
  "notifications",
  "contextMenus",
  "sidePanel",
  "offscreen",
  "tabs",
  "tabGroups",
  "search",
  "system.cpu",
  "system.memory",
]);
const ALLOWED_OPTIONAL = new Set(["bookmarks", "history", "topSites"]);
const ALLOWED_HOSTS = new Set([
  "https://api.open-meteo.com/*",
  "https://geocoding-api.open-meteo.com/*",
  "https://api.coingecko.com/*",
  "https://open.er-api.com/*",
]);

const forbiddenSourcePatterns = [
  { pattern: /<script[^>]+src=["']https?:\/\//i, message: "Remote script tags are not allowed." },
  { pattern: /<script(?![^>]*\bsrc=)[^>]*>\s*\S/i, message: "Inline <script> blocks are blocked by the extension CSP." },
  { pattern: /<iframe[^>]+src=["']https?:\/\//i, message: "Remote iframes are not allowed." },
  { pattern: /\son[a-z]+=["']/i, message: "Inline event handler attributes are blocked by the extension CSP.", html: true },
  { pattern: /\beval\s*\(/, message: "eval() is not allowed." },
  { pattern: /new\s+Function\s*\(/, message: "new Function() is not allowed." },
  { pattern: /import\s*\(\s*[`'"]https?:\/\//, message: "Remote dynamic imports are not allowed." },
  { pattern: /\.innerHTML\s*=/, message: "Do not assign innerHTML; build DOM nodes instead." },
  { pattern: /insertAdjacentHTML/, message: "Do not use insertAdjacentHTML." },
  { pattern: /document\.write\s*\(/, message: "document.write() is not allowed." },
  { pattern: /https:\/\/www\.google\.com\/s2\/favicons/i, message: "External favicon services leak browsing data; use chrome _favicon." },
  { pattern: /https:\/\/icons\.duckduckgo\.com/i, message: "External favicon services leak browsing data; use chrome _favicon." },
];

async function json(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertUrl(value, context) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${context} is not a valid URL: ${value}`);
  }
  assert(["http:", "https:"].includes(url.protocol), `${context} must be http(s)`);
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

async function validateFiles() {
  for (const file of requiredFiles) assert(existsSync(file), `Missing required file: ${file}`);
}

async function validateManifest() {
  const manifest = await json("manifest.json");
  assert(manifest.manifest_version === 3, "manifest_version must be 3");
  assert(/^\d+\.\d+\.\d+(\.\d+)?$/.test(manifest.version), "manifest.version must be a Chrome version string");
  const pkg = await json("package.json");
  assert(pkg.version === manifest.version, `package.json version (${pkg.version}) must match manifest (${manifest.version})`);

  const en = await json("_locales/en/messages.json");
  const resolve = (v) => String(v).replace(/^__MSG_(\w+)__$/, (_, k) => en[k]?.message ?? `<missing ${k}>`);
  assert(manifest.default_locale === "en", "default_locale must be en");
  assert(resolve(manifest.name).length <= 75, "name must be <= 75 characters");
  assert(resolve(manifest.description).length <= 132, "description must be <= 132 characters");
  assert(!resolve(manifest.name).includes("<missing"), "manifest name message missing");

  // Every path referenced by the manifest must exist.
  const paths = [
    manifest.chrome_url_overrides?.newtab,
    manifest.action?.default_popup,
    manifest.side_panel?.default_path,
    manifest.options_ui?.page,
    manifest.background?.service_worker,
    ...Object.values(manifest.icons || {}),
    ...Object.values(manifest.action?.default_icon || {}),
  ].filter(Boolean);
  for (const p of paths) assert(existsSync(p), `Manifest references a missing file: ${p}`);
  assert(manifest.background?.type === "module", "Service worker must be an ES module");

  for (const permission of manifest.permissions || []) assert(ALLOWED_PERMISSIONS.has(permission), `Unexpected permission: ${permission}`);
  for (const permission of manifest.optional_permissions || []) assert(ALLOWED_OPTIONAL.has(permission), `Unexpected optional permission: ${permission}`);
  for (const host of manifest.optional_host_permissions || []) assert(ALLOWED_HOSTS.has(host), `Unexpected optional host: ${host}`);
  assert(!("host_permissions" in manifest), "Required host_permissions are not allowed; use optional_host_permissions");
  assert(!("content_scripts" in manifest), "Content scripts are not used by NeTab");
  assert(!("web_accessible_resources" in manifest), "web_accessible_resources must not expose packaged data/media");
  assert(!(manifest.permissions || []).includes("<all_urls>"), "<all_urls> is not allowed");

  const csp = manifest.content_security_policy?.extension_pages || "";
  assert(csp.includes("script-src 'self'"), "CSP must restrict scripts to 'self'");
  assert(!/script-src[^;]*(https?:|'unsafe-eval'|'unsafe-inline')/i.test(csp), "CSP must not allow remote or unsafe scripts");
  assert(!/frame-src[^;]*https?:/i.test(csp), "CSP must not allow remote frames");
  const connect = /connect-src([^;]*)/.exec(csp)?.[1].trim().split(/\s+/) || [];
  const hostOrigins = new Set([...ALLOWED_HOSTS].map((h) => h.replace("/*", "")));
  for (const src of connect) assert(src === "'self'" || hostOrigins.has(src), `connect-src must only list opt-in API hosts, found ${src}`);
}

async function validateLinks() {
  const links = await json("data/links.json");
  assert(typeof links.title === "string" && links.title.trim(), "links.title is required");
  assert(Array.isArray(links.groups), "links.groups must be an array");
  for (const [gi, group] of links.groups.entries()) {
    assert(typeof group.id === "string" && group.id.trim(), `groups[${gi}].id is required`);
    assert(typeof group.name === "string" && group.name.trim(), `groups[${gi}].name is required`);
    assert(Array.isArray(group.links), `groups[${gi}].links must be an array`);
    for (const [li, link] of group.links.entries()) {
      assert(typeof link.id === "string" && link.id.trim(), `groups[${gi}].links[${li}].id is required`);
      assert(typeof link.label === "string" && link.label.trim(), `groups[${gi}].links[${li}].label is required`);
      assertUrl(link.url, `groups[${gi}].links[${li}].url`);
    }
  }
}

async function validateMedia() {
  const media = await json("data/media.json");
  assert(Array.isArray(media.photos) && Array.isArray(media.videos), "media.photos and media.videos must be arrays");
  for (const [key, items] of Object.entries({ photos: media.photos, videos: media.videos })) {
    for (const [i, item] of items.entries()) {
      assert(typeof item.path === "string" && item.path.trim(), `${key}[${i}].path is required`);
      assert(item.path.startsWith("media/samples/"), `${key}[${i}].path must stay inside media/samples/ in the public build`);
      assert(existsSync(item.path), `${key}[${i}].path does not exist: ${item.path}`);
    }
  }
}

async function validateNoPrivateFiles() {
  for (const file of privateFiles) assert(!existsSync(file), `Private file must not be committed: ${file}`);
  for (const dir of ["media/photos", "media/videos"]) {
    if (!existsSync(dir)) continue;
    const entries = (await readdir(dir)).filter((f) => f !== ".gitkeep");
    assert(entries.length === 0, `${dir} must not contain personal media in the public build`);
  }
}

async function validateSourceSafety() {
  const files = (await walk("src")).filter((f) => /\.(js|html|css)$/.test(f));
  files.push("manifest.json");
  for (const file of files) {
    const text = await readFile(file, "utf8");
    for (const { pattern, message, html } of forbiddenSourcePatterns) {
      if (html && !file.endsWith(".html")) continue;
      assert(!pattern.test(text), `${file}: ${message}`);
    }
  }
  // Every relative module import must resolve to a file.
  for (const file of files.filter((f) => f.endsWith(".js"))) {
    const text = await readFile(file, "utf8");
    for (const m of text.matchAll(/(?:import|export)\s[^'"]*?from\s+["'](\.[^"']+)["']/g)) {
      const target = path.join(path.dirname(file), m[1]);
      assert(existsSync(target), `${file}: import "${m[1]}" does not exist`);
    }
  }
  // Every local src/href in HTML must exist.
  for (const file of files.filter((f) => f.endsWith(".html"))) {
    const text = await readFile(file, "utf8");
    for (const m of text.matchAll(/\s(?:src|href)="([^"#?:]+)"/g)) {
      const target = path.join(path.dirname(file), m[1]);
      assert(existsSync(target), `${file}: ${m[1]} does not exist`);
    }
  }
}

async function validateSizes() {
  const files = [...(await walk("src")), ...(await walk("assets"))];
  let total = 0;
  for (const f of files) total += (await stat(f)).size;
  assert(total < 2 * 1024 * 1024, `Extension source is unexpectedly large: ${total} bytes`);
}

async function main() {
  await validateFiles();
  await validateManifest();
  await validateLinks();
  await validateMedia();
  await validateNoPrivateFiles();
  await validateSourceSafety();
  await validateSizes();
  console.log("NeTab validation passed.");
}

main().catch((error) => {
  console.error(`✖ ${error.message}`);
  process.exit(1);
});
