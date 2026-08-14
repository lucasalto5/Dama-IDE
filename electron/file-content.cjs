const path = require("node:path");

function validateStructuredFile(relativePath, content) {
  const normalized = String(relativePath || "").replaceAll("\\", "/");
  if (path.extname(normalized).toLowerCase() !== ".json") return String(content ?? "");
  const text = String(content ?? "");
  if (!text.trim() || text.trim() === "[object Object]") throw new Error(`${normalized} precisa conter um documento JSON real, não uma representação de objeto.`);
  try {
    return `${JSON.stringify(JSON.parse(text), null, 2)}\n`;
  } catch (error) {
    throw new Error(`${normalized} não é JSON válido: ${error.message}`);
  }
}

function normalizedToolFileContent(relativePath, value) {
  if (path.extname(String(relativePath || "")).toLowerCase() === ".json" && value && typeof value === "object") {
    return validateStructuredFile(relativePath, JSON.stringify(value));
  }
  if (typeof value !== "string" && value !== undefined && value !== null) throw new Error(`O conteúdo de ${relativePath} precisa ser texto.`);
  return validateStructuredFile(relativePath, String(value ?? ""));
}

module.exports = { validateStructuredFile, normalizedToolFileContent };
