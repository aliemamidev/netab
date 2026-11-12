# Privacy Policy for NeTab

Last updated: November 12, 2026

NeTab is a local-first Chrome extension that replaces the New Tab page with a productivity dashboard and adds a popup, a side panel and a right-click menu.

## What NeTab stores

All of the following is stored **only on your device**, using Chrome's extension storage (`chrome.storage.local`) and IndexedDB:

- Settings (language, theme, layout, widgets, search engines, focus timer options and the block list)
- Quick links and link groups
- Tasks, notes, read-later items, saved tab sessions, focus statistics and your daily focus text
- Wallpapers and videos that you upload
- Short-lived caches of weather and market data, if you enabled those widgets

NeTab has **no servers, no accounts, no analytics, no ads and no tracking**. It does not sell, share, rent or transfer your data. You can export, restore or delete everything in **Settings → Privacy & data**.

## Network requests

NeTab only connects to the internet for features that you switch on yourself. For each one, Chrome first asks you to grant access:

| Feature | Service | What is sent |
| --- | --- | --- |
| Weather | `api.open-meteo.com`, `geocoding-api.open-meteo.com` | The city name you search for and the coordinates of the city you pick |
| Markets | `api.coingecko.com`, `open.er-api.com` | The coin IDs you chose. Currency rates are fetched for USD |

These requests contain no cookies or personal identifiers. You can revoke access at any time in **Settings → Privacy & data**.

Search queries you type are sent only to the search engine you choose, when you press Enter. "Browser default" uses Chrome's own search engine through the `chrome.search` API.

## Permissions

| Permission | Why |
| --- | --- |
| `storage` | Save your settings and content locally |
| `favicon` | Show site icons for your links, tabs and saved pages (served by Chrome, no network request) |
| `tabs`, `tabGroups` | Tab manager (find duplicates, group or sort by site, save and restore sessions), switching to open tabs from search, saving the current page, and redirecting blocked sites during focus sessions |
| `alarms`, `notifications`, `offscreen` | Run the focus timer in the background, notify you when a phase ends, and play the chime |
| `contextMenus` | "Save to NeTab" items in the right-click menu |
| `sidePanel` | The NeTab side panel |
| `search` | Run searches with your browser's default search engine |
| `system.cpu`, `system.memory` | The optional System widget (CPU and memory usage). Read locally only |
| Optional: `bookmarks`, `history` | Show matching bookmarks and history in the search box, and import a bookmark folder. Requested only when you enable it |
| Optional: `topSites` | Show Chrome's "Most visited" sites as a link group. Requested only when you enable it |
| Optional host access | The weather and markets services listed above, requested only when you enable those widgets |

NeTab does not read page content, does not inject scripts into websites and does not collect your browsing history. When you allow history search, history is read locally to show results and is never stored or sent anywhere.

## Contact

Please open an issue in the project repository.

If you publish a modified version of NeTab, you are responsible for updating this policy to match your changes.
