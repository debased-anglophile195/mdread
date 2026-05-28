/* Reading-progress bar, TOC scroll-spy, and per-document scroll persistence. */

import { state, positions, savePositions } from "./state.js";
import { $$, reading, readingScroll, progressBar, tocList } from "./dom.js";

export function updateProgress() {
  const max = readingScroll.scrollHeight - readingScroll.clientHeight;
  const r = max > 0 ? readingScroll.scrollTop / max : 0;
  progressBar.style.width = (r * 100).toFixed(2) + "%";
}

export function updateActiveHeading() {
  const heads = $$("h1, h2, h3, h4", reading);
  if (!heads.length) return;
  const top = readingScroll.scrollTop + 100;
  let active = heads[0];
  for (const h of heads) {
    if (h.offsetTop <= top) active = h;
    else break;
  }
  for (const a of $$("a", tocList)) {
    const on = a.dataset.id === active.id;
    a.classList.toggle("is-active", on);
    if (on) a.scrollIntoView({ block: "nearest" });
  }
}

export function savePos(file) {
  const max = readingScroll.scrollHeight - readingScroll.clientHeight;
  positions[file.path] = max > 0 ? readingScroll.scrollTop / max : 0;
  savePositions();
}

export function wireScroll() {
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
}
