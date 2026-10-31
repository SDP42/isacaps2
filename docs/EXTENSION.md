# MIRAGE Shield: Chrome extension (prototype)

Brings MIRAGE to where scams arrive: the browser tab with the call, the email or the chat. Folder: `extension/`
(Manifest V3, no build step). It talks to the MIRAGE API (default `http://localhost:8000`).

## Install (developer mode)

1. Start the backend (`uvicorn app.main:app --port 8000`).
2. Open `chrome://extensions`, switch on **Developer mode**, choose **Load unpacked** and select the `extension/` folder.
3. Click the MIRAGE Shield icon, check the server URL, pick a persona and **Sign in**.

## Features

| Feature | How it works | API |
|---|---|---|
| Check a message | Paste text in the popup | `POST /v1/quick/text` |
| Right-click → check selected text | Context menu on any page; opens a result window with the response plan | `POST /v1/quick/text` |
| Right-click → check this image | Downloads the image and checks AI generation and face swaps | `POST /v1/quick/media` |
| Right-click → check this voice note | For `<audio>` / `<video>` elements (for example a voice note opened in a tab) | `POST /v1/voice/triage` |
| Upload a file | Voice notes go through the two-stage voice check; images and videos through the detectors | triage / quick media |
| **Shield this call** | `chrome.tabCapture` + an offscreen document capture the tab's audio (Meet, Zoom web, Teams, WhatsApp Web calls), keep it audible, and post 3-second 16 kHz WAV chunks. The badge shows live risk; a system notification fires the first time risk reaches 70 | `POST /v1/live/chunk` |
| **WhatsApp Web voice notes** | A "Check with MIRAGE" chip under every voice note. WhatsApp decrypts a note only when it plays, so a small page-context hook (`whatsapp-hook.js`, `world: MAIN`) keeps the decrypted audio blob; the chip sends it through the service worker. Nothing leaves the page until the user clicks | `POST /v1/voice/triage` |
| Auto-scan Gmail (opt-in) | A content script reads each opened email body and, unless it is low risk, inserts a banner with the verdict and a "What to do" button | `POST /v1/quick/text` via the service worker |

Every result shows the same "what now" plan as the web app ([AFTER_DETECTION.md](AFTER_DETECTION.md)).

## Design notes

- Content scripts cannot call `localhost` across origins, so the service worker makes the API calls for them.
- The API allows `chrome-extension://<id>` origins through a CORS regex in `app/main.py`.
- Sign-in uses the demo persona JWT; production needs SSO and a per-organisation API URL (managed via Chrome
  enterprise policy).

## Verification status

The popup logic was exercised against the live API in a test harness (message check, sign-in, plan rendering), the
scripts pass `node --check`, and the CORS preflight for an extension origin returns 200. The tab-capture shield, the
context menus, the Gmail banner and the WhatsApp Web chip have **not yet been run inside Chrome**; load the folder
and try them before a demo. The WhatsApp chip finds voice notes by their play icon (`data-icon="audio-play"` /
`"ptt-play"`); WhatsApp's DOM is not a public API, so that selector is the first thing to check if no chip appears.

## Phone: share to MIRAGE

The web app is also an installable PWA with a Web Share Target (`frontend/public/manifest.webmanifest`,
`public/share-sw.js`). On Android, open MIRAGE in Chrome, choose *Add to Home screen*, and MIRAGE appears in the share
sheet: long-press a WhatsApp voice note, tap Share, pick MIRAGE. The worker parks the shared file in the Cache API and
opens `/app/share`, which runs the voice check, media check or message check and shows the "what now" plan. Sharing
needs https (or localhost) and Chrome 89 or later; it has been built and type-checked, not yet tried on a phone.

## Roadmap

Caption-based checks in Meet (lower bandwidth) ·
per-organisation policy (auto-hold payments, SOC webhook) · Firefox and Edge packaging · Chrome Web Store listing.
