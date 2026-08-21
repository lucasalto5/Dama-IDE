import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { runLsp, syncLspDocument, warmProjectLsp, handleLspFileChange, closeProjectLsp, lspManagerStatus } = require("../electron/lsp-client.cjs");
const root = await fs.mkdtemp(path.join(os.tmpdir(), "dama-lsp-"));
try {
  const file = path.join(root, "main.ts");
  await fs.writeFile(path.join(root, "package.json"), "{}", "utf8");
  await fs.writeFile(path.join(root, "tsconfig.json"), "{}", "utf8");
  await fs.writeFile(file, "export const greeting: string = 'oi';\n", "utf8");
  const warm = await warmProjectLsp(root);
  assert.deepEqual(warm.started, ["typescript"]);
  assert.equal(lspManagerStatus().length, 1);
  const symbols = await runLsp({ root, file, action: "symbols" });
  assert.equal(symbols.reused, true);
  assert.ok(Array.isArray(symbols.result));
  const sync = await syncLspDocument({ root, file, content: "export const greeting: number = 1;\n", saved: true });
  assert.equal(sync.synced, true);
  await fs.rm(file);
  const closed = await handleLspFileChange({ root, file: "main.ts" });
  assert.equal(closed.reason, "closed");
  await closeProjectLsp(root);
  assert.equal(lspManagerStatus().length, 0);
  console.log("persistent LSP manager tests passed");
} finally {
  await closeProjectLsp(root);
  await fs.rm(root, { recursive: true, force: true });
}
