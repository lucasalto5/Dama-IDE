const path = require("node:path");

const previewSourceExtensions = new Set([".html", ".htm", ".jsx", ".tsx", ".js", ".ts", ".vue", ".svelte", ".astro"]);

function inspectorScript(action) {
  return `(() => {
    const ACTION = ${JSON.stringify(action)};
    const KEY = "__damaPreviewInspector";
    const selectedAttribute = "data-dama-selected";
    const hoveredAttribute = "data-dama-hovered";
    const escapeSelector = (value) => window.CSS?.escape ? window.CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, "\\\\$&");
    const selectorFor = (element) => {
      if (element.id) return "#" + escapeSelector(element.id);
      const parts = [];
      let current = element;
      while (current && current.nodeType === 1 && current !== document.documentElement) {
        let part = current.tagName.toLowerCase();
        const classes = [...current.classList].filter(name => !name.startsWith("dama-")).slice(0, 2);
        if (classes.length) part += "." + classes.map(escapeSelector).join(".");
        const siblings = current.parentElement ? [...current.parentElement.children].filter(item => item.tagName === current.tagName) : [];
        if (siblings.length > 1) part += ":nth-of-type(" + (siblings.indexOf(current) + 1) + ")";
        parts.unshift(part);
        current = current.parentElement;
        if (parts.length >= 6) break;
      }
      return parts.join(" > ");
    };
    const descriptor = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        key: element.__damaSelectionKey || (element.__damaSelectionKey = Math.random().toString(36).slice(2)),
        tag: element.tagName.toLowerCase(),
        id: element.id || "",
        classes: [...element.classList].filter(name => !name.startsWith("dama-")).slice(0, 12),
        text: (element.innerText || element.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 500),
        selector: selectorFor(element),
        outerHTML: element.outerHTML.slice(0, 3000),
        attributes: Object.fromEntries([...element.attributes].filter(item => !item.name.startsWith("data-dama-")).slice(0, 20).map(item => [item.name, item.value.slice(0, 300)])),
        rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }
      };
    };
    const destroy = () => {
      const state = window[KEY];
      if (!state) return;
      document.removeEventListener("mousemove", state.onMove, true);
      document.removeEventListener("click", state.onClick, true);
      document.querySelectorAll("[" + selectedAttribute + "],[" + hoveredAttribute + "]").forEach(el => {
        el.removeAttribute(selectedAttribute);
        el.removeAttribute(hoveredAttribute);
      });
      state.style?.remove();
      delete window[KEY];
    };
    if (ACTION === "disable") { destroy(); return { active: false, selected: [] }; }
    if (!window[KEY]) {
      const style = document.createElement("style");
      style.dataset.damaInspector = "true";
      style.textContent = '[data-dama-hovered="true"]{outline:1px dashed rgba(255,255,255,.8)!important;outline-offset:2px!important;cursor:crosshair!important}[data-dama-selected="true"]{outline:2px solid #fff!important;outline-offset:3px!important;box-shadow:0 0 0 1px rgba(0,0,0,.65),0 0 0 5px rgba(235,166,67,.34)!important}';
      document.documentElement.appendChild(style);
      const state = { style, selected: new Map(), hovered: null };
      state.onMove = (event) => {
        if (!(event.target instanceof Element)) return;
        if (state.hovered && state.hovered !== event.target) state.hovered.removeAttribute(hoveredAttribute);
        state.hovered = event.target;
        if (!state.selected.has(event.target)) event.target.setAttribute(hoveredAttribute, "true");
      };
      state.onClick = (event) => {
        if (!(event.target instanceof Element)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const element = event.target;
        if (!event.shiftKey) {
          for (const selected of state.selected.keys()) selected.removeAttribute(selectedAttribute);
          state.selected.clear();
        }
        if (state.selected.has(element) && event.shiftKey) {
          state.selected.delete(element);
          element.removeAttribute(selectedAttribute);
        } else {
          state.selected.set(element, descriptor(element));
          element.setAttribute(selectedAttribute, "true");
          element.removeAttribute(hoveredAttribute);
        }
      };
      document.addEventListener("mousemove", state.onMove, true);
      document.addEventListener("click", state.onClick, true);
      window[KEY] = state;
    }
    if (ACTION === "clear") {
      for (const selected of window[KEY].selected.keys()) selected.removeAttribute(selectedAttribute);
      window[KEY].selected.clear();
    }
    return { active: true, selected: [...window[KEY].selected.values()] };
  })()`;
}

function meaningfulText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function lineAt(content, offset) {
  return String(content).slice(0, Math.max(0, offset)).split(/\r?\n/).length;
}

function bestOccurrence(content, descriptor) {
  const candidates = [];
  const add = (needle, score, kind) => {
    const clean = meaningfulText(needle);
    if (!clean || clean.length < 2) return;
    const offset = content.indexOf(clean);
    if (offset >= 0) candidates.push({ offset, score, kind, needle: clean });
  };
  if (descriptor.id) {
    add(`id="${descriptor.id}"`, 120, "id");
    add(`id='${descriptor.id}'`, 120, "id");
    add(`id={"${descriptor.id}"}`, 115, "id");
  }
  for (const className of descriptor.classes || []) {
    add(className, 20, "class");
  }
  const text = meaningfulText(descriptor.text);
  if (text) {
    add(text.slice(0, 180), Math.min(100, 40 + text.length / 3), "text");
    if (text.length > 50) add(text.slice(0, 50), 35, "text");
  }
  const tagNeedle = `<${descriptor.tag}`;
  const tagOffset = content.indexOf(tagNeedle);
  if (tagOffset >= 0) candidates.push({ offset: tagOffset, score: 8, kind: "tag", needle: tagNeedle });
  if (!candidates.length) return null;
  candidates.sort((left, right) => right.score - left.score);
  return candidates[0];
}

function sourceRange(content, occurrence, descriptor) {
  const lines = String(content).split(/\r?\n/);
  const anchorLine = lineAt(content, occurrence.offset);
  const tag = String(descriptor.tag || "").toLowerCase();
  let startLine = Math.max(1, anchorLine);
  for (let line = anchorLine - 1; line >= Math.max(0, anchorLine - 12); line -= 1) {
    if (lines[line]?.toLowerCase().includes(`<${tag}`)) { startLine = line + 1; break; }
  }
  let endLine = startLine;
  const close = tag && !["img", "input", "br", "hr", "meta", "link", "source"].includes(tag) ? `</${tag}>` : null;
  if (close) {
    for (let line = startLine - 1; line < Math.min(lines.length, startLine + 120); line += 1) {
      if (lines[line]?.toLowerCase().includes(close)) { endLine = line + 1; break; }
    }
  }
  if (endLine === startLine) endLine = Math.min(lines.length, startLine + Math.min(8, Math.max(0, String(descriptor.outerHTML || "").split(/\r?\n/).length - 1)));
  return { startLine, endLine };
}

function resolveElementReferences(files, descriptors) {
  const sources = (files || []).filter(file => previewSourceExtensions.has(path.extname(file.path).toLowerCase()));
  return (descriptors || []).slice(0, 30).map((descriptor) => {
    const matches = [];
    for (const file of sources) {
      const occurrence = bestOccurrence(String(file.content || ""), descriptor);
      if (!occurrence) continue;
      let score = occurrence.score;
      if (/^(?:src\/)?(?:app|pages|components|index)/i.test(file.path)) score += 5;
      if (/\.(?:tsx|jsx|vue|svelte|astro|html?)$/i.test(file.path)) score += 8;
      matches.push({ file, occurrence, score });
    }
    matches.sort((left, right) => right.score - left.score);
    const best = matches[0];
    const range = best ? sourceRange(best.file.content, best.occurrence, descriptor) : { startLine: null, endLine: null };
    const labelText = meaningfulText(descriptor.text).slice(0, 44);
    return {
      ...descriptor,
      path: best?.file.path || null,
      startLine: range.startLine,
      endLine: range.endLine,
      label: labelText || descriptor.id || descriptor.selector || `<${descriptor.tag}>`,
      confidence: best ? (best.score >= 100 ? "high" : best.score >= 45 ? "medium" : "low") : "unresolved",
    };
  });
}

async function executeInspectorAction({ url, action, findFrame, optional = false, delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)) }) {
  if (!/^https?:\/\//i.test(String(url || ""))) {
    if (optional || action === "disable" || action === "clear") return { active: false, selected: [] };
    throw new Error("Abra uma URL HTTP ou HTTPS no Preview antes de selecionar elementos.");
  }
  const tolerant = optional || action === "disable" || action === "clear";
  const attempts = tolerant ? 1 : 20;
  let frame = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    frame = findFrame(url);
    if (frame) break;
    if (attempt < attempts - 1) await delay(100);
  }
  if (!frame) {
    if (tolerant) return { active: false, selected: [], loading: true };
    throw new Error("O Preview não respondeu ao inspetor. Recarregue a página e tente novamente.");
  }
  try {
    return await frame.executeJavaScript(inspectorScript(action), true);
  } catch (error) {
    if (tolerant) return { active: false, selected: [], loading: true };
    throw error;
  }
}

module.exports = { inspectorScript, resolveElementReferences, executeInspectorAction };
