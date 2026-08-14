import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const root = path.resolve(import.meta.dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const installerName = `Dama-Setup-${pkg.version}.exe`;
const installer = path.join(root, "release", installerName);
const blockmap = `${installer}.blockmap`;
const metadata = path.join(root, "release", "latest.yml");
const componentDescriptorPath = path.join(root, "release", "dama-ai-component.json");

for (const file of [installer, blockmap, metadata]) assert.ok(fs.existsSync(file), `Artefato ausente: ${path.relative(root, file)}`);
const yaml = fs.readFileSync(metadata, "utf8");
assert.match(yaml, new RegExp(`version:\\s*${pkg.version.replaceAll(".", "\\.")}`));
assert.ok(yaml.includes(installerName), "latest.yml não referencia o instalador atual.");
assert.match(yaml, /sha512:\s*[A-Za-z0-9+/=]{40,}/);
assert.ok(fs.statSync(installer).size > 20 * 1024 * 1024, "O instalador parece incompleto.");

assert.ok(fs.existsSync(componentDescriptorPath), "Catálogo do Dama AI ausente.");
const descriptor = JSON.parse(fs.readFileSync(componentDescriptorPath, "utf8"));
assert.equal(descriptor.id, "dama-ai");
assert.match(String(descriptor.sha256 || ""), /^[a-f0-9]{64}$/i);
const componentArchive = path.join(root, "release", descriptor.asset);
assert.ok(fs.existsSync(componentArchive), `Componente ausente: ${descriptor.asset}`);
const component = fs.readFileSync(componentArchive);
assert.equal(component.length, descriptor.size, "Tamanho do componente divergente.");
assert.equal(createHash("sha256").update(component).digest("hex"), descriptor.sha256, "SHA-256 do componente divergente.");

console.log(`Release ${pkg.version} pronta: instalador, atualizador e Dama AI verificados.`);
