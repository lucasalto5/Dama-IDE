const path = require("node:path");
const fs = require("node:fs/promises");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { pathToFileURL } = require("node:url");
const { createFramedRpc } = require("./rpc-client.cjs");

const execFileAsync = promisify(execFile);
const sessions = new Map();
const ignoredDirectories = new Set(["node_modules", ".git", "dist", ".next", "build", "coverage", ".cache"]);

async function commandExists(command) {
  try {
    const locator = process.platform === "win32" ? "where.exe" : "which";
    const { stdout } = await execFileAsync(locator, [command], { windowsHide: true, timeout: 5000 });
    return stdout.trim().split(/\r?\n/)[0];
  } catch { return null; }
}

function languageForFile(file) {
  const extension = path.extname(file).toLowerCase();
  if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(extension)) return { family: "typescript", languageId: [".ts", ".tsx"].includes(extension) ? "typescript" : "javascript" };
  if ([".py", ".pyi"].includes(extension)) return { family: "python", languageId: "python" };
  if (extension === ".rs") return { family: "rust", languageId: "rust" };
  if (extension === ".go") return { family: "go", languageId: "go" };
  return null;
}

async function detectServer(root, family) {
  const bundled = path.join(__dirname, "..", "node_modules");
  const candidates = family === "typescript"
    ? [[process.execPath, [path.join(bundled, "typescript-language-server", "lib", "cli.mjs"), "--stdio"]], ["typescript-language-server", ["--stdio"]]]
    : family === "python"
      ? [[process.execPath, [path.join(bundled, "pyright", "langserver.index.js"), "--stdio"]], ["pyright-langserver", ["--stdio"]]]
      : family === "rust" ? [["rust-analyzer", []]] : family === "go" ? [["gopls", []]] : [];
  for (const [command, args] of candidates) {
    if (path.isAbsolute(command)) {
      try { await fs.access(command); if (command === process.execPath && args[0]) await fs.access(args[0]); return { command, args }; } catch {}
    } else {
      const located = await commandExists(command);
      if (located) return { command: located, args };
    }
  }
  throw new Error(`Nenhum servidor LSP para ${family} foi encontrado neste computador.`);
}

class ManagedLspSession {
  constructor(root, family, server) {
    this.root = root;
    this.family = family;
    this.server = server;
    this.documents = new Map();
    this.diagnostics = new Map();
    this.rpc = null;
    this.closed = false;
    this.ready = this.initialize();
  }

  async initialize() {
    this.rpc = createFramedRpc(this.server.command, this.server.args, { cwd: this.root, timeoutMs: 40000, shell: process.platform === "win32" && /\.(?:cmd|bat)$/i.test(this.server.command), env: this.server.command === process.execPath && process.versions.electron ? { ELECTRON_RUN_AS_NODE: "1" } : {} });
    this.rpc.child.once("exit", () => { this.closed = true; sessions.delete(`${this.root.toLowerCase()}::${this.family}`); });
    this.rpc.on("textDocument/publishDiagnostics", (params) => { if (params?.uri) this.diagnostics.set(params.uri, params.diagnostics || []); });
    await this.rpc.request("initialize", {
      processId: process.pid,
      rootUri: pathToFileURL(this.root).href,
      initializationOptions: this.family === "typescript" ? { tsserver: { path: path.join(__dirname, "..", "node_modules", "typescript", "lib", "tsserver.js") } } : {},
      capabilities: {
        textDocument: { synchronization: { didSave: true, dynamicRegistration: false }, rename: { prepareSupport: true }, documentSymbol: {}, definition: {}, references: {}, hover: {}, publishDiagnostics: {} },
        workspace: { workspaceEdit: { documentChanges: true }, workspaceFolders: true },
      },
      workspaceFolders: [{ uri: pathToFileURL(this.root).href, name: path.basename(this.root) }],
    });
    this.rpc.notify("initialized", {});
  }

  async sync(file, options = {}) {
    await this.ready;
    const absolute = path.resolve(file);
    const uri = pathToFileURL(absolute).href;
    const language = languageForFile(absolute);
    if (!language || language.family !== this.family) return null;
    let content = options.content;
    const explicitContent = content != null;
    let modifiedAt = explicitContent ? null : Date.now();
    if (content == null) {
      try { const stat = await fs.stat(absolute); modifiedAt = stat.mtimeMs; content = await fs.readFile(absolute, "utf8"); }
      catch (error) {
        if (error?.code === "ENOENT") { await this.closeDocument(absolute); return null; }
        throw error;
      }
    }
    content = String(content);
    const current = this.documents.get(uri);
    if (!current) {
      const record = { version: 1, content, modifiedAt, languageId: language.languageId };
      this.documents.set(uri, record);
      this.rpc.notify("textDocument/didOpen", { textDocument: { uri, languageId: language.languageId, version: record.version, text: content } });
    } else if (current.content !== content || (!explicitContent && current.modifiedAt !== modifiedAt)) {
      current.version += 1; current.content = content; current.modifiedAt = modifiedAt;
      this.rpc.notify("textDocument/didChange", { textDocument: { uri, version: current.version }, contentChanges: [{ text: content }] });
    }
    if (options.saved !== false) this.rpc.notify("textDocument/didSave", { textDocument: { uri }, text: content });
    return { uri, document: this.documents.get(uri) };
  }

  async closeDocument(file) {
    await this.ready.catch(() => {});
    const uri = pathToFileURL(path.resolve(file)).href;
    if (!this.documents.has(uri) || !this.rpc || this.closed) return;
    this.documents.delete(uri); this.diagnostics.delete(uri);
    this.rpc.notify("textDocument/didClose", { textDocument: { uri } });
  }

  async query(file, action, position, newName) {
    const synced = await this.sync(file, { saved: true });
    if (!synced) throw new Error("O arquivo não existe mais.");
    const textDocument = { uri: synced.uri };
    if (action === "symbols") return this.rpc.request("textDocument/documentSymbol", { textDocument });
    if (action === "definition") return this.rpc.request("textDocument/definition", { textDocument, position });
    if (action === "references") return this.rpc.request("textDocument/references", { textDocument, position, context: { includeDeclaration: true } });
    if (action === "hover") return this.rpc.request("textDocument/hover", { textDocument, position });
    if (action === "rename") return this.rpc.request("textDocument/rename", { textDocument, position, newName });
    if (action === "diagnostics") { await new Promise((resolve) => setTimeout(resolve, 250)); return this.diagnostics.get(synced.uri) || []; }
    throw new Error("Ação LSP desconhecida.");
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    await this.ready.catch(() => {});
    const child = this.rpc?.child;
    const exited = child && child.exitCode == null ? new Promise((resolve) => {
      const timer = setTimeout(resolve, 2000);
      child.once("exit", () => { clearTimeout(timer); resolve(); });
    }) : Promise.resolve();
    for (const uri of this.documents.keys()) { try { this.rpc?.notify("textDocument/didClose", { textDocument: { uri } }); } catch {} }
    try { await this.rpc?.request("shutdown", null, 2000); } catch {}
    try { this.rpc?.notify("exit"); } catch {}
    this.rpc?.close();
    await exited;
    if (process.platform === "win32" && child?.pid && child.exitCode == null) await execFileAsync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, timeout: 5000 }).catch(() => {});
    this.documents.clear(); this.diagnostics.clear();
  }
}

async function getSession(root, file) {
  const language = languageForFile(file);
  if (!language) throw new Error(`Ainda não há servidor LSP configurado para ${path.extname(file) || "este arquivo"}.`);
  const normalizedRoot = path.resolve(root);
  const key = `${normalizedRoot.toLowerCase()}::${language.family}`;
  let session = sessions.get(key);
  if (!session || session.closed) {
    session = new ManagedLspSession(normalizedRoot, language.family, await detectServer(normalizedRoot, language.family));
    sessions.set(key, session);
  }
  await session.ready;
  return session;
}

async function runLsp({ root, file, action, line = 0, character = 0, newName }) {
  const session = await getSession(root, file);
  const position = { line: Math.max(0, Number(line) || 0), character: Math.max(0, Number(character) || 0) };
  return { server: session.server.command, reused: session.documents.size > 0, result: await session.query(file, action, position, newName) };
}

async function syncLspDocument({ root, file, content, saved = true }) {
  const language = languageForFile(file);
  if (!language) return { synced: false, reason: "unsupported" };
  try { const session = await getSession(root, file); await session.sync(file, { content, saved }); return { synced: true, family: language.family }; }
  catch (error) { return { synced: false, reason: error.message }; }
}

async function closeLspDocument({ root, file }) {
  const language = languageForFile(file);
  if (!language) return;
  const session = sessions.get(`${path.resolve(root).toLowerCase()}::${language.family}`);
  await session?.closeDocument(file);
}

async function findRepresentative(root, extensions, limit = 1600) {
  const queue = [root]; let inspected = 0;
  while (queue.length && inspected < limit) {
    const directory = queue.shift();
    let entries; try { entries = await fs.readdir(directory, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (++inspected > limit) break;
      if (entry.isDirectory()) { if (!ignoredDirectories.has(entry.name)) queue.push(path.join(directory, entry.name)); continue; }
      const file = path.join(directory, entry.name);
      if (extensions.has(path.extname(entry.name).toLowerCase())) return file;
    }
  }
  return null;
}

async function warmProjectLsp(root) {
  const normalizedRoot = path.resolve(root);
  const candidates = [
    { markers: ["package.json", "tsconfig.json"], extensions: new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]) },
    { markers: ["pyproject.toml", "requirements.txt", "setup.cfg"], extensions: new Set([".py", ".pyi"]) },
    { markers: ["Cargo.toml"], extensions: new Set([".rs"]) },
    { markers: ["go.mod"], extensions: new Set([".go"]) },
  ];
  const started = [];
  for (const candidate of candidates) {
    let relevant = false;
    for (const marker of candidate.markers) { try { await fs.access(path.join(normalizedRoot, marker)); relevant = true; break; } catch {} }
    if (!relevant) continue;
    const file = await findRepresentative(normalizedRoot, candidate.extensions);
    if (!file) continue;
    const result = await syncLspDocument({ root: normalizedRoot, file, saved: true });
    if (result.synced) started.push(result.family);
  }
  return { root: normalizedRoot, started: [...new Set(started)] };
}

async function handleLspFileChange({ root, file }) {
  const absolute = path.resolve(root, String(file || ""));
  try { await fs.access(absolute); return syncLspDocument({ root, file: absolute, saved: true }); }
  catch { await closeLspDocument({ root, file: absolute }); return { synced: false, reason: "closed" }; }
}

async function closeProjectLsp(root) {
  if (!root) return;
  const prefix = `${path.resolve(root).toLowerCase()}::`;
  const targets = [...sessions.entries()].filter(([key]) => key.startsWith(prefix));
  for (const [key, session] of targets) { sessions.delete(key); await session.close(); }
}

async function closeAllLsp() {
  const targets = [...sessions.values()]; sessions.clear();
  await Promise.allSettled(targets.map((session) => session.close()));
}

function lspManagerStatus() {
  return [...sessions.values()].map((session) => ({ root: session.root, family: session.family, server: session.server.command, documents: session.documents.size, alive: !session.closed }));
}

module.exports = { runLsp, syncLspDocument, closeLspDocument, warmProjectLsp, handleLspFileChange, closeProjectLsp, closeAllLsp, lspManagerStatus };
