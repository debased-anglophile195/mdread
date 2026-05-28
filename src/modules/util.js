/* Small pure helpers shared across modules. No DOM, no state. */

import { MD_RE } from "./dom.js";

export function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

export function escapeHtml(s) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

export function slug(s) {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[¶]/g, "")
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "section"
  );
}

export function relTime(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return Math.floor(s / 60) + "m";
  if (s < 86400) return Math.floor(s / 3600) + "h";
  if (s < 604800) return Math.floor(s / 86400) + "d";
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export const ensureMd = (name) => (MD_RE.test(name) ? name : name.replace(/[\/\\:]/g, "-").trim() + ".md");

export function byPath(a, b) {
  return a.path.localeCompare(b.path, undefined, { numeric: true });
}

export function readJSON(k) {
  try {
    return JSON.parse(localStorage.getItem(k)) || {};
  } catch {
    return {};
  }
}
