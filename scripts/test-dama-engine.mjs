import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createDamaEngineManager } = require("../electron/dama-engine.cjs");
const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "dama-engine-test-"));
const projectDirectory = path.join(temporaryDirectory, "project");
const payloadDirectory = path.join(projectDirectory, "dama-engine-payload");
const fakeApp = {
  isPackaged: false,
  getPath(name) {
    assert.equal(name, "userData");
    return temporaryDirectory;
  },
};

try {
  await fs.mkdir(payloadDirectory, { recursive: true });
  const payload = "Write-Output 'Dama test payload'\n";
  await fs.writeFile(path.join(payloadDirectory, "Dama.ps1"), payload, "utf8");
  await fs.writeFile(path.join(payloadDirectory, "manifest.json"), JSON.stringify({
    id: "dama-ai",
    version: "1.0.0",
    source: "Fixture local de teste",
    features: ["teste"],
    promptAddon: "Carnaval IA fixture",
    files: [{ path: "Dama.ps1", size: Buffer.byteLength(payload), sha256: createHash("sha256").update(payload).digest("hex") }],
  }), "utf8");
  const manager = createDamaEngineManager(fakeApp, projectDirectory);
  const before = await manager.status();
  assert.equal(before.installed, false);
  const installed = await manager.installDevelopmentPayload();
  assert.equal(installed.installed, true);
  assert.equal(installed.verified, true);
  assert.equal(installed.version, "1.0.0");
  assert.match(await manager.promptAddon(), /Carnaval IA/i);
  const removed = await manager.removeUserComponent();
  assert.equal(removed.installed, false);
  console.log("Dama AI: instalação, integridade e remoção local confirmadas.");
} finally {
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
}
