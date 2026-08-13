const path = require("node:path");
const fs = require("node:fs/promises");

const noteAssetTypes = {
  png: { mime: "image/png", extension: ".png" },
  jpeg: { mime: "image/jpeg", extension: ".jpg" },
  gif: { mime: "image/gif", extension: ".gif" },
  webp: { mime: "image/webp", extension: ".webp" },
};

function slugifyNoteName(value, fallback = "nota") {
  const normalized = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72) || fallback;
}

function detectNoteAsset(bytes) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return noteAssetTypes.png;
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return noteAssetTypes.jpeg;
  if (bytes.length >= 6 && bytes.subarray(0, 6).toString("ascii").startsWith("GIF8")) return noteAssetTypes.gif;
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return noteAssetTypes.webp;
  return null;
}

async function uniqueProjectFile(directory, baseName, extension) {
  await fs.mkdir(directory, { recursive: true });
  for (let index = 0; index < 1000; index += 1) {
    const suffix = index ? `-${index + 1}` : "";
    const target = path.join(directory, `${baseName}${suffix}${extension}`);
    try {
      await fs.access(target);
    } catch {
      return target;
    }
  }
  throw new Error("Não foi possível criar um nome de arquivo único.");
}

module.exports = { detectNoteAsset, slugifyNoteName, uniqueProjectFile };
