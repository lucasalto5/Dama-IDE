import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import noteUtils from "../electron/note-utils.cjs";

const { detectNoteAsset, slugifyNoteName, uniqueProjectFile } = noteUtils;
assert.equal(slugifyNoteName("Minha anotação incrível!"), "minha-anotacao-incrivel");
assert.deepEqual(detectNoteAsset(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), { mime: "image/png", extension: ".png" });
assert.deepEqual(detectNoteAsset(Buffer.from([0xff, 0xd8, 0xff, 0xdb])), { mime: "image/jpeg", extension: ".jpg" });
assert.deepEqual(detectNoteAsset(Buffer.from("GIF89a", "ascii")), { mime: "image/gif", extension: ".gif" });
assert.deepEqual(detectNoteAsset(Buffer.concat([Buffer.from("RIFFxxxxWEBP", "ascii")])), { mime: "image/webp", extension: ".webp" });
assert.equal(detectNoteAsset(Buffer.from("não é imagem")), null);

const directory = await mkdtemp(path.join(tmpdir(), "dama-notes-test-"));
try {
  const first = await uniqueProjectFile(directory, "imagem", ".png");
  assert.equal(path.basename(first), "imagem.png");
  await writeFile(first, "test");
  const second = await uniqueProjectFile(directory, "imagem", ".png");
  assert.equal(path.basename(second), "imagem-2.png");
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log("Notas: formatos, nomes seguros e colisões validados.");
