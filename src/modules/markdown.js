/* Markdown → sanitized HTML → reading surface, plus heading anchors and TOC.
   marked, DOMPurify and highlight.js are now bundled dependencies (they used to
   be vendored globals), so they're always present — no window guards needed. */

import { marked } from "marked";
import DOMPurify from "dompurify";
// /lib/common = ~35 common languages, matching the original vendored build
// (~120 KB). The full "highlight.js" entry bundles ~190 languages (~980 KB).
import hljs from "highlight.js/lib/common";

import { $$, reading, tocList } from "./dom.js";
import { slug } from "./util.js";

marked.setOptions({ gfm: true, breaks: false });

export function renderMarkdown(md) {
  const raw = marked.parse(md);
  const clean = DOMPurify.sanitize(raw, { ADD_ATTR: ["target"] });
  reading.innerHTML = clean;

  // heading ids + anchors → TOC
  const heads = $$("h1, h2, h3, h4", reading);
  const seen = {};
  const items = [];
  for (const h of heads) {
    let id = slug(h.textContent);
    if (seen[id]) id = `${id}-${++seen[id]}`;
    else seen[id] = 1;
    h.id = id;
    const a = document.createElement("a");
    a.className = "anchor";
    a.href = `#${id}`;
    a.textContent = "¶";
    a.setAttribute("aria-hidden", "true");
    h.appendChild(a);
    items.push({
      id,
      text: h.firstChild?.textContent?.trim() || h.textContent.replace("¶", "").trim(),
      level: +h.tagName[1],
    });
  }
  buildToc(items);

  // syntax highlight
  for (const block of $$("pre code", reading)) {
    try {
      hljs.highlightElement(block);
    } catch {}
  }

  // external links open in new tab
  for (const a of $$('a[href^="http"]', reading)) {
    if (a.host !== location.host) {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    }
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
