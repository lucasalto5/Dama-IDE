import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { validateStructuredFile, normalizedToolFileContent } = require("../electron/file-content.cjs");

assert.equal(normalizedToolFileContent("package.json", { name: "teste", scripts: { start: "node index.js" } }), '{\n  "name": "teste",\n  "scripts": {\n    "start": "node index.js"\n  }\n}\n');
assert.equal(validateStructuredFile("config.json", '{"ok":true}'), '{\n  "ok": true\n}\n');
assert.throws(() => validateStructuredFile("package.json", "[object Object]"), /documento JSON real/);
assert.throws(() => validateStructuredFile("package.json", '{"name":}'), /não é JSON válido/);
assert.equal(normalizedToolFileContent("README.md", "# Projeto"), "# Projeto");
assert.throws(() => normalizedToolFileContent("README.md", { title: "Projeto" }), /precisa ser texto/);

console.log("Validação de conteúdo das ferramentas: OK");
