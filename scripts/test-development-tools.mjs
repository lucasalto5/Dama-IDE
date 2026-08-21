import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const require = createRequire(import.meta.url);
const { createDevelopmentRuntime, semanticSearch, httpRequest, detectAudit, detectQuality, detectBuilds, inspectCi, detectDeploy } = require("../electron/development-tools.cjs");
const execFileAsync = promisify(execFile);

const root = await fs.mkdtemp(path.join(os.tmpdir(), "dama-development-"));
try {
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.mkdir(path.join(root, ".github", "workflows"), { recursive: true });
  await fs.writeFile(path.join(root, "src", "session.ts"), "export function refreshAccessToken() { return 'token refreshed'; }\n", "utf8");
  await fs.writeFile(path.join(root, "src", "unrelated.ts"), "export const theme = 'amber';\n", "utf8");
  await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ scripts: { build: "vite build", lint: "eslint .", deploy: "vercel" }, devDependencies: { typescript: "1", eslint: "1", prettier: "1", knip: "1" } }), "utf8");
  await fs.writeFile(path.join(root, "tsconfig.json"), "{}", "utf8");
  await fs.writeFile(path.join(root, ".github", "workflows", "test.yml"), "name: test\non: push\njobs: {}\n", "utf8");

  const semantic = await semanticSearch(root, { query: "refresh access token" });
  assert.equal(semantic.results[0].path, "src/session.ts");
  assert.equal(semantic.engine, "local-tfidf");
  assert.equal((await detectAudit(root))[0].id, "npm");
  assert.ok((await detectQuality(root)).some((item) => item.id === "lint"));
  assert.equal((await detectBuilds(root))[0].id, "npm");
  assert.equal((await inspectCi(root))[0].provider, "github");
  assert.ok((await detectDeploy(root)).some((item) => item.id === "npm:deploy"));

  await execFileAsync("git", ["init"], { cwd: root });
  await execFileAsync("git", ["config", "user.email", "dama-test@example.invalid"], { cwd: root });
  await execFileAsync("git", ["config", "user.name", "Dama Test"], { cwd: root });
  await execFileAsync("git", ["add", "."], { cwd: root });
  await execFileAsync("git", ["commit", "-m", "base"], { cwd: root });
  await fs.writeFile(path.join(root, "src", "session.ts"), "export function refreshAccessToken() { return 'changed'; }\n", "utf8");
  const dataDirectory = path.join(root, ".test-user-data");
  const runtime = createDevelopmentRuntime({ getProjectRoot: () => root, getUserData: () => dataDirectory, nativeImage: null });
  const checkpoint = await runtime.checkpointOperation({ action: "create", label: "Antes da troca" });
  assert.equal(checkpoint.dirty, true);
  assert.equal((await runtime.checkpointOperation({ action: "list" })).checkpoints.length, 1);
  const compared = await runtime.gitCompare({ base: "HEAD", compare: "HEAD", mode: "summary" });
  assert.equal(compared.code, 0);
  await runtime.checkpointOperation({ action: "delete", id: checkpoint.id });
  assert.equal((await runtime.checkpointOperation({ action: "list" })).checkpoints.length, 0);

  const server = http.createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ method: request.method, ok: true }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    const result = await httpRequest({ url: `http://127.0.0.1:${address.port}/health`, method: "GET" });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { method: "GET", ok: true });
  } finally { await new Promise((resolve) => server.close(resolve)); }

  console.log("development tools tests passed");
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
