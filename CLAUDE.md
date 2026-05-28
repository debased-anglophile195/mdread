# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A local-first Markdown reader/editor. **No backend, no framework, no tests.** It's a
Vite + SCSS app of plain ES modules; files are read in the browser and nothing is ever
uploaded. `vite build` bundles `src/` + `public/` into `dist/`, and `dist/` is what
Cloudflare serves.

> Naming: the product/UI is "mdread" (and `wrangler.jsonc`/`package.json` `name`), but the
> directory, code comments, IndexedDB database, and `localStorage` keys all use **`markread`**.
> Both refer to the same thing — don't "fix" one to match the other.

## Commands

```bash
npm install
npm run dev       # Vite dev server, hot reload → http://localhost:5173
npm run build     # bundle + compile SCSS → ./dist
npm run preview   # serve ./dist as deployed → http://localhost:4173
npm run deploy        # vite build → wrangler deploy (Cloudflare Workers Assets)
npm run deploy:pages  # vite build → wrangler pages deploy dist
```

No lint and no test runner. To verify a change: `npm run build` (Rolldown errors on any
unresolved import, so a green build means the module graph is sound), then `npm run preview`
and check it in Chrome/Edge — live "save to disk" needs the File System Access API, served
over `localhost` or HTTPS.

## Architecture

`index.html` (repo root) is the Vite entry; it loads `src/main.js` as a module.
`src/main.js` imports the stylesheet, wires the DOM, and boots on `DOMContentLoaded`.
All behaviour lives in `src/modules/*.js` — plain ES modules, one concern each:

- `dom.js` — `$`/`$$`, cached element refs, shared constants (`MD_RE`, `supportsFSA`)
- `state.js` — the mutable `state` object, persisted `prefs`, reading `positions`
- `idb.js` — IndexedDB key/value store · `util.js` — pure helpers
- `markdown.js` — render pipeline · `files.js` / `tree.js` / `document.js` — sources, file tree, open/new doc
- `editor.js` / `save.js` — editing + saving · `view.js` / `scroll.js` / `ui.js` — modes, prefs, progress, toasts
- `recents.js`, `sample.js`, `keyboard.js`

The modules form import **cycles** (e.g. `tree` ↔ `document`, `files` ↔ `recents`). This is
fine: imported bindings are only *called* at runtime, never used during module evaluation, so
ES module live bindings resolve them. Listeners that used to run at script load are now wrapped
in `wire*()` functions (`wireEditor`, `wireScroll`, `wireUi`, `wireFallbackInputs`) and called
from `main.js`'s `wire()`.

**State-driven UI is the central pattern.** JS never toggles classes for layout; it sets `data-*`
attributes and the SCSS reacts. UI state lives in attributes on `<html>` and `#app`: `data-theme`,
`data-dropcap`, `data-mode` (read/split/edit), `data-sidebar`, `data-focus`, `data-has-doc`,
`data-toc`. `applyPrefs()` in `view.js` is the single place preferences flow into DOM
attributes/CSS custom properties.

**File access cascades through three tiers** by browser capability — see `handleDrop()` in
`files.js`: (1) File System Access API handles (read+write, Chrome/Edge), (2) `webkitGetAsEntry`
directory walk (read-only), (3) plain `File` objects. `supportsFSA` gates pickers vs. the hidden
`<input>` fallbacks. The **file model** is `state.files[]`, each `{ name, path, handle?, file?,
content?, dirty?, draft? }`; `handle` (writable) vs. `file` (read-only) vs. neither (`draft`)
drives what `saveDoc()` does — it cascades write-through-handle → `showSaveFilePicker` → download.

**Rendering pipeline** (`markdown.js`): `marked.parse` → `DOMPurify.sanitize` → inject into
`#reading` → assign heading IDs + `¶` anchors → `buildToc` (scroll-spy via `scroll.js`) →
highlight code → rewrite external links to `target="_blank"`.

**Persistence**: IndexedDB (`markread` db, `kv` store) holds folder `handle`s — `recents`,
`lastDoc`. `localStorage` holds `markread:prefs` and `markread:pos` (per-path scroll ratio).

### Styles (SCSS)

`src/styles/main.scss` `@use`s the partials in cascade order (`_tokens`, `_base`, `_sidebar`,
`_column`, `_reading`, `_toc`, `_welcome`, `_components`, `_responsive`). Order matters — later
partials win the cascade.

⚠️ The theme/typography **tokens in `_tokens.scss` are CSS custom properties on purpose**
(`--reading-scale`, `--measure`, `--body`, the per-theme color vars): JS reads and writes them at
runtime. Keep them as custom properties — do not convert to Sass variables. `_vars.scss` holds
only build-time Sass values (breakpoints) that compile away. (The main-column partial is
`_column.scss`, not `_main.scss`, because `@use "main"` would collide with the `main.scss` entry.)

## Build specifics

- **Markdown libs are bundled, not vendored.** `marked`, `dompurify`, `highlight.js` are npm
  dependencies imported in `markdown.js` and put in a `vendor` chunk (`vite.config.js`
  `manualChunks`, which must be a function — Vite 8 uses Rolldown). Still self-hosted = zero
  external runtime requests. **`highlight.js` is imported as `highlight.js/lib/common`** (~35
  languages, ~120 KB); the full entry pulls ~190 languages (~980 KB) — don't switch to it.
- **Service worker is generated by `vite-plugin-pwa`** (Workbox `generateSW`), so it precaches
  the hashed build assets automatically — there is no hand-maintained file list to bump anymore.
  Change caching in the `VitePWA({...})` block. `manifest: false` keeps the hand-written
  `public/manifest.webmanifest`. SW is disabled in `vite dev`.
- `public/` is copied verbatim to `dist/` root (icons, manifest, og-image). `wrangler.jsonc`
  serves `./dist` with `not_found_handling: "single-page-application"`. `wrangler.jsonc` does **not**
  hardcode an account — it comes from `wrangler login` or `CLOUDFLARE_ACCOUNT_ID` (set it for
  non-interactive/CI). It uses **wrangler environments**: the base config deploys to `*.workers.dev`
  (`npm run deploy`, the fork-friendly default), and `env.production` carries the `mdread.app`
  custom-domain route (`npm run deploy:prod` → `wrangler deploy --env production`). `routes` is a
  non-inherited key, so `assets` is repeated inside `env.production`. Forking requires changing
  `name` and `env.production.routes`.
