import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createDamaEngineManager, validateRemoteDescriptor } = require("../electron/dama-engine.cjs");
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

  const packagedResources = path.join(temporaryDirectory, "packaged-resources");
  await fs.mkdir(packagedResources, { recursive: true });
  await fs.cp(payloadDirectory, path.join(packagedResources, "dama-engine"), { recursive: true });
  const originalResourcesPath = process.resourcesPath;
  process.resourcesPath = packagedResources;
  try {
    const packagedManager = createDamaEngineManager({ ...fakeApp, isPackaged: true }, projectDirectory);
    const migrated = await packagedManager.status({ verify: true });
    assert.equal(migrated.installed, true);
    assert.equal(migrated.verified, true);
    assert.match(migrated.location, /components[\\/]dama-ai$/);
    assert.equal(await fs.readFile(path.join(migrated.location, "Dama.ps1"), "utf8"), payload);
  } finally {
    if (originalResourcesPath === undefined) delete process.resourcesPath;
    else process.resourcesPath = originalResourcesPath;
  }
  assert.throws(() => validateRemoteDescriptor({ id: "outro", version: "1.0.0", asset: "Dama-AI-Component-1.0.0.zip", sha256: "a".repeat(64), size: 10 }), /não pertence/i);

  const remoteUserData = path.join(temporaryDirectory, "remote-user-data");
  const remotePayload = path.join(temporaryDirectory, "remote-payload");
  const remoteProfile = "Perfil oficial de teste do Dama AI.\n";
  const archiveBytes = Buffer.from("arquivo-zip-simulado");
  await fs.mkdir(remotePayload, { recursive: true });
  await fs.writeFile(path.join(remotePayload, "profile.md"), remoteProfile, "utf8");
  await fs.writeFile(path.join(remotePayload, "manifest.json"), JSON.stringify({
    id: "dama-ai",
    version: "1.1.0",
    source: "Componente remoto de teste",
    features: ["instalação posterior"],
    promptFile: "profile.md",
    files: [{ path: "profile.md", size: Buffer.byteLength(remoteProfile), sha256: createHash("sha256").update(remoteProfile).digest("hex") }],
  }), "utf8");
  const descriptor = {
    id: "dama-ai",
    version: "1.1.0",
    asset: "Dama-AI-Component-1.1.0.zip",
    size: archiveBytes.length,
    sha256: createHash("sha256").update(archiveBytes).digest("hex"),
  };
  const remoteProgress = [];
  const remoteManager = createDamaEngineManager({ isPackaged: false, getPath: () => remoteUserData }, projectDirectory, {
    manifestUrl: "https://example.test/dama-ai-component.json",
    allowInsecureDownloads: true,
    onProgress: (state) => remoteProgress.push(state),
    fetchImpl: async (url) => String(url).endsWith(".json")
      ? new Response(JSON.stringify(descriptor), { status: 200, headers: { "Content-Type": "application/json" } })
      : new Response(archiveBytes, { status: 200, headers: { "Content-Length": String(archiveBytes.length) } }),
    extractArchive: async (_archive, destination) => fs.cp(remotePayload, destination, { recursive: true }),
  });
  const remotelyInstalled = await remoteManager.installRemoteComponent();
  assert.equal(remotelyInstalled.installed, true);
  assert.equal(remotelyInstalled.verified, true);
  assert.equal(remotelyInstalled.version, "1.1.0");
  assert.match(await remoteManager.promptAddon(), /Perfil oficial de teste/);
  assert.ok(remoteProgress.some((item) => item.status === "downloading"));
  assert.equal(remoteProgress.at(-1).status, "done");
  console.log("Dama AI: instalação, integridade e remoção local confirmadas.");
} finally {
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
}
