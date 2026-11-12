# Chrome Web Store listing

## Title

NeTab — New Tab, Focus & Tab Manager

## Summary (≤132 chars)

Private all-in-one new tab: smart search, Pomodoro with site blocking, tab manager, tasks, notes, weather and Jalali calendar.

## Category

Productivity → Workflow & Planning

## Languages

English, Persian (فارسی)

## Detailed description

NeTab turns every new tab into a calm, fast and private productivity dashboard.

SEARCH EVERYTHING FROM ONE BOX
• Use your favourite engine or any of 25+ built-in !bangs (!yt, !gh, !w, !gpt, !p, !maps…), and add your own
• Calculator and unit converter: 12*(4+5), 15% of 80, 10 km to mi, 30 c to f
• Instant answers: world time, passwords, UUIDs, colour and timestamp conversion
• Find quick links, open tabs, bookmarks, history and notes as you type
• Type > to run commands: themes, tab cleanup, sessions, Chrome pages and more

FOCUS TIMER THAT ACTUALLY HELPS
• Pomodoro with short and long breaks, a daily goal and weekly stats
• Notifications, a chime, and the time left on the toolbar badge
• Blocks distracting sites only while you focus

TAB MANAGER
• Close duplicate tabs, group or sort tabs by site, free memory and merge windows
• Save whole windows as sessions and restore them later

TASKS, NOTES, READ LATER
• Quick tasks with stars and due dates
• Notes with autosave and Markdown export
• Save pages for later from the toolbar, a shortcut or the right-click menu

WIDGETS
Today's focus, quotes, weather, a calendar (Gregorian / Persian Jalali / Hijri), markets (crypto, gold, currencies), world clock and a system monitor. Turn them on or off and drag them into your own layout.

EVERYWHERE IN CHROME
Toolbar popup (save, copy clean links, QR code, screenshot, tab tools), side panel, right-click menu and keyboard shortcuts.

BEAUTIFUL AND PERSONAL
Dark, light and auto themes, accent colours, glass effects, animated gradients, your own photos and videos, and a Zen mode. Full Persian (RTL) interface with the Vazirmatn font.

PRIVATE BY DESIGN
No account, no servers, no analytics, no ads. Your data stays on your device and you can export it any time. Online widgets (weather, markets) work only after you switch them on.

## Single purpose

NeTab is a personal productivity dashboard for the New Tab page. The popup, side panel and right-click menu give quick access to the same tools (links, tasks, notes, read later, focus timer and tab sessions).

## Permission justification

| Permission | Justification |
| --- | --- |
| storage | Stores the user's settings, links, tasks, notes, sessions and statistics locally. |
| favicon | Shows website icons for the user's links, open tabs and saved pages, using Chrome's local favicon cache. |
| activeTab | Captures a screenshot of the visible area of the current tab when the user clicks the popup's camera button. The image stays local. |
| tabs | Tab manager features (find and close duplicates, sort, group, save and restore sessions), switching to an open tab from the search box, saving the current page from the popup, and redirecting blocked sites during focus sessions. Page content is never read. |
| tabGroups | "Group by site" creates and names Chrome tab groups. |
| alarms | Ends focus and break phases on time, even with no NeTab tab open. |
| notifications | Tells the user when a focus or break phase ends. |
| offscreen | Plays the short chime at the end of a focus phase (AUDIO_PLAYBACK). |
| contextMenus | Right-click items: add to quick links, read later, save a selection as a note or task, and toggle focus. |
| sidePanel | Shows the tasks, notes, focus and read-later tools in Chrome's side panel. |
| search | Runs searches with the user's default search engine (chrome.search.query) when "Browser default" is selected. |
| system.cpu, system.memory | The optional System widget shows CPU load and memory usage. The values are read locally and never sent anywhere. |
| bookmarks (optional) | Requested only when the user enables bookmark search or imports a bookmark folder as a link group. |
| history (optional) | Requested only when the user enables history search in the search box. History is read locally to show results and is never stored or sent anywhere. |
| topSites (optional) | Requested only when the user enables the "Most visited" link group. |
| Host access (optional): api.open-meteo.com, geocoding-api.open-meteo.com | Requested only when the user enables the Weather widget: city search and forecast. |
| Host access (optional): api.coingecko.com, open.er-api.com | Requested only when the user enables the Markets widget: crypto and currency prices. |

Remote code: **No.** All JavaScript is packaged with the extension.

## Data usage disclosure

- Does not collect or transmit personally identifiable information, health, financial, authentication, personal communications, location, web history or user activity data.
- The optional weather feature sends the chosen city's coordinates to Open-Meteo to fetch a forecast.
- Data is not sold, not used for advertising, not used for creditworthiness, and not transferred except as described above.

## Assets

- Icon: `assets/icons/icon-128.png`
- Screenshots (1280×800 or 640×400 crops): `docs/screenshots/dashboard.jpg`, `dashboard-fa.jpg`, `search.jpg`, `popup.jpg`, `sidepanel.jpg`, `blocked.jpg`
- Privacy policy: `PRIVACY.md`
