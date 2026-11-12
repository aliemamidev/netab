// Optional online features. Each one is opt-in: the user grants host access at
// runtime (chrome.permissions.request) before NeTab contacts any server.

import { isExtension } from "./utils.js";
import { get, set, KEYS } from "./storage.js";

export const FEATURE_HOSTS = {
  weather: ["https://api.open-meteo.com/*", "https://geocoding-api.open-meteo.com/*"],
  markets: ["https://api.coingecko.com/*", "https://open.er-api.com/*"],
};

export async function hasFeature(feature) {
  if (!isExtension || !chrome.permissions) return true;
  try {
    return await chrome.permissions.contains({ origins: FEATURE_HOSTS[feature] });
  } catch {
    return false;
  }
}

/** Must be called from a user gesture (click). */
export async function requestFeature(feature) {
  if (!isExtension || !chrome.permissions) return true;
  try {
    return await chrome.permissions.request({ origins: FEATURE_HOSTS[feature] });
  } catch {
    return false;
  }
}

export async function revokeFeature(feature) {
  if (!isExtension || !chrome.permissions) return true;
  try {
    return await chrome.permissions.remove({ origins: FEATURE_HOSTS[feature] });
  } catch {
    return false;
  }
}

async function fetchJson(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, credentials: "omit", referrerPolicy: "no-referrer" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function cached(cacheKey, signature, ttlMs, loader, { force = false } = {}) {
  const entry = await get(cacheKey, null);
  if (!force && entry && entry.signature === signature && Date.now() - entry.at < ttlMs) return { data: entry.data, at: entry.at, cached: true };
  try {
    const data = await loader();
    const at = Date.now();
    await set(cacheKey, { signature, at, data });
    return { data, at, cached: false };
  } catch (error) {
    if (entry && entry.signature === signature) return { data: entry.data, at: entry.at, cached: true, stale: true, error };
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Weather (Open-Meteo, no API key)

export async function searchCity(query, lang = "en") {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", query);
  url.searchParams.set("count", "8");
  url.searchParams.set("language", lang === "fa" ? "fa" : "en");
  url.searchParams.set("format", "json");
  const data = await fetchJson(url.toString());
  return (data.results || []).map((r) => ({
    name: r.name,
    country: r.country || "",
    admin: r.admin1 || "",
    lat: Number(r.latitude.toFixed(4)),
    lon: Number(r.longitude.toFixed(4)),
    tz: r.timezone || "auto",
  }));
}

export async function getWeather(city, units = "c", options = {}) {
  const signature = `${city.lat},${city.lon},${units}`;
  return cached(
    KEYS.weatherCache,
    signature,
    30 * 60_000,
    async () => {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.searchParams.set("latitude", String(city.lat));
      url.searchParams.set("longitude", String(city.lon));
      url.searchParams.set("current", "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day");
      url.searchParams.set("hourly", "temperature_2m,weather_code,precipitation_probability");
      url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset");
      url.searchParams.set("forecast_days", "7");
      url.searchParams.set("timezone", "auto");
      if (units === "f") {
        url.searchParams.set("temperature_unit", "fahrenheit");
        url.searchParams.set("wind_speed_unit", "mph");
      }
      return fetchJson(url.toString());
    },
    options,
  );
}

const WMO = [
  [[0], "☀️", "🌙", "clear"],
  [[1], "🌤️", "🌙", "mainlyClear"],
  [[2], "⛅", "☁️", "partlyCloudy"],
  [[3], "☁️", "☁️", "overcast"],
  [[45, 48], "🌫️", "🌫️", "fog"],
  [[51, 53, 55, 56, 57], "🌦️", "🌧️", "drizzle"],
  [[61, 63, 65, 66, 67, 80, 81, 82], "🌧️", "🌧️", "rain"],
  [[71, 73, 75, 77, 85, 86], "🌨️", "🌨️", "snow"],
  [[95, 96, 99], "⛈️", "⛈️", "thunder"],
];

export function weatherInfo(code, isDay = 1) {
  const row = WMO.find(([codes]) => codes.includes(Number(code)));
  if (!row) return { emoji: "🌡️", key: "weather.unknown" };
  return { emoji: isDay ? row[1] : row[2], key: `weather.${row[3]}` };
}

// ---------------------------------------------------------------------------
// Markets (CoinGecko + open.er-api, no API key)

export async function getCoins(ids, options = {}) {
  const list = [...new Set(ids)].filter(Boolean).slice(0, 12);
  if (!list.length) return { data: [], at: Date.now() };
  return cached(
    KEYS.marketsCache,
    list.join(","),
    10 * 60_000,
    async () => {
      const url = new URL("https://api.coingecko.com/api/v3/coins/markets");
      url.searchParams.set("vs_currency", "usd");
      url.searchParams.set("ids", list.join(","));
      url.searchParams.set("sparkline", "true");
      url.searchParams.set("price_change_percentage", "24h");
      const rows = await fetchJson(url.toString());
      return rows.map((r) => ({
        id: r.id,
        symbol: String(r.symbol || "").toUpperCase(),
        name: r.name,
        image: r.image,
        price: r.current_price,
        change: r.price_change_percentage_24h,
        spark: (r.sparkline_in_7d?.price || []).filter((_, i, arr) => i % Math.max(1, Math.floor(arr.length / 48)) === 0),
      }));
    },
    options,
  );
}

export async function getFx(options = {}) {
  return cached(
    KEYS.fxCache,
    "USD",
    6 * 60 * 60_000,
    async () => {
      const data = await fetchJson("https://open.er-api.com/v6/latest/USD");
      if (data.result !== "success") throw new Error("FX unavailable");
      return { rates: data.rates, updated: data.time_last_update_unix * 1000 };
    },
    options,
  );
}

/** Cached FX rates if present (used by the calculator, never triggers network). */
export async function cachedRates() {
  const entry = await get(KEYS.fxCache, null);
  return entry?.data?.rates || null;
}
