# mdread

**A quiet reading room for your markdown.** Drop a file or a whole folder, read it
beautifully, edit it in place, and download it — all in the browser. Local-first:
your files never leave your device. Deploys to Cloudflare in one command.

🔗 **Live: [mdread.app](https://mdread.app)** · MIT licensed · no backend · no tracking

![mdread](public/og-image.png)

## What it does

- 📂 **Open a folder or files** — via the native file picker, or just **drag & drop**
  anything onto the page (a single `.md`, a stack of files, or an entire folder tree).
- 📖 **Read** — typography tuned for hours of long-form reading, using your OS's
  native reading serif (New York on Apple, Georgia elsewhere — no web fonts to
  download): comfortable measure and leading, oldstyle figures, a table of contents
  with scroll-spy, and a reading-progress bar.
- ✍️ **Edit** — Read / Split / Edit views. On Chrome & Edge, **Save writes straight
  back to the original file on disk** (File System Access API). Elsewhere it downloads.
- ⬇️ **Download** any document as a clean `.md`.
- 🎨 **Day / Sepia / Night** themes, adjustable text size, line width, typeface, and
  an optional drop cap.
- 🔌 **Offline** — installable PWA; the app shell is cached, so it works with no network.
- 🧠 **Remembers** your last folder, your last document, your reading position, and your
  preferences across visits.

Everything is static HTML/CSS/JS with three small vendored libraries
([marked](https://marked.js.org), [DOMPurify](https://github.com/cure53/DOMPurify),
[highlight.js](https://highlightjs.org)) and **system fonts only** — no external
requests at all. **No build step.**

## Run locally

Any static file server works. The simplest:

```bash
npm run serve        # python3 -m http.server on :8787, serving ./public
```

…then open <http://localhost:8787>. Or, with Wrangler (mirrors production):

```bash
npm install
npm run dev          # wrangler dev
```

> **Note on editing:** live "save to disk" needs the File System Access API
> (Chrome/Edge, and over `http://localhost` or HTTPS). In other browsers files open
> read-only and edits download as new files. Reading works everywhere.

## Deploy to Cloudflare

Two ways — pick one.

### Workers (recommended, uses `wrangler.jsonc`)

```bash
npm install
npx wrangler login
npm run deploy       # wrangler deploy → serves ./public from Workers Assets
```

### Cloudflare Pages

```bash
npx wrangler pages deploy public --project-name markread
```

…or in the Cloudflare dashboard: **Pages → Create → Direct upload**, and drag in the
`public/` folder. No build command, output directory `public`.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `⌘/Ctrl + O` | Open folder |
| `⌘/Ctrl + S` | Save (to disk, or download) |
| `⌘/Ctrl + E` | Toggle edit |
| `⌘/Ctrl + \` | Toggle sidebar |
| `t` | Toggle table of contents |
| `f` | Focus mode |
| `/` | Search files |
| `Esc` | Exit focus / close popover |

## Project layout

```
public/
  index.html      app shell
  styles.css      the design (three themes, typography, layout)
  app.js          all logic: files, rendering, editing, persistence
  sw.js           service worker (offline)
  manifest.webmanifest
  icons/icon.svg
  vendor/         marked · DOMPurify · highlight.js (vendored for offline)
wrangler.jsonc    Cloudflare Workers Assets config
```

## Privacy

There is no server, no analytics, and **no external requests** — not even web
fonts (the app uses your operating system's native fonts). Files are read in your
browser; the only persistence is local (IndexedDB stores folder handles so they
can be reopened; `localStorage` stores preferences and reading positions).

## Contributing

Issues and PRs welcome. The whole app is three files in `public/` — `index.html`,
`styles.css`, `app.js` — with no build step, so you can edit and refresh.

## License

[MIT](LICENSE) © techjewel
