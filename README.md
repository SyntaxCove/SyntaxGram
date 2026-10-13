# SyntaxGram

A **Windows-first desktop client for the real, official Instagram web app** with first-class extras: media downloads, a managed download queue, and keyboard shortcuts.

SyntaxGram does **not** rebuild Instagram. It runs `https://www.instagram.com` inside a secure Electron `WebContentsView` and adds side layers around it (download buttons, queue, history, settings). **Login is handled entirely by Instagram itself** — the app has no login form and never stores your password or 2FA codes.

> **Unofficial project.** Not affiliated with, endorsed by, or sponsored by Instagram or Meta.

---

## Features

- **Dedicated Instagram browsing experience** — Home, Explore, Reels, Stories, posts, Login/Logout with a persistent session (you stay logged in after closing and reopening the app)
- **Light theme by default** — with a Dark option in Settings for low-light environments (in-page Instagram dialogs and toasts are themed too)
- **Download button on posts** (in the same row, right next to the Like button), a **floating download button** on Stories/Reels, and a **Download Carousel** modal (current slide / all slides)
- **Full carousel support** — multi-slide posts are expanded by walking Instagram's real Next button, so *all* slides are detected and downloadable (not just the first ~3 that Instagram keeps in the DOM)
- **Remappable keyboard shortcuts (Settings)** — defaults: `L` like, `D` download all, `Ctrl+D` download current slide; change any of them in Settings → Keyboard shortcuts by clicking **Change** and pressing new keys (automatic conflict detection, no page reload needed). They work on feed, posts, Reels and Stories — even when keyboard focus is on the app shell — and never while typing
- **Optional User-Agent override** — Settings → Application; empty = built-in default (recommended), a custom value is applied after one automatic reload
- **Professional download queue** — FIFO with manual reorder, configurable concurrency (1–10), Pause / Resume / Cancel / Retry / Delete
- **History and Failed downloads** with failure reason and attempt count
- **Standard naming** — `<username>-<unix_timestamp>.<ext>` with collision handling via `-01`, `-02` suffixes
- **Folder structure** — `<DownloadRoot>/<username>/images|videos`
- **Complete settings** — light/dark theme, download folder (native folder picker), max concurrent downloads, retry attempts, duplicate-file behavior, notifications, start with Windows, minimize to tray, remappable shortcuts, custom User-Agent
- **Windows integration** — NSIS installer, Start Menu shortcuts, system tray, native notifications, Open File/Folder

## Security & privacy

- `contextIsolation: true`, `nodeIntegration: false` and `sandbox: true` on every window
- The renderer has **no** Node.js / fs / shell access — only a small, typed API (`window.instagramApp`)
- Every IPC message is validated in the main process with strict validators
- URLs are only accepted from official hosts (`*.instagram.com`, `*.cdninstagram.com`, `*.fbcdn.net`) over `https`; `javascript:` / `data:` / `file:` / `blob:` are rejected
- The destination path is always canonicalized inside the backend-defined Download Root — path traversal is impossible
- Files are written atomically (`.part` first, then rename) and validated by magic bytes
- **No bypassing of any kind: no private APIs, no anti-bot / rate-limit evasion, no DRM circumvention.** If a medium can only be obtained by defeating a protection mechanism, the item is reported as `Failed / Unsupported`
- Passkey (WebAuthn) prompts are **suppressed** inside the embedded view — Instagram's login page otherwise pops a native Windows Security modal here ("Sign in with a passkey"), which the regular browser never shows. Log in with your username/password + 2FA as usual
- No credential logging, ever

## Tech stack

| Layer | Technology |
|---|---|
| Shell | Electron 44 (Main + WebContentsView) |
| UI | React 19 + Tailwind CSS 4 + Zustand + Lucide |
| Build | Vite 8 (4 separate bundles: main / preload / injection / renderer) |
| Language | TypeScript 5.9 (strict) |
| Testing | Vitest |
| Packaging | electron-builder (NSIS) |
| Storage | Built-in JSON store with atomic writes (no native dependencies) |

## Prerequisites

- **Node.js ≥ 22.12** and npm
- Windows 10/11 for the final build (development on Linux/macOS works too)

## Getting started (development)

```bash
npm install
npm run dev
```

`npm run dev` builds the main/preload/injection bundles in watch mode, starts the renderer dev server on port 5173, and launches Electron.

## Tests & checks

```bash
npm run typecheck   # two separate tsconfigs (node / web)
npm run test        # Vitest: queue, naming, URL guard, path guard, MIME,
                    # errors, shortcuts, settings, sniffing, carousel expansion
npm run lint
```

## Building the Windows installer

```bash
npm run icon        # generate resources/icon.png / icon.ico / tray.png (needs Python + Pillow)
npm run dist        # typecheck + build + electron-builder --win (NSIS x64)
```

Output lands in the `release/` folder: `SyntaxGram Setup 0.2.3.exe`

## Project structure

```
src/
├── shared/          ← types, IPC channels, validators (single contract for all layers)
├── main/            ← Main process
│   ├── app/         ← MainWindow + WebContentsView, Tray
│   ├── core/        ← DownloadQueue (pure), Downloader (streaming), DownloadManager,
│   │                   MediaRegistry, JsonStore, Settings, History, urlGuard, pathGuard…
│   └── ipc/         ← handler registration with full validation
├── preload/         ← window.instagramApp (app renderer) + window.instagramBridge (Instagram view)
├── injection/       ← Instagram enhancement layer: Adapters + Resolvers + UI (no Node.js)
└── renderer/        ← app shell UI (Dashboard, Instagram, Downloads, Queue, Failed, History, Settings)
```

### Download architecture

```
UI / Injection Layer
        ↓  (validated payload)
DownloadManager  ←  the single download entry point
        ↓
DownloadQueue (FIFO + concurrency + retry/backoff)
        ↓
Downloader (net.request on the Instagram session, streaming, .part → rename)
        ↓
File Writer + magic-byte validation + native notification
```

### MediaResolver

Priority order: `DOMResolver` → `MetadataResolver` → `ResourceResolver` → `NetworkResourceResolver`. None of them depends on a single CSS selector; they use semantic structure (`article`, `dialog`, aria-labeled buttons), `srcset`, Open-Graph/JSON-LD metadata and network-session records. All DOM selectors live in exactly one file — `src/injection/adapters/selectors.ts` — which makes maintenance straightforward when Instagram changes its markup.

### Carousel expansion

Instagram only keeps the first ~3 slide `<li>` nodes in the DOM and lazy-mounts the rest. Before downloading a multi-slide post, the injection layer programmatically walks the carousel's real Next button until the track ends, captures each slide's element by index, restores the original scroll position and caches the result — so "Download all slides" gets the full slide count, and stale capture is refreshed per open.

## Known limitations (MVP)

- Videos that play exclusively via MSE/blob are only downloadable if the real mp4 URL was observed in the same session (MediaRegistry)
- Instagram CDN URLs expire; a job that sits in the queue too long may fail with `HTTP_403/404` — retry it from the Failed page to pick up a fresh URL from the page (very old items should be retried from the page itself)
- Tamper-proofing against Instagram DOM changes cannot be guaranteed 100%; since every selector is centralized in one file, maintenance is kept easy

## Troubleshooting

- **Windows SmartScreen shows a warning:** the installer is not digitally signed; choose "More info → Run anyway"
- **"Sign in with a passkey" window:** intentionally suppressed since v0.2.3 (the embedded view used to pop a native Windows Security modal that the regular browser does not show). Log in with your password + 2FA
- **Login page won't open:** use the Reload button in the toolbar; the session lives in the `persist:instagram` partition
- **Download buttons don't appear:** the injection layer re-runs after every navigation; reload the page once
- **DISK_FULL error:** check the free space of your Download Root

## License

The source code of this project is released under the **MIT license with additional terms** — use, modification and redistribution are free, **provided the source is credited**: the copyright notice and this license must be retained in all copies, and the original project must be credited (<https://github.com/SyntaxCove/SyntaxGram>) in the source, documentation, or the About section of the derived work.

**The name and branding are an exception:** the name "SyntaxGram", its logo, the installer name and all related branding are **not** covered by the MIT grant and remain the property of SyntaxCove. No license is granted to use this name (or any confusingly similar one) for a fork, derivative work or other product — derivative works must be published under a different name. See the full terms in [LICENSE](./LICENSE).
