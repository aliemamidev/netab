// Renders assets/icons/logo.svg into the PNG sizes Chrome needs (requires Playwright).

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error("Playwright is not installed. Run: npm i -D playwright");
  process.exit(1);
}

const svg = await readFile("assets/icons/logo.svg", "utf8");
const browser = await chromium.launch();
for (const size of [16, 32, 48, 128]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0">${svg.replace('width="128" height="128"', `width="${size}" height="${size}"`)}</body>`);
  await page.screenshot({ path: `assets/icons/icon-${size}.png`, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
}
await browser.close();
console.log("Icons rendered.");
