// Applies visual settings (theme, accent, glass, radius, scale, language) to <html>.

import { setLang } from "./i18n.js";

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return [124, 156, 255];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

let mediaQuery = null;

export function resolveTheme(theme) {
  if (theme === "light" || theme === "dark") return theme;
  return globalThis.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function applyTheme(settings, { onSystemChange } = {}) {
  const root = document.documentElement;
  setLang(settings.lang);
  const theme = resolveTheme(settings.theme);
  root.dataset.theme = theme;
  const [r, g, b] = hexToRgb(settings.accent);
  root.style.setProperty("--accent", settings.accent);
  root.style.setProperty("--accent-rgb", `${r} ${g} ${b}`);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  root.style.setProperty("--on-accent", lum > 0.62 ? "#0b0d14" : "#ffffff");
  root.style.setProperty("--glass-blur", `${Number(settings.glass ?? 18)}px`);
  root.style.setProperty("--card-alpha", String(Number(settings.cardOpacity ?? 58) / 100));
  root.style.setProperty("--radius", `${Number(settings.radius ?? 18)}px`);
  root.style.setProperty("--font-scale", String(Number(settings.fontScale ?? 100) / 100));
  root.classList.toggle("zen", Boolean(settings.zen));

  if (settings.theme === "auto" && globalThis.matchMedia && !mediaQuery) {
    mediaQuery = matchMedia("(prefers-color-scheme: light)");
    mediaQuery.addEventListener("change", () => {
      root.dataset.theme = mediaQuery.matches ? "light" : "dark";
      onSystemChange?.();
    });
  }
  return theme;
}

export const ACCENTS = ["#7c9cff", "#a78bfa", "#f472b6", "#fb7185", "#f59e0b", "#34d399", "#22d3ee", "#e2e8f0"];
