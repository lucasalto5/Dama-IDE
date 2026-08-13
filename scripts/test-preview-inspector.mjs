import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { inspectorScript, resolveElementReferences, executeInspectorAction } = require("../electron/preview-inspector.cjs");

const files = [
  { path: "src/App.tsx", content: `export function App() {\n  return (\n    <main>\n      <h1 id="hero-title" className="headline">Construa com a Dama</h1>\n      <button className="primary action">Começar agora</button>\n    </main>\n  );\n}\n` },
  { path: "index.html", content: "<div>Outro conteúdo</div>" },
];

const references = resolveElementReferences(files, [
  { key: "one", tag: "h1", id: "hero-title", classes: ["headline"], text: "Construa com a Dama", selector: "#hero-title", outerHTML: '<h1 id="hero-title">Construa com a Dama</h1>', attributes: {}, rect: {} },
  { key: "two", tag: "button", id: "", classes: ["primary", "action"], text: "Começar agora", selector: "main > button.primary.action", outerHTML: '<button class="primary action">Começar agora</button>', attributes: {}, rect: {} },
]);

assert.equal(references.length, 2);
assert.equal(references[0].path, "src/App.tsx");
assert.equal(references[0].startLine, 4);
assert.equal(references[0].confidence, "high");
assert.equal(references[1].path, "src/App.tsx");
assert.ok(references[1].startLine >= 4 && references[1].startLine <= 5);
assert.match(inspectorScript("enable"), /data-dama-selected/);
assert.match(inspectorScript("disable"), /ACTION === "disable"/);
const missingDisable = await executeInspectorAction({ url: "http://127.0.0.1:4173", action: "disable", findFrame: () => null, delay: async () => {} });
assert.deepEqual(missingDisable.selected, []);
assert.equal(missingDisable.active, false);
const destroyedFrameDisable = await executeInspectorAction({ url: "http://127.0.0.1:4173", action: "disable", findFrame: () => ({ executeJavaScript: async () => { throw new Error("frame destroyed"); } }), delay: async () => {} });
assert.equal(destroyedFrameDisable.active, false);
await assert.rejects(() => executeInspectorAction({ url: "http://127.0.0.1:4173", action: "enable", findFrame: () => null, delay: async () => {} }), /não respondeu/);

console.log("Preview inspector: seleção, linhas e limpeza idempotente verificadas.");
