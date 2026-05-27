/* ============================================================
   Markread — local-first markdown reader
   Vanilla ES module. Libraries (marked, DOMPurify, hljs) are
   loaded as globals by the vendored scripts before this runs.
   ============================================================ */

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const MD_RE = /\.(md|markdown|mdown|mkd|mkdn|mdwn|mdx|txt)$/i;
const isMarkdown = (n) => MD_RE.test(n);
const supportsFSA = "showDirectoryPicker" in window;

/* ---------------- DOM refs ---------------- */
const app          = $("#app");
const tree         = $("#tree");
const reading      = $("#reading");
const readingScroll= $("#readingScroll");
const editor       = $("#editor");
const docName      = $("#docName");
const docSub       = $("#docSub");
const tocList      = $("#tocList");
const progressBar  = $("#progressBar");
const searchInput  = $("#searchInput");
const toastEl      = $("#toast");
const typePop      = $("#typePop");
const curFolder    = $("#curFolder");
const curFolderName= $("#curFolderName");
const recentsWrap  = $("#recentsWrap");
const recentsToggle= $("#recentsToggle");
const recentsList  = $("#recentsList");
const welcomeRecent= $("#welcomeRecent");
const welcomeRecentList = $("#welcomeRecentList");
const welcomeHint  = $("#welcomeHint");

/* ---------------- State ---------------- */
const state = {
  files: [],          // { name, path, handle?, file?, content?, dirty? }
  current: null,
  rootHandle: null,
  rootName: "",
  filter: "",
};

/* ---------------- Preferences ---------------- */
const PREFS_KEY = "markread:prefs";
const prefs = Object.assign({
  theme: matchMedia("(prefers-color-scheme: dark)").matches ? "night" : "day",
  font: "sans",
  size: 92,      // smallest by default
  width: 72,     // widest by default
  dropcap: false,
  toc: false,
}, readJSON(PREFS_KEY));

function readJSON(k) { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } }
function savePrefs() { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); }

const POS_KEY = "markread:pos";
const positions = readJSON(POS_KEY);
const savePositions = debounce(() => localStorage.setItem(POS_KEY, JSON.stringify(positions)), 400);

/* ---------------- IndexedDB (persist folder handle) ---------------- */
const DB = "markread", STORE = "kv";
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbSet(k, v) {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, "readwrite");
    t.objectStore(STORE).put(v, k);
    t.oncomplete = res; t.onerror = () => rej(t.error);
  });
}
async function idbGet(k) {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, "readonly");
    const rq = t.objectStore(STORE).get(k);
    rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
  });
}
async function idbDel(k) {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, "readwrite");
    t.objectStore(STORE).delete(k);
    t.oncomplete = res; t.onerror = () => rej(t.error);
  });
}

/* ---------------- Markdown rendering ---------------- */
if (window.marked) {
  marked.setOptions({ gfm: true, breaks: false, headerIds: false, mangle: false });
}

function renderMarkdown(md) {
  const raw = window.marked ? marked.parse(md) : escapeHtml(md);
  const clean = window.DOMPurify
    ? DOMPurify.sanitize(raw, { ADD_ATTR: ["target"] })
    : raw;
  reading.innerHTML = clean;

  // heading ids + anchors → TOC
  const heads = $$("h1, h2, h3, h4", reading);
  const seen = {};
  const items = [];
  for (const h of heads) {
    let id = slug(h.textContent);
    if (seen[id]) id = `${id}-${++seen[id]}`; else seen[id] = 1;
    h.id = id;
    const a = document.createElement("a");
    a.className = "anchor"; a.href = `#${id}`; a.textContent = "¶";
    a.setAttribute("aria-hidden", "true");
    h.appendChild(a);
    items.push({ id, text: h.firstChild?.textContent?.trim() || h.textContent.replace("¶", "").trim(), level: +h.tagName[1] });
  }
  buildToc(items);

  // syntax highlight
  if (window.hljs) {
    for (const block of $$("pre code", reading)) {
      try { hljs.highlightElement(block); } catch {}
    }
  }

  // external links open in new tab
  for (const a of $$('a[href^="http"]', reading)) {
    if (a.host !== location.host) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
  }
}

function buildToc(items) {
  tocList.innerHTML = "";
  for (const it of items) {
    const a = document.createElement("a");
    a.href = `#${it.id}`;
    a.textContent = it.text;
    a.className = `lvl-${it.level}`;
    a.dataset.id = it.id;
    a.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById(it.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    tocList.appendChild(a);
  }
}

function slug(s) {
  return s.toLowerCase().trim()
    .replace(/[¶]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "section";
}
function escapeHtml(s) { return s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }

/* ---------------- File sources ---------------- */
async function openFolder() {
  if (!supportsFSA) { $("#dirFallback").click(); return; }
  try {
    const handle = await showDirectoryPicker({ mode: "readwrite" });
    await setRoot(handle);
  } catch (e) { if (e.name !== "AbortError") console.warn(e); }
}

async function openFiles() {
  if (!supportsFSA) { $("#fileFallback").click(); return; }
  try {
    const handles = await showOpenFilePicker({ multiple: true });
    const added = [];
    for (const h of handles) {
      const f = { name: h.name, path: h.name, handle: h };
      added.push(f);
    }
    addFiles(added, /*replace*/ !state.files.length);
    if (added[0]) await openDoc(added[0]);
  } catch (e) { if (e.name !== "AbortError") console.warn(e); }
}

async function setRoot(dirHandle) {
  state.rootHandle = dirHandle;
  state.rootName = dirHandle.name;
  await addRecent(dirHandle);
  const files = [];
  for await (const f of walk(dirHandle)) files.push(f);
  files.sort(byPath);
  addFiles(files, /*replace*/ true);
  toast(`Loaded “${dirHandle.name}” — ${files.length} file${files.length === 1 ? "" : "s"}`);
  // reopen last doc if present
  const last = await idbGet("lastDoc").catch(() => null);
  const target = files.find(f => f.path === last) || files[0];
  if (target) await openDoc(target);
}

/* ---------------- Recent folders ---------------- */
const getRecents = () => idbGet("recents").then(v => v || []).catch(() => []);

async function addRecent(handle) {
  const list = await getRecents();
  const kept = list.filter(r => r.name !== handle.name);          // newest wins, dedupe by name
  kept.unshift({ name: handle.name, kind: handle.kind || "directory", handle, ts: Date.now() });
  await idbSet("recents", kept.slice(0, 10)).catch(() => {});
  await renderRecents();
}

async function removeRecent(name) {
  const wasActive = name === state.rootName;
  const list = await getRecents();
  await idbSet("recents", list.filter(r => r.name !== name)).catch(() => {});
  if (wasActive) closeLibrary();   // also clears it from the current view
  else await renderRecents();
  toast(`Removed “${name}” from recents`);
}

async function openRecent(entry) {
  const h = entry.handle; if (!h) return;
  try {
    let perm = await h.queryPermission({ mode: "readwrite" });
    if (perm !== "granted") perm = await h.requestPermission({ mode: "readwrite" });
    if (perm !== "granted") { toast("Permission needed to open that folder"); return; }
    await setRoot(h);
    if (innerWidth <= 820) setSidebar(false);
  } catch (e) {
    console.warn(e);
    toast("Couldn’t open — the folder may have moved or been removed");
  }
}

function relTime(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return Math.floor(s / 60) + "m";
  if (s < 86400) return Math.floor(s / 3600) + "h";
  if (s < 604800) return Math.floor(s / 86400) + "d";
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const FOLDER_SVG = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`;

async function renderRecents() {
  const list = await getRecents();

  recentsWrap.hidden = !list.length;
  if (list.length) {
    recentsList.innerHTML = "";
    for (const entry of list) {
      const b = document.createElement("button");
      b.className = "recent-item" + (entry.name === state.rootName ? " is-active" : "");
      b.title = entry.name;
      b.innerHTML = `${FOLDER_SVG}<span class="recent-item__name">${escapeHtml(entry.name)}</span><span class="recent-item__time">${relTime(entry.ts)}</span><span class="recent-item__rm" role="button" aria-label="Remove ${escapeHtml(entry.name)} from recents" title="Remove">×</span>`;
      b.addEventListener("click", () => openRecent(entry));
      b.querySelector(".recent-item__rm").addEventListener("click", (e) => { e.stopPropagation(); removeRecent(entry.name); });
      recentsList.appendChild(b);
    }
  }

  welcomeRecent.hidden = !list.length;
  if (list.length) {
    welcomeRecentList.innerHTML = "";
    for (const entry of list.slice(0, 6)) {
      const b = document.createElement("button");
      b.className = "recent-pill";
      b.title = entry.name;
      b.innerHTML = `${FOLDER_SVG}<span>${escapeHtml(entry.name)}</span><span class="recent-pill__rm" role="button" aria-label="Remove ${escapeHtml(entry.name)} from recents" title="Remove">×</span>`;
      b.addEventListener("click", () => openRecent(entry));
      b.querySelector(".recent-pill__rm").addEventListener("click", (e) => { e.stopPropagation(); removeRecent(entry.name); });
      welcomeRecentList.appendChild(b);
    }
  }
}

async function* walk(dir, path = "") {
  for await (const [name, handle] of dir.entries()) {
    if (name.startsWith(".") || name === "node_modules") continue;
    const p = path ? `${path}/${name}` : name;
    if (handle.kind === "file") {
      if (isMarkdown(name)) yield { name, path: p, handle };
    } else if (handle.kind === "directory") {
      yield* walk(handle, p);
    }
  }
}

function byPath(a, b) {
  const da = a.path.split("/").length, db = b.path.split("/").length;
  return a.path.localeCompare(b.path, undefined, { numeric: true });
}

function addFiles(list, replace) {
  if (replace) state.files = [];
  // de-dupe by path
  const seen = new Set(state.files.map(f => f.path));
  for (const f of list) if (!seen.has(f.path)) { state.files.push(f); seen.add(f.path); }
  state.files.sort(byPath);
  renderTree();
}

/* drag + drop */
async function handleDrop(dt) {
  const items = [...(dt.items || [])].filter(i => i.kind === "file");

  // best: real File System handles (writable)
  if (items.length && items[0].getAsFileSystemHandle) {
    const handles = await Promise.all(items.map(i => i.getAsFileSystemHandle().catch(() => null)));
    const valid = handles.filter(Boolean);
    const dir = valid.find(h => h.kind === "directory");
    if (dir) { await setRoot(dir); return; }
    const fileHandles = valid.filter(h => h.kind === "file" && isMarkdown(h.name));
    if (fileHandles.length) {
      const added = fileHandles.map(h => ({ name: h.name, path: h.name, handle: h }));
      addFiles(added, !state.files.length);
      await openDoc(added[0]);
      return;
    }
  }

  // fallback: directory entries (read-only)
  if (items.length && items[0].webkitGetAsEntry) {
    const entries = items.map(i => i.webkitGetAsEntry()).filter(Boolean);
    const collected = [];
    for (const e of entries) await readEntry(e, "", collected);
    if (collected.length) {
      state.rootName = entries[0]?.isDirectory ? entries[0].name : "";
      collected.sort(byPath);
      addFiles(collected, !state.files.length);
      await openDoc(collected[0]);
      hint("Opened in read-only mode — edits will download as new files.");
      return;
    }
  }

  // last resort: plain files
  const files = [...(dt.files || [])].filter(f => isMarkdown(f.name));
  if (files.length) {
    const added = files.map(f => ({ name: f.name, path: f.webkitRelativePath || f.name, file: f }));
    addFiles(added, !state.files.length);
    await openDoc(added[0]);
  }
}

function readEntry(entry, path, out) {
  return new Promise((resolve) => {
    if (entry.isFile) {
      if (!isMarkdown(entry.name)) return resolve();
      entry.file((file) => {
        out.push({ name: entry.name, path: path ? `${path}/${entry.name}` : entry.name, file });
        resolve();
      }, resolve);
    } else if (entry.isDirectory) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") return resolve();
      const reader = entry.createReader();
      const all = [];
      const readBatch = () => reader.readEntries(async (batch) => {
        if (!batch.length) {
          for (const e of all) await readEntry(e, path ? `${path}/${entry.name}` : entry.name, out);
          return resolve();
        }
        all.push(...batch); readBatch();
      }, resolve);
      readBatch();
    } else resolve();
  });
}

/* fallback inputs */
$("#dirFallback").addEventListener("change", (e) => {
  const files = [...e.target.files].filter(f => isMarkdown(f.name));
  if (!files.length) return;
  const added = files.map(f => ({ name: f.name, path: f.webkitRelativePath || f.name, file: f }));
  state.rootName = files[0].webkitRelativePath?.split("/")[0] || "";
  addFiles(added, true);
  openDoc(added[0]);
  hint("Opened in read-only mode — edits will download as new files.");
});
$("#fileFallback").addEventListener("change", (e) => {
  const files = [...e.target.files].filter(f => isMarkdown(f.name));
  if (!files.length) return;
  const added = files.map(f => ({ name: f.name, path: f.name, file: f }));
  addFiles(added, !state.files.length);
  openDoc(added[0]);
});

/* ---------------- File tree ---------------- */
function updateCurrentFolder() {
  const has = state.files.length > 0 || state.current != null;
  curFolder.hidden = !has;
  if (!has) return;
  curFolderName.textContent = state.rootName
    || (state.files.length ? `${state.files.length} file${state.files.length > 1 ? "s" : ""}`
        : (state.current ? state.current.name.replace(MD_RE, "") : "Document"));
}

// Clear the current library/document and return to the welcome screen.
function closeLibrary() {
  if (state.files.some(f => f.dirty) &&
      !confirm("You have unsaved changes. Discard them and start fresh?")) return;
  if (state.current) savePos(state.current);
  state.files = [];
  state.current = null;
  state.rootHandle = null;
  state.rootName = "";
  state.filter = "";
  searchInput.value = "";
  idbSet("lastDoc", "").catch(() => {});
  app.dataset.hasDoc = "false";
  reading.innerHTML = "";
  editor.value = "";
  tocList.innerHTML = "";
  docName.textContent = "No document";
  docSub.textContent = "";
  setMode("read");
  renderTree();
  renderRecents();
}

function renderTree() {
  updateCurrentFolder();
  tree.innerHTML = "";
  const q = state.filter.toLowerCase();
  const files = q ? state.files.filter(f => f.path.toLowerCase().includes(q)) : state.files;

  if (!files.length) {
    if (state.files.length) tree.innerHTML = `<p class="tree-empty">No matches</p>`;
    return;
  }

  // build nested structure
  const root = { dirs: new Map(), files: [] };
  for (const f of files) {
    const parts = f.path.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const d = parts[i];
      if (!node.dirs.has(d)) node.dirs.set(d, { dirs: new Map(), files: [] });
      node = node.dirs.get(d);
    }
    node.files.push(f);
  }
  tree.appendChild(renderNode(root, true, !!q));
}

function renderNode(node, isRoot, expand) {
  const frag = document.createDocumentFragment();
  for (const [name, child] of [...node.dirs.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const details = document.createElement("details");
    details.open = expand || true;
    const summary = document.createElement("summary");
    summary.innerHTML = `<span class="caret"><svg viewBox="0 0 24 24" width="12" height="12"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span>${escapeHtml(name)}</span>`;
    details.appendChild(summary);
    const kids = document.createElement("div");
    kids.className = "kids";
    kids.appendChild(renderNode(child, false, expand));
    details.appendChild(kids);
    frag.appendChild(details);
  }
  for (const f of node.files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))) {
    const btn = document.createElement("button");
    btn.className = "file";
    if (f === state.current) btn.classList.add("is-active");
    if (f.dirty) btn.classList.add("is-dirty");
    btn.dataset.path = f.path;
    btn.innerHTML = `<span class="dot">●</span><span class="file__name">${escapeHtml(f.name.replace(MD_RE, ""))}</span>`;
    btn.addEventListener("click", () => { openDoc(f); if (innerWidth <= 820) setSidebar(false); });
    frag.appendChild(btn);
  }
  return frag;
}

function refreshTreeState() {
  for (const btn of $$(".file", tree)) {
    const f = state.files.find(x => x.path === btn.dataset.path);
    btn.classList.toggle("is-active", f === state.current);
    btn.classList.toggle("is-dirty", !!f?.dirty);
  }
}

/* ---------------- Open / render a document ---------------- */
async function openDoc(file) {
  if (!file) return;
  // persist current scroll position before leaving
  if (state.current) savePos(state.current);

  if (file.content == null) {
    try {
      if (file.handle) file.content = await (await file.handle.getFile()).text();
      else if (file.file) file.content = await file.file.text();
      else file.content = "";
    } catch (e) { toast("Could not read file"); return; }
  }

  state.current = file;
  app.dataset.hasDoc = "true";
  idbSet("lastDoc", file.path).catch(() => {});

  docName.textContent = file.name.replace(MD_RE, "");
  updateSub();
  renderMarkdown(file.content);
  editor.value = file.content;
  refreshTreeState();
  updateCurrentFolder();

  // restore reading position
  requestAnimationFrame(() => {
    const ratio = positions[file.path] || 0;
    readingScroll.scrollTop = ratio * (readingScroll.scrollHeight - readingScroll.clientHeight);
    updateProgress();
  });
}

function updateSub() {
  const f = state.current; if (!f) return;
  const words = (f.content.match(/\S+/g) || []).length;
  const mins = Math.max(1, Math.round(words / 220));
  const status = f.handle ? "" : (f.draft ? " · draft" : " · read-only");
  const dir = f.path.includes("/") ? f.path.split("/").slice(0, -1).join("/") + "  ·  " : "";
  docSub.textContent = `${dir}${words.toLocaleString()} words · ${mins} min${status}${f.dirty ? " · unsaved" : ""}`;
}

/* ---------------- New / blank document ---------------- */
const ensureMd = (name) => (MD_RE.test(name) ? name : name.replace(/[\/\\:]/g, "-").trim() + ".md");

function uniqueDraftPath() {
  let n = 1, p;
  do { p = n === 1 ? "Untitled.md" : `Untitled ${n}.md`; n++; }
  while (state.files.some(f => f.path === p));
  return p;
}

// Start a blank document (or one pre-filled with pasted text) in edit mode.
function newDoc(content = "") {
  if (state.current) savePos(state.current);
  const f = { name: "Untitled.md", path: uniqueDraftPath(), content, handle: null, file: null, dirty: false, draft: true };
  state.files.push(f);
  renderTree();
  state.current = f;
  app.dataset.hasDoc = "true";
  docName.textContent = "Untitled";
  editor.value = content;
  renderMarkdown(content);
  updateSub();
  refreshTreeState();
  setMode("split");
  editor.focus();
  editor.setSelectionRange(content.length, content.length);
}

// Derive a draft's name/title from its first H1 as you type.
function deriveDraftTitle(f) {
  if (!f.draft) return;
  const m = editor.value.match(/^\s{0,3}#\s+(.+?)\s*#*\s*$/m);
  const title = (m && m[1].trim()) || "Untitled";
  const name = ensureMd(title);
  if (f.name !== name) {
    f.name = name;
    docName.textContent = title;
    renderTree();
    refreshTreeState();
  }
}

/* ---------------- Editing ---------------- */
const liveRender = debounce(() => {
  if (!state.current) return;
  state.current.content = editor.value;
  if (app.dataset.mode === "split") renderMarkdown(editor.value);
  deriveDraftTitle(state.current);
  markDirty();
}, 140);

editor.addEventListener("input", liveRender);

// Undo-safe text insertion (execCommand keeps the native undo stack alive).
function edInsert(str) {
  if (!document.execCommand("insertText", false, str)) {
    const s = editor.selectionStart, e = editor.selectionEnd;
    editor.setRangeText(str, s, e, "end");
    editor.dispatchEvent(new Event("input", { bubbles: true }));
  }
}
function edReplace(start, end, str) {
  editor.focus();
  editor.setSelectionRange(start, end);
  edInsert(str);
}
function wrapSel(pre, post) {
  const s = editor.selectionStart, en = editor.selectionEnd;
  const sel = editor.value.slice(s, en);
  edReplace(s, en, pre + sel + post);
  if (s === en) { const p = s + pre.length; editor.setSelectionRange(p, p); }
  else editor.setSelectionRange(s + pre.length, s + pre.length + sel.length);
}
function linkSel() {
  const s = editor.selectionStart, en = editor.selectionEnd;
  const sel = editor.value.slice(s, en) || "text";
  edReplace(s, en, `[${sel}](url)`);
  const us = s + sel.length + 3;            // position of "url"
  editor.setSelectionRange(us, us + 3);
}
function indentLines() {
  const v = editor.value, s = editor.selectionStart, en = editor.selectionEnd;
  const ls = v.lastIndexOf("\n", s - 1) + 1;
  const block = v.slice(ls, en);
  edReplace(ls, en, block.replace(/^/gm, "  "));
  editor.setSelectionRange(s + 2, en + 2 * block.split("\n").length);
}
function outdentLines() {
  const v = editor.value, s = editor.selectionStart, en = editor.selectionEnd;
  const ls = v.lastIndexOf("\n", s - 1) + 1;
  const block = v.slice(ls, en);
  let first = 0, total = 0;
  const out = block.split("\n").map((ln, i) => {
    const mm = ln.match(/^( {1,2}|\t)/);
    if (mm) { total += mm[1].length; if (i === 0) first = mm[1].length; return ln.slice(mm[1].length); }
    return ln;
  }).join("\n");
  edReplace(ls, en, out);
  editor.setSelectionRange(Math.max(ls, s - first), en - total);
}

// Smart writing: continue lists/quotes, indent, and format shortcuts.
editor.addEventListener("keydown", (e) => {
  const meta = e.metaKey || e.ctrlKey;
  const v = editor.value, s = editor.selectionStart, en = editor.selectionEnd;

  if (meta && !e.altKey && !e.shiftKey) {
    const k = e.key.toLowerCase();
    if (k === "b") { e.preventDefault(); wrapSel("**", "**"); return; }
    if (k === "i") { e.preventDefault(); wrapSel("*", "*"); return; }
    if (k === "k") { e.preventDefault(); linkSel(); return; }
  }

  if (e.key === "Tab") { e.preventDefault(); e.shiftKey ? outdentLines() : indentLines(); return; }

  if (e.key === "Enter" && !e.shiftKey && !meta && s === en) {
    const ls = v.lastIndexOf("\n", s - 1) + 1;
    const line = v.slice(ls, s);
    // list / task item
    const m = line.match(/^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/);
    if (m) {
      if (line.slice(m[0].length).trim() === "") { e.preventDefault(); edReplace(ls, s, m[1]); return; }
      e.preventDefault();
      const ord = m[2].match(/^(\d+)([.)])$/);
      const marker = ord ? `${parseInt(ord[1], 10) + 1}${ord[2]} ` : `${m[2]} `;
      edInsert("\n" + m[1] + marker + (m[3] ? "[ ] " : ""));
      return;
    }
    // blockquote
    const q = line.match(/^(\s*>(?: )?)+/);
    if (q) {
      if (line.replace(/^(\s*>\s?)+/, "").trim() === "") { e.preventDefault(); edReplace(ls, s, ""); return; }
      e.preventDefault(); edInsert("\n" + q[0]); return;
    }
  }
});

function markDirty() {
  const f = state.current; if (!f) return;
  f.dirty = true;
  updateSub(); refreshTreeState();
}

async function ensureWrite(handle) {
  const opts = { mode: "readwrite" };
  if ((await handle.queryPermission(opts)) === "granted") return true;
  return (await handle.requestPermission(opts)) === "granted";
}

async function saveDoc() {
  const f = state.current; if (!f) return;
  // commit editor content if in an edit view
  if (app.dataset.mode !== "read") f.content = editor.value;

  // No file on disk yet (new draft, or a read-only dropped file): offer "Save As".
  if (!f.handle && supportsFSA && window.showSaveFilePicker) {
    try {
      const handle = await showSaveFilePicker({
        suggestedName: ensureMd(f.name || "Untitled"),
        types: [{ description: "Markdown", accept: { "text/markdown": [".md", ".markdown", ".mdown", ".txt"] } }],
      });
      const w = await handle.createWritable();
      await w.write(f.content); await w.close();
      f.handle = handle; f.draft = false; f.name = handle.name;
      f.dirty = false;
      docName.textContent = f.name.replace(MD_RE, "");
      updateSub(); renderTree(); refreshTreeState(); renderMarkdown(f.content);
      toast("Saved to disk ✓");
      return;
    } catch (e) { if (e.name === "AbortError") return; console.warn(e); }
  }

  if (f.handle && f.handle.createWritable) {
    try {
      if (await ensureWrite(f.handle)) {
        const w = await f.handle.createWritable();
        await w.write(f.content); await w.close();
        f.dirty = false; updateSub(); refreshTreeState();
        renderMarkdown(f.content);
        toast("Saved to disk ✓");
        return;
      }
    } catch (e) { console.warn(e); }
  }
  downloadDoc();
  f.dirty = false; updateSub(); refreshTreeState();
}

function downloadDoc() {
  const f = state.current; if (!f) return;
  if (app.dataset.mode !== "read") f.content = editor.value;
  const blob = new Blob([f.content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = f.name.endsWith(".md") || MD_RE.test(f.name) ? f.name : f.name + ".md";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Downloaded");
}

/* ---------------- View mode ---------------- */
function setMode(mode) {
  // commit edits when switching away from an editor view into read
  if (state.current && app.dataset.mode !== "read" && mode === "read") {
    state.current.content = editor.value;
    renderMarkdown(state.current.content);
  }
  if (state.current && app.dataset.mode === "read" && mode !== "read") {
    editor.value = state.current.content;
  }
  if (mode === "split") renderMarkdown(editor.value || state.current?.content || "");
  app.dataset.mode = mode;
  $$('.seg [data-mode-val]').forEach(b => b.classList.toggle("is-on", b.dataset.modeVal === mode));
  if (mode !== "read") editor.focus();
}

/* ---------------- Theme / type settings ---------------- */
function applyPrefs() {
  document.documentElement.dataset.theme = prefs.theme;
  document.documentElement.dataset.dropcap = prefs.dropcap ? "on" : "off";
  document.documentElement.style.setProperty("--body", prefs.font === "sans" ? "var(--sans)" : "var(--serif)");
  document.documentElement.style.setProperty("--reading-scale", (prefs.size / 100).toFixed(2));
  document.documentElement.style.setProperty("--measure", prefs.width + "rem");
  app.dataset.toc = prefs.toc ? "on" : "off";

  $$('[data-theme-val]').forEach(b => b.classList.toggle("is-on", b.dataset.themeVal === prefs.theme));
  $$('[data-font-val]').forEach(b => b.classList.toggle("is-on", b.dataset.fontVal === prefs.font));
  $("#sizeRange").value = prefs.size;
  $("#widthRange").value = prefs.width;
  $("#dropcapToggle").setAttribute("aria-checked", String(prefs.dropcap));
  $("#tocBtn").classList.toggle("is-on", prefs.toc);
  const meta = document.querySelector('meta[name="theme-color"]');
  // theme-color handled by media queries; nothing else needed
}

/* ---------------- Sidebar / focus ---------------- */
function setSidebar(show) {
  app.dataset.sidebar = show ? "shown" : "hidden";
  $("#expandBtn").hidden = show;
  $("#scrim").classList.toggle("on", show && innerWidth <= 820);
}
function toggleSidebar() { setSidebar(app.dataset.sidebar === "hidden"); }

function toggleFocus() {
  const on = app.dataset.focus !== "on";
  app.dataset.focus = on ? "on" : "off";
  $("#focusBtn").classList.toggle("is-on", on);
}

/* ---------------- Scroll: progress + scrollspy ---------------- */
let ticking = false;
readingScroll.addEventListener("scroll", () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    updateProgress();
    updateActiveHeading();
    if (state.current) savePos(state.current);
    ticking = false;
  });
});

function updateProgress() {
  const max = readingScroll.scrollHeight - readingScroll.clientHeight;
  const r = max > 0 ? readingScroll.scrollTop / max : 0;
  progressBar.style.width = (r * 100).toFixed(2) + "%";
}

function updateActiveHeading() {
  const heads = $$("h1, h2, h3, h4", reading);
  if (!heads.length) return;
  const top = readingScroll.scrollTop + 100;
  let active = heads[0];
  for (const h of heads) { if (h.offsetTop <= top) active = h; else break; }
  for (const a of $$("a", tocList)) {
    const on = a.dataset.id === active.id;
    a.classList.toggle("is-active", on);
    if (on) a.scrollIntoView({ block: "nearest" });
  }
}

function savePos(file) {
  const max = readingScroll.scrollHeight - readingScroll.clientHeight;
  positions[file.path] = max > 0 ? readingScroll.scrollTop / max : 0;
  savePositions();
}

/* ---------------- Popover ---------------- */
function toggleTypePop(anchor) {
  if (!typePop.hidden) { typePop.hidden = true; return; }
  const r = anchor.getBoundingClientRect();
  typePop.hidden = false;
  const w = typePop.offsetWidth;
  typePop.style.top = (r.bottom + 8) + "px";
  typePop.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + "px";
}
document.addEventListener("click", (e) => {
  if (!typePop.hidden && !typePop.contains(e.target) && e.target.closest("#typeBtn") == null)
    typePop.hidden = true;
});

/* ---------------- Toast / hint ---------------- */
let toastT;
function toast(msg) {
  toastEl.textContent = msg; toastEl.hidden = false;
  requestAnimationFrame(() => toastEl.classList.add("is-show"));
  clearTimeout(toastT);
  toastT = setTimeout(() => {
    toastEl.classList.remove("is-show");
    setTimeout(() => (toastEl.hidden = true), 240);
  }, 2200);
}
function hint(msg) { welcomeHint.textContent = msg; toast(msg); }

/* ---------------- Utilities ---------------- */
function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ============================================================
   Wiring
   ============================================================ */
function wire() {
  // sources
  $("#newDocBtn").addEventListener("click", () => newDoc());
  $("#openFolderBtn").addEventListener("click", openFolder);
  $("#openFilesBtn").addEventListener("click", openFiles);
  $("#welcomeNew").addEventListener("click", () => newDoc());
  $("#welcomeFolder").addEventListener("click", openFolder);
  $("#welcomeFiles").addEventListener("click", openFiles);
  $("#welcomeSample").addEventListener("click", openSample);

  // sidebar / focus
  $("#collapseBtn").addEventListener("click", () => setSidebar(false));
  $("#expandBtn").addEventListener("click", () => setSidebar(true));
  $("#scrim").addEventListener("click", () => setSidebar(false));
  $("#closeFolderBtn").addEventListener("click", closeLibrary);
  $("#focusBtn").addEventListener("click", toggleFocus);

  // search
  searchInput.addEventListener("input", debounce(() => { state.filter = searchInput.value.trim(); renderTree(); }, 120));

  // mode segmented
  $$('.seg [data-mode-val]').forEach(b => b.addEventListener("click", () => setMode(b.dataset.modeVal)));

  // actions
  $("#saveBtn").addEventListener("click", saveDoc);
  $("#downloadBtn").addEventListener("click", downloadDoc);
  $("#tocBtn").addEventListener("click", () => { prefs.toc = !prefs.toc; savePrefs(); applyPrefs(); });
  $("#typeBtn").addEventListener("click", () => toggleTypePop($("#typeBtn")));

  // theme buttons (both groups)
  $$('[data-theme-val]').forEach(b => b.addEventListener("click", () => {
    prefs.theme = b.dataset.themeVal; savePrefs(); applyPrefs();
  }));
  // font + dropcap + sliders
  $$('[data-font-val]').forEach(b => b.addEventListener("click", () => { prefs.font = b.dataset.fontVal; savePrefs(); applyPrefs(); }));
  $("#sizeRange").addEventListener("input", (e) => { prefs.size = +e.target.value; savePrefs(); applyPrefs(); });
  $("#widthRange").addEventListener("input", (e) => { prefs.width = +e.target.value; savePrefs(); applyPrefs(); });
  $("#dropcapToggle").addEventListener("click", () => { prefs.dropcap = !prefs.dropcap; savePrefs(); applyPrefs(); });

  // recent folders
  recentsToggle.addEventListener("click", () => {
    const open = recentsWrap.classList.toggle("open");
    recentsToggle.setAttribute("aria-expanded", String(open));
  });

  // drag + drop (whole window)
  const dz = $("#dropzone");
  let dragDepth = 0;
  window.addEventListener("dragenter", (e) => { e.preventDefault(); if (++dragDepth === 1) dz.classList.add("is-active"); });
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("dragleave", (e) => { e.preventDefault(); if (--dragDepth <= 0) { dragDepth = 0; dz.classList.remove("is-active"); } });
  window.addEventListener("drop", async (e) => {
    e.preventDefault(); dragDepth = 0; dz.classList.remove("is-active");
    await handleDrop(e.dataTransfer);
  });

  // keyboard
  window.addEventListener("keydown", onKey);

  // warn on unsaved
  window.addEventListener("beforeunload", (e) => {
    if (state.files.some(f => f.dirty)) { e.preventDefault(); e.returnValue = ""; }
  });

  // add focus-exit hint element
  const fx = document.createElement("div");
  fx.className = "focus-exit"; fx.textContent = "press f or esc to exit";
  document.body.appendChild(fx);
}

function onKey(e) {
  const meta = e.metaKey || e.ctrlKey;
  const inField = /input|textarea/i.test(e.target.tagName);

  if (meta && e.key.toLowerCase() === "s") { e.preventDefault(); saveDoc(); return; }
  if (meta && e.key.toLowerCase() === "o") { e.preventDefault(); openFolder(); return; }
  if (meta && e.key.toLowerCase() === "e") { e.preventDefault(); setMode(app.dataset.mode === "read" ? "split" : "read"); return; }
  if (meta && e.key === "\\") { e.preventDefault(); toggleSidebar(); return; }

  if (e.key === "Escape") {
    if (!typePop.hidden) { typePop.hidden = true; return; }
    if (app.dataset.focus === "on") { toggleFocus(); return; }
  }
  if (inField) return;

  if (e.key === "/") { e.preventDefault(); setSidebar(true); searchInput.focus(); }
  else if (e.key === "t") { prefs.toc = !prefs.toc; savePrefs(); applyPrefs(); }
  else if (e.key === "f") { toggleFocus(); }
}

/* ---------------- Sample document ---------------- */
function openSample() {
  const f = { name: "Welcome to mdread.md", path: "Welcome to mdread.md", content: SAMPLE, handle: null, file: null };
  state.current = f;
  app.dataset.hasDoc = "true";
  docName.textContent = "Welcome to mdread";
  updateSub();
  renderMarkdown(SAMPLE);
  editor.value = SAMPLE;
  updateCurrentFolder();
}

/* ---------------- Init ---------------- */
async function init() {
  applyPrefs();
  setSidebar(innerWidth > 820);   // start collapsed on phones
  app.dataset.mode = "read";
  wire();

  if (!supportsFSA) {
    hint("Your browser can't save to disk directly — files open read-only and edits download. (Chrome/Edge support live editing.)");
  }

  // restore recent folders; auto-open the most recent if still permitted
  try {
    await idbDel("root").catch(() => {});        // drop the deprecated key so a removed folder can't resurrect
    const recents = await getRecents();
    await renderRecents();
    const h = recents[0]?.handle;
    if (h && (await h.queryPermission({ mode: "readwrite" })) === "granted") {
      await setRoot(h);
    }
  } catch {}

  // register service worker for offline
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

document.addEventListener("DOMContentLoaded", init);

/* ---------------- Sample markdown ---------------- */
const SAMPLE = `# A quiet reading room

mdread turns any markdown file into something worth lingering over. Drop a single file or an entire folder onto this page — it all stays on your device, and nothing is ever uploaded.

> "The reading of all good books is like a conversation with the finest minds of past centuries."
> — René Descartes

## What you can do

- **Read** with typography tuned for long-form text
- **Edit** in place and save straight back to disk
- **Download** any document as a clean \`.md\` file
- Switch between **Day**, **Sepia**, and **Night** to suit the light

This is a *local-first* tool. Open a folder once and mdread remembers it — your library is waiting the next time you visit.

### A few touches for the eyes

Headings use a characterful display serif, while body copy is set in a face designed for reading on screens. The measure is held to a comfortable width, the line height is generous, and footnotes, tables, and code all have a considered home.

| Feature        | Read | Edit | Download |
| -------------- | :--: | :--: | :------: |
| Single file    |  ✓   |  ✓   |    ✓     |
| Whole folder   |  ✓   |  ✓   |    ✓     |
| Works offline  |  ✓   |  ✓   |    ✓     |

### Code feels at home too

\`\`\`js
// syntax highlighting, tuned to the paper
function greet(name) {
  const hour = new Date().getHours();
  const part = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  return \`Good \${part}, \${name}. Happy reading.\`;
}
\`\`\`

### A checklist, because why not

- [x] Drop a file or folder
- [x] Pick a theme that suits the hour
- [ ] Lose an afternoon to a good document

---

Ready? Open a folder from the sidebar, or just drag one anywhere onto this page.
`;
