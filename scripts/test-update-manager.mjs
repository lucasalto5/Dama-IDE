import assert from "node:assert/strict";
import updaterModule from "../electron/update-manager.cjs";

const { releaseNotesText, publicError } = updaterModule;

assert.equal(releaseNotesText("  Nova versão  "), "Nova versão");
assert.equal(releaseNotesText([{ version: "1.0.0", note: "Primeira" }, { note: "Segunda" }]), "Primeira\n\nSegunda");
assert.equal(releaseNotesText(null), "");
assert.match(publicError(new Error("Falhou em https://updates.example.com/private/latest.yml")), /https:\/\/updates\.example\.com\/…/);
assert.ok(publicError(new Error("x".repeat(2000))).length <= 1200);

console.log("Atualizações: notas e erros públicos verificados.");
