/* The markdown editor: live preview, dirty tracking, undo-safe insertion, and
   smart-writing keys (continue lists/quotes, indent, bold/italic/link). */

import { state } from "./state.js";
import { app, editor } from "./dom.js";
import { debounce } from "./util.js";
import { renderMarkdown } from "./markdown.js";
import { deriveDraftTitle, updateSub } from "./document.js";
import { refreshTreeState } from "./tree.js";

const liveRender = debounce(() => {
  if (!state.current) return;
  state.current.content = editor.value;
  if (app.dataset.mode === "split") renderMarkdown(editor.value);
  deriveDraftTitle(state.current);
  markDirty();
}, 140);

// Undo-safe text insertion (execCommand keeps the native undo stack alive).
function edInsert(str) {
  if (!document.execCommand("insertText", false, str)) {
    const s = editor.selectionStart,
      e = editor.selectionEnd;
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
  const s = editor.selectionStart,
    en = editor.selectionEnd;
  const sel = editor.value.slice(s, en);
  edReplace(s, en, pre + sel + post);
  if (s === en) {
    const p = s + pre.length;
    editor.setSelectionRange(p, p);
  } else editor.setSelectionRange(s + pre.length, s + pre.length + sel.length);
}

function linkSel() {
  const s = editor.selectionStart,
    en = editor.selectionEnd;
  const sel = editor.value.slice(s, en) || "text";
  edReplace(s, en, `[${sel}](url)`);
  const us = s + sel.length + 3; // position of "url"
  editor.setSelectionRange(us, us + 3);
}

function indentLines() {
  const v = editor.value,
    s = editor.selectionStart,
    en = editor.selectionEnd;
  const ls = v.lastIndexOf("\n", s - 1) + 1;
  const block = v.slice(ls, en);
  edReplace(ls, en, block.replace(/^/gm, "  "));
  editor.setSelectionRange(s + 2, en + 2 * block.split("\n").length);
}

function outdentLines() {
  const v = editor.value,
    s = editor.selectionStart,
    en = editor.selectionEnd;
  const ls = v.lastIndexOf("\n", s - 1) + 1;
  const block = v.slice(ls, en);
  let first = 0,
    total = 0;
  const out = block
    .split("\n")
    .map((ln, i) => {
      const mm = ln.match(/^( {1,2}|\t)/);
      if (mm) {
        total += mm[1].length;
        if (i === 0) first = mm[1].length;
        return ln.slice(mm[1].length);
      }
      return ln;
    })
    .join("\n");
  edReplace(ls, en, out);
  editor.setSelectionRange(Math.max(ls, s - first), en - total);
}

function markDirty() {
  const f = state.current;
  if (!f) return;
  f.dirty = true;
  updateSub();
  refreshTreeState();
}

// Attach the editor's input + keydown listeners. Wired once from main.
export function wireEditor() {
  editor.addEventListener("input", liveRender);

  // Smart writing: continue lists/quotes, indent, and format shortcuts.
  editor.addEventListener("keydown", (e) => {
    const meta = e.metaKey || e.ctrlKey;
    const v = editor.value,
      s = editor.selectionStart,
      en = editor.selectionEnd;

    if (meta && !e.altKey && !e.shiftKey) {
      const k = e.key.toLowerCase();
      if (k === "b") {
        e.preventDefault();
        wrapSel("**", "**");
        return;
      }
      if (k === "i") {
        e.preventDefault();
        wrapSel("*", "*");
        return;
      }
      if (k === "k") {
        e.preventDefault();
        linkSel();
        return;
      }
    }

    if (e.key === "Tab") {
      e.preventDefault();
      e.shiftKey ? outdentLines() : indentLines();
      return;
    }

    if (e.key === "Enter" && !e.shiftKey && !meta && s === en) {
      const ls = v.lastIndexOf("\n", s - 1) + 1;
      const line = v.slice(ls, s);
      // list / task item
      const m = line.match(/^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/);
      if (m) {
        if (line.slice(m[0].length).trim() === "") {
          e.preventDefault();
          edReplace(ls, s, m[1]);
          return;
        }
        e.preventDefault();
        const ord = m[2].match(/^(\d+)([.)])$/);
        const marker = ord ? `${parseInt(ord[1], 10) + 1}${ord[2]} ` : `${m[2]} `;
        edInsert("\n" + m[1] + marker + (m[3] ? "[ ] " : ""));
        return;
      }
      // blockquote
      const q = line.match(/^(\s*>(?: )?)+/);
      if (q) {
        if (line.replace(/^(\s*>\s?)+/, "").trim() === "") {
          e.preventDefault();
          edReplace(ls, s, "");
          return;
        }
        e.preventDefault();
        edInsert("\n" + q[0]);
        return;
      }
    }
  });
}
