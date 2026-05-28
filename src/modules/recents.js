/* Recently-opened folders: stored as live FS handles in IndexedDB and surfaced
   both in the sidebar list and as pills on the welcome screen. */

import { idbGet, idbSet } from "./idb.js";
import { state } from "./state.js";
import { escapeHtml, relTime } from "./util.js";
import { FOLDER_SVG, recentsWrap, recentsList, welcomeRecent, welcomeRecentList } from "./dom.js";
import { setRoot } from "./files.js";
import { closeLibrary } from "./tree.js";
import { setSidebar } from "./view.js";
import { toast } from "./ui.js";

export const getRecents = () =>
  idbGet("recents")
    .then((v) => v || [])
    .catch(() => []);

export async function addRecent(handle) {
  const list = await getRecents();
  const kept = list.filter((r) => r.name !== handle.name); // newest wins, dedupe by name
  kept.unshift({ name: handle.name, kind: handle.kind || "directory", handle, ts: Date.now() });
  await idbSet("recents", kept.slice(0, 10)).catch(() => {});
  await renderRecents();
}

export async function removeRecent(name) {
  const wasActive = name === state.rootName;
  const list = await getRecents();
  await idbSet(
    "recents",
    list.filter((r) => r.name !== name)
  ).catch(() => {});
  if (wasActive) closeLibrary(); // also clears it from the current view
  else await renderRecents();
  toast(`Removed “${name}” from recents`);
}

export async function openRecent(entry) {
  const h = entry.handle;
  if (!h) return;
  try {
    let perm = await h.queryPermission({ mode: "readwrite" });
    if (perm !== "granted") perm = await h.requestPermission({ mode: "readwrite" });
    if (perm !== "granted") {
      toast("Permission needed to open that folder");
      return;
    }
    await setRoot(h);
    if (innerWidth <= 820) setSidebar(false);
  } catch (e) {
    console.warn(e);
    toast("Couldn’t open — the folder may have moved or been removed");
  }
}

export async function renderRecents() {
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
      b.querySelector(".recent-item__rm").addEventListener("click", (e) => {
        e.stopPropagation();
        removeRecent(entry.name);
      });
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
      b.querySelector(".recent-pill__rm").addEventListener("click", (e) => {
        e.stopPropagation();
        removeRecent(entry.name);
      });
      welcomeRecentList.appendChild(b);
    }
  }
}
