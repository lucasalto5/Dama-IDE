import assert from "node:assert/strict";
import updaterModule from "../electron/update-manager.cjs";

const { compareVersions, releaseNotesText, publicError, selectPreviousRelease } = updaterModule;

assert.equal(releaseNotesText("  Nova versão  "), "Nova versão");
assert.equal(releaseNotesText([{ version: "1.0.0", note: "Primeira" }, { note: "Segunda" }]), "Primeira\n\nSegunda");
assert.equal(releaseNotesText(null), "");
assert.match(publicError(new Error("Falhou em https://updates.example.com/private/latest.yml")), /https:\/\/updates\.example\.com\/…/);
assert.ok(publicError(new Error("x".repeat(2000))).length <= 1200);
assert.ok(compareVersions("0.12.2", "0.12.1") > 0);
assert.equal(compareVersions("v1.0.0", "1.0.0"), 0);
const previous = selectPreviousRelease([
  { tag_name: "v0.12.2", assets: [{ name: "Dama-Setup-0.12.2.exe" }] },
  { tag_name: "v0.12.1", assets: [{ name: "Dama-Setup-0.12.1.exe", browser_download_url: "https://example.com/old.exe" }] },
  { tag_name: "v0.11.0", assets: [{ name: "Dama-Setup-0.11.0.exe" }] },
], "0.12.2");
assert.equal(previous.version, "0.12.1");
assert.equal(previous.asset.name, "Dama-Setup-0.12.1.exe");

console.log("Atualizações: notas e erros públicos verificados.");
