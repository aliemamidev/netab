import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { STRINGS } from "../src/lib/strings.js";
import { WIDGET_IDS } from "../src/lib/storage.js";

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (/\.(js|html)$/.test(entry.name)) out.push(full);
  }
  return out;
}

async function usedKeys() {
  const keys = new Set();
  for (const file of await walk("src")) {
    if (file.endsWith("strings.js")) continue;
    const text = await readFile(file, "utf8");
    for (const m of text.matchAll(/\bt\(\s*["']([\w.]+)["']/g)) keys.add(m[1]);
    for (const m of text.matchAll(/data-i18n(?:-placeholder|-title|-aria)?="([\w.]+)"/g)) keys.add(m[1]);
    for (const m of text.matchAll(/\[\s*"[\w-]+"\s*,\s*"[\w-]+"\s*,\s*"((?:tabs|set)\.[\w.]+)"\s*\]/g)) keys.add(m[1]);
  }
  // Keys built dynamically in code.
  for (const p of ["work", "short", "long"]) keys.add(`focus.phase.${p}`);
  for (const g of ["morning", "afternoon", "evening", "night"]) {
    keys.add(`greet.${g}`);
    keys.add(`greet.${g}.name`);
  }
  for (const g of ["aurora", "sunset", "ocean", "forest", "midnight", "ember", "candy", "paper"]) keys.add(`bg.${g}`);
  for (const s of ["general", "appearance", "background", "search", "links", "widgets", "focus", "data", "about"]) {
    keys.add(`set.${s}`);
    keys.add(`set.${s}.intro`);
  }
  for (const w of ["clear", "mainlyClear", "partlyCloudy", "overcast", "fog", "drizzle", "rain", "snow", "thunder", "unknown"]) keys.add(`weather.${w}`);
  for (const id of WIDGET_IDS) {
    keys.add(`w.${id}`);
    keys.add(`w.${id}.desc`);
  }
  return keys;
}

test("every key used in the UI exists in English and Persian", async () => {
  const keys = await usedKeys();
  const missingEn = [...keys].filter((k) => !(k in STRINGS.en));
  const missingFa = [...keys].filter((k) => !(k in STRINGS.fa));
  assert.deepEqual(missingEn, [], `Missing English strings: ${missingEn.join(", ")}`);
  assert.deepEqual(missingFa, [], `Missing Persian strings: ${missingFa.join(", ")}`);
});

test("English and Persian tables have identical keys and placeholders", () => {
  // "<key>.one" singular forms are English-only (Persian nouns don't change after numbers).
  const en = Object.keys(STRINGS.en).filter((k) => !k.endsWith(".one")).sort();
  const fa = Object.keys(STRINGS.fa).sort();
  assert.deepEqual(fa, en);
  for (const key of Object.keys(STRINGS.en).filter((k) => k.endsWith(".one"))) {
    assert.ok(key.slice(0, -4) in STRINGS.en, `Singular form without base key: ${key}`);
  }
  for (const key of en) {
    const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    assert.deepEqual(vars(STRINGS.fa[key]), vars(STRINGS.en[key]), `Placeholder mismatch in ${key}`);
  }
});

test("Chrome store locale strings fit the limits", async () => {
  for (const lang of ["en", "fa"]) {
    const msgs = JSON.parse(await readFile(`_locales/${lang}/messages.json`, "utf8"));
    assert.ok(msgs.extName.message.length <= 75, `${lang} name too long`);
    assert.ok(msgs.extDescription.message.length <= 132, `${lang} description too long`);
  }
});
