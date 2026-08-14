import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const payloadRoot = path.join(root, "dama-engine-payload");
const outputRoot = path.join(root, "release");
const manifestPath = path.join(payloadRoot, "manifest.json");

function safeRelative(value) {
  const normalized = String(value || "").replaceAll("\\", "/");
  return normalized && !normalized.startsWith("/") && !normalized.split("/").includes("..") && !path.isAbsolute(normalized);
}

const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
if (manifest.id !== "dama-ai" || !/^\d+\.\d+\.\d+/.test(String(manifest.version || ""))) throw new Error("Manifesto do componente inválido.");
const files = Array.isArray(manifest.files) ? manifest.files : [];
for (const file of files) {
  if (!safeRelative(file.path)) throw new Error(`Caminho inseguro no componente: ${file.path}`);
  const content = await fs.readFile(path.join(payloadRoot, file.path));
  const hash = createHash("sha256").update(content).digest("hex");
  if (content.length !== Number(file.size) || hash !== String(file.sha256).toLowerCase()) throw new Error(`Integridade divergente antes do empacotamento: ${file.path}`);
}

await fs.mkdir(outputRoot, { recursive: true });
const asset = `Dama-AI-Component-${manifest.version}.zip`;
const archivePath = path.join(outputRoot, asset);
await fs.rm(archivePath, { force: true });
await execFileAsync("tar.exe", ["-a", "-c", "-f", archivePath, "-C", payloadRoot, "manifest.json", ...files.map((file) => file.path)], { windowsHide: true, timeout: 60000 });
const archive = await fs.readFile(archivePath);
const descriptor = {
  schemaVersion: 1,
  id: "dama-ai",
  version: manifest.version,
  asset,
  size: archive.length,
  sha256: createHash("sha256").update(archive).digest("hex"),
};
await fs.writeFile(path.join(outputRoot, "dama-ai-component.json"), `${JSON.stringify(descriptor, null, 2)}\n`, "utf8");
console.log(`Componente ${descriptor.version} pronto: ${asset} (${descriptor.size} bytes)`);
