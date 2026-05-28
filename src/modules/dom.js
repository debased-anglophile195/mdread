/* DOM helpers, cached element references, and small shared constants.
   Module scripts run after the document is parsed, so querying elements at
   import time is safe — the same assumption the original single-file app made. */

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const MD_RE = /\.(md|markdown|mdown|mkd|mkdn|mdwn|mdx|txt)$/i;
export const isMarkdown = (n) => MD_RE.test(n);
export const supportsFSA = "showDirectoryPicker" in window;

export const FOLDER_SVG = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`;

/* ---------------- DOM refs ---------------- */
export const app = $("#app");
export const tree = $("#tree");
export const reading = $("#reading");
export const readingScroll = $("#readingScroll");
export const editor = $("#editor");
export const docName = $("#docName");
export const docSub = $("#docSub");
export const tocList = $("#tocList");
export const progressBar = $("#progressBar");
export const searchInput = $("#searchInput");
export const toastEl = $("#toast");
export const typePop = $("#typePop");
export const curFolder = $("#curFolder");
export const curFolderName = $("#curFolderName");
export const recentsWrap = $("#recentsWrap");
export const recentsToggle = $("#recentsToggle");
export const recentsList = $("#recentsList");
export const welcomeRecent = $("#welcomeRecent");
export const welcomeRecentList = $("#welcomeRecentList");
export const welcomeHint = $("#welcomeHint");
