<img width="352" height="746" alt="image" src="https://github.com/user-attachments/assets/dd9360d0-98e2-4130-bdcb-f3cdc6a25622" />

<img width="482" height="899" alt="image" src="https://github.com/user-attachments/assets/d231fd8d-d1f7-42fa-a132-2be0a94cd308" />
Heat map
<img width="441" height="281" alt="image" src="https://github.com/user-attachments/assets/18b33db3-2e6c-4f16-b877-6a3293658452" />
<img width="1920" height="949" alt="image" src="https://github.com/user-attachments/assets/e5e98cd7-afff-45e4-83a2-ba0b2f6b2ed2" />

# Koanyx Trac

A usability tracker for any website. Mahogany interface.

## The live panel
Once tracking is on, a draggable mahogany panel stays on every page (no need to keep the popup open). It shows:
- Live clock and full date
- Mouse state: Moving, Stopped, Idle or Left the page, with how long it has been that way
- Cursor speed graph (last 30s), position, what the cursor is over, time moving vs stopped
- Optional fading cursor trail
Browser-internal pages (chrome://, the web store, about:) don't allow extensions, so the panel can't appear there.

## Cursor heatmap
Koanyx Trac splits the screen into a grid and records where your cursor travels and where it sits still.
- Black = the cursor stays here for a long time
- Dark mahogany = some time spent
- Red = visited, but only briefly or rarely
- Clear = never visited
Turn it on with the "Heatmap" button in the live panel or in the popup. Maps are saved per page (path) on each site, and the popup shows a mini version for the page you are on. "Reset site" clears them.

## What it tracks
- Rage clicks: 3+ clicks in the same spot within a second
- Dead clicks: clicks on non-interactive elements where nothing on the page reacts
- Scroll U-turns: fast scroll down then back up (often "where is it?")
- Slow fields: form fields focused for 15s+ (time only, never the text)
- Scroll depth, active time, load time and layout shift
- A 0-100 usability score per site

## Install (unpacked)
Chrome / Edge / Brave / Opera / Vivaldi
1. Unzip this folder.
2. Open chrome://extensions (edge://extensions, brave://extensions, opera://extensions).
3. Turn on Developer mode, click "Load unpacked", pick the folder.
4. Pin Koanyx Trac, click it, switch tracking on.

Firefox
1. Open about:debugging#/runtime/this-firefox
2. Click "Load Temporary Add-on" and pick manifest.json.
(For permanent install, sign it at addons.mozilla.org.)

Safari
Run: xcrun safari-web-extension-converter <this folder>, then build in Xcode.

## Privacy
Everything is stored locally with the browser's extension storage. Nothing is sent anywhere.
