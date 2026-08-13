import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const installerName = `Dama-Setup-${pkg.version}.exe`;
const installer = path.join(root, "release", installerName);
const blockmap = `${installer}.blockmap`;
const metadata = path.join(root, "release", "latest.yml");

for (const file of [installer, blockmap, metadata]) assert.ok(fs.existsSync(file), `Artefato ausente: ${path.relative(root, file)}`);
const yaml = fs.readFileSync(metadata, "utf8");
assert.match(yaml, new RegExp(`version:\\s*${pkg.version.replaceAll(".", "\\.")}`));
assert.ok(yaml.includes(installerName), "latest.yml não referencia o instalador atual.");
assert.match(yaml, /sha512:\s*[A-Za-z0-9+/=]{40,}/);
assert.ok(fs.statSync(installer).size > 20 * 1024 * 1024, "O instalador parece incompleto.");

console.log(`Release ${pkg.version} pronta: instalador, blockmap e latest.yml verificados.`);
