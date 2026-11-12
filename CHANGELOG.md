# Changelog

## 3.0.0 — 2026-11-12

A ground-up rewrite that turns NeTab from a links page into a full productivity extension.

### Added
- Smart search box and command palette: browser default engine plus 25+ `!bangs`, custom engines, Tab-to-search, calculator and unit/currency converter, fuzzy search across quick links, open tabs, bookmarks, history and notes, and `>` commands.
- Focus timer (Pomodoro) run by the service worker, with notifications, a chime (offscreen document), a toolbar badge, daily and weekly stats, and distraction blocking with a "Stay focused" page.
- Tab manager: close duplicates, group or sort by site, free memory (discard), merge windows, and save/restore sessions.
- Widgets: Today (daily focus and quote), Tasks, Focus, Weather (Open-Meteo), Calendar (Gregorian / Jalali / Hijri), Notes, Markets (CoinGecko + FX), Read later, Tabs & sessions, World clock, System. All can be dragged to rearrange.
- Toolbar popup, side panel, right-click menu and global keyboard shortcuts.
- Full Persian (فارسی) UI with RTL layout, the Vazirmatn font and Persian digits. Live language switching.
- Themes (dark / light / auto), accent colours, glass, radius and text-size controls, animated gradient backgrounds, solid colour, wallpaper rotation (per tab / hour / day), and Zen mode.
- Quick links rebuilt as tiles or a list: inline add/edit, drag to reorder, drop on a group to move, paste a URL to add, import a bookmark folder, Most visited, Open all, and letter-tile fallback icons.
- Settings drawer that saves instantly, permissions dashboard, full JSON backup/restore (accepts 2.x exports), reset.
- Welcome screen on install.
- QR codes (dependency-free encoder) for the current page and any text, page screenshots (visible area) with copy and download, and instant answers in the search box (world time, passwords, UUIDs, colours, Unix timestamps, Base64).
- Unit, i18n and Playwright end-to-end tests. Stricter store validation (CSP, permissions, no innerHTML/eval/inline scripts, import and asset checks).

### Changed
- Source moved to `src/` as ES modules. The manifest uses `_locales` for the store name and description.
- Optional features (bookmarks/history search, most visited, weather, markets) use optional permissions requested at runtime.

### Compatibility
- Existing 2.x links, media, uploaded wallpapers and `data/*.local.json` files keep working. 2.x users skip the welcome screen and keep their wallpapers.
