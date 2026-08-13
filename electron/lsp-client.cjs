const path = require("node:path");
const fs = require("node:fs/promises");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { pathToFileURL } = require("node:url");
const { createFramedRpc } = require("./rpc-client.cjs");

const execFileAsync = promisify(execFile);

async function commandExists(command) {
  try {
    const locator = process.platform === "win32" ? "where.exe" : "which";
    const { stdout } = await execFileAsync(locator, [command], { windowsHide: true, timeout: 5000 });
    return stdout.trim().split(/\r?\n/)[0];
  } catch { return null; }
}

async function detectServer(root, file) {
  const extension = path.extname(file).toLowerCase();
  let candidates;
  if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(extension)) candidates = [[process.execPath, [path.join(__dirname, "..", "node_modules", "typescript-language-server", "lib", "cli.mjs"), "--stdio"]], ["typescript-language-server", ["--stdio"]]];
  else if ([".py", ".pyi"].includes(extension)) candidates = [["pyright-langserver", ["--stdio"]]];
  else if (extension === ".rs") candidates = [["rust-analyzer", []]];
  else if (extension === ".go") candidates = [["gopls", []]];
  else throw new Error(`Ainda não há servidor LSP configurado para ${extension || "este arquivo"}.`);
  for (const [command, args] of candidates) {
    if (path.isAbsolute(command)) { try { await fs.access(command); if (command === process.execPath && args[0]) await fs.access(args[0]); return { command, args }; } catch {} }
    else { const located = await commandExists(command); if (located) return { command: located, args }; }
  }
  throw new Error("Nenhum servidor LSP compatível foi encontrado. Instale typescript-language-server, pyright, rust-analyzer ou gopls.");
}

async function runLsp({ root, file, action, line = 0, character = 0, newName }) {
  const server = await detectServer(root, file);
  const uri = pathToFileURL(file).href;
  const content = await fs.readFile(file, "utf8");
  const extension = path.extname(file).toLowerCase();
  const languageId = [".ts", ".tsx"].includes(extension) ? "typescript" : [".js", ".jsx", ".mjs", ".cjs"].includes(extension) ? "javascript" : extension === ".py" ? "python" : extension === ".rs" ? "rust" : extension === ".go" ? "go" : extension.slice(1);
  const rpc = createFramedRpc(server.command, server.args, { cwd: root, timeoutMs: 40000, shell: process.platform === "win32" && /\.(?:cmd|bat)$/i.test(server.command) });
  let diagnostics = [];
  rpc.on("textDocument/publishDiagnostics", (params) => { if (params?.uri === uri) diagnostics = params.diagnostics || []; });
  try {
    await rpc.request("initialize", { processId: process.pid, rootUri: pathToFileURL(root).href, initializationOptions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(extension) ? { tsserver: { path: path.join(__dirname, "..", "node_modules", "typescript", "lib", "tsserver.js") } } : {}, capabilities: { textDocument: { rename: { prepareSupport: true }, documentSymbol: {}, definition: {}, references: {}, hover: {} }, workspace: { workspaceEdit: { documentChanges: true } } }, workspaceFolders: [{ uri: pathToFileURL(root).href, name: path.basename(root) }] });
    rpc.notify("initialized", {});
    rpc.notify("textDocument/didOpen", { textDocument: { uri, languageId, version: 1, text: content } });
    const position = { line: Math.max(0, Number(line) || 0), character: Math.max(0, Number(character) || 0) };
    let result;
    if (action === "symbols") result = await rpc.request("textDocument/documentSymbol", { textDocument: { uri } });
    else if (action === "definition") result = await rpc.request("textDocument/definition", { textDocument: { uri }, position });
    else if (action === "references") result = await rpc.request("textDocument/references", { textDocument: { uri }, position, context: { includeDeclaration: true } });
    else if (action === "hover") result = await rpc.request("textDocument/hover", { textDocument: { uri }, position });
    else if (action === "rename") result = await rpc.request("textDocument/rename", { textDocument: { uri }, position, newName });
    else if (action === "diagnostics") { await new Promise((resolve) => setTimeout(resolve, 900)); result = diagnostics; }
    else throw new Error("Ação LSP desconhecida.");
    return { server: server.command, result };
  } finally {
    try { await rpc.request("shutdown", null, 2000); } catch {}
    try { rpc.notify("exit"); } catch {}
    rpc.close();
  }
}

module.exports = { runLsp };
