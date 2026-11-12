// Shared app state for the new tab page and the side panel.

import { loadSettings, saveSettings, subscribe, KEYS } from "../lib/storage.js";
import { applyTheme } from "../lib/theme.js";
import { applyI18n, lang } from "../lib/i18n.js";

export const app = {
  surface: "newtab",
  settings: null,
};

const bus = new EventTarget();

export function on(name, callback) {
  const handler = (e) => callback(e.detail);
  bus.addEventListener(name, handler);
  return () => bus.removeEventListener(name, handler);
}

export function emit(name, detail) {
  bus.dispatchEvent(new CustomEvent(name, { detail }));
}

export function settings() {
  return app.settings;
}

export function updateSettings(patch) {
  return saveSettings(patch);
}

export async function initApp(surface) {
  app.surface = surface;
  app.settings = await loadSettings();
  applyTheme(app.settings, { onSystemChange: () => emit("theme", app.settings) });
  applyI18n(document);

  subscribe(KEYS.settings, async () => {
    const prev = app.settings;
    const prevLang = lang();
    app.settings = await loadSettings();
    applyTheme(app.settings);
    const langChanged = prevLang !== lang();
    if (langChanged) applyI18n(document);
    emit("settings", { settings: app.settings, prev, langChanged });
  });
  return app;
}
