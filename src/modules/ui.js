/* Transient UI: the reading-settings popover, toasts, and welcome-screen hints. */

import { typePop, toastEl, welcomeHint } from "./dom.js";

export function toggleTypePop(anchor) {
  if (!typePop.hidden) {
    typePop.hidden = true;
    return;
  }
  const r = anchor.getBoundingClientRect();
  typePop.hidden = false;
  const w = typePop.offsetWidth;
  typePop.style.top = r.bottom + 8 + "px";
  typePop.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + "px";
}

// Dismiss the popover on any outside click. Wired once from main.
export function wireUi() {
  document.addEventListener("click", (e) => {
    if (!typePop.hidden && !typePop.contains(e.target) && e.target.closest("#typeBtn") == null)
      typePop.hidden = true;
  });
}

let toastT;
export function toast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  requestAnimationFrame(() => toastEl.classList.add("is-show"));
  clearTimeout(toastT);
  toastT = setTimeout(() => {
    toastEl.classList.remove("is-show");
    setTimeout(() => (toastEl.hidden = true), 240);
  }, 2200);
}

export function hint(msg) {
  welcomeHint.textContent = msg;
  toast(msg);
}
