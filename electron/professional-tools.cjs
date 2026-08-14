const path = require("node:path");
const fs = require("node:fs/promises");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");

function limited(value, size = 120000) {
  const text = String(value || "");
  return text.length > size ? `${text.slice(0, size)}\n… saída limitada pela Dama` : text;
}

function runProcess(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args.map(String), {
      cwd: options.cwd,
      windowsHide: true,
      shell: false,
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", ...(options.env || {}) },
      stdio: [options.input == null ? "ignore" : "pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let finished = false;
    const timeout = setTimeout(() => {
      if (finished) return;
      if (process.platform === "win32" && child.pid) spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
      else child.kill("SIGTERM");
    }, Math.max(1000, Number(options.timeoutMs || 120000)));
    child.stdout?.on("data", (chunk) => { stdout = limited(stdout + chunk.toString()); options.onOutput?.("stdout", chunk.toString()); });
    child.stderr?.on("data", (chunk) => { stderr = limited(stderr + chunk.toString()); options.onOutput?.("stderr", chunk.toString()); });
    child.once("error", (error) => { clearTimeout(timeout); if (!finished) { finished = true; reject(error); } });
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      if (finished) return;
      finished = true;
      resolve({ code: code ?? -1, signal: signal || null, stdout, stderr, command: [command, ...args].join(" ") });
    });
    if (options.input != null) child.stdin?.end(String(options.input));
  });
}

async function commandAvailable(command) {
  const locator = process.platform === "win32" ? "where.exe" : "which";
  try { return (await runProcess(locator, [command], { timeoutMs: 8000 })).code === 0; } catch { return false; }
}

function assertSimpleRef(value, label = "referência") {
  const text = String(value || "").trim();
  if (!text || text.length > 500 || text.includes("\0") || /[\r\n]/.test(text)) throw new Error(`${label} inválida.`);
  return text;
}

function assertProjectRelative(value, label = "caminho") {
  const text = assertSimpleRef(value, label).replaceAll("\\", "/");
  if (path.posix.isAbsolute(text) || /^[A-Za-z]:/.test(text) || text.split("/").includes("..")) throw new Error(`${label} precisa ficar dentro do projeto.`);
  return text;
}

function parseGitConflicts(text) {
  return String(text || "").split(/\r?\n/).filter((line) => /^UU |^AA |^DD |^AU |^UA |^DU |^UD /.test(line)).map((line) => line.slice(3).trim());
}

async function gitOperation(root, input = {}) {
  const action = String(input.action || "status");
  let args;
  if (action === "status") args = ["status", "--short", "--branch"];
  else if (action === "branches") args = ["branch", "--all", "--verbose", "--no-abbrev"];
  else if (action === "create_branch") args = ["switch", "-c", assertSimpleRef(input.name, "Nome da branch")];
  else if (action === "checkout") args = ["switch", assertSimpleRef(input.name, "Nome da branch")];
  else if (action === "stage") args = ["add", "--", ...(input.paths || ["."]).map((item) => assertProjectRelative(item, "Caminho"))];
  else if (action === "unstage") args = ["restore", "--staged", "--", ...(input.paths || ["."]).map((item) => assertProjectRelative(item, "Caminho"))];
  else if (action === "commit") {
    const message = String(input.message || "").trim().slice(0, 500);
    if (!message) throw new Error("A mensagem do commit é obrigatória.");
    args = ["commit", "-m", message];
  } else if (action === "pull") args = ["pull", "--ff-only", ...(input.remote ? [assertSimpleRef(input.remote, "Remote")] : []), ...(input.branch ? [assertSimpleRef(input.branch, "Branch")] : [])];
  else if (action === "push") args = ["push", ...(input.set_upstream ? ["-u"] : []), assertSimpleRef(input.remote || "origin", "Remote"), ...(input.branch ? [assertSimpleRef(input.branch, "Branch")] : [])];
  else if (action === "stash") args = ["stash", "push", "-u", "-m", String(input.message || "Checkpoint da Dama").slice(0, 200)];
  else if (action === "stash_list") args = ["stash", "list"];
  else if (action === "stash_pop") args = ["stash", "pop", input.ref ? assertSimpleRef(input.ref, "Stash") : "stash@{0}"];
  else if (action === "merge") args = ["merge", "--no-edit", assertSimpleRef(input.name, "Branch")];
  else if (action === "abort_merge") args = ["merge", "--abort"];
  else if (action === "revert") args = ["revert", "--no-edit", assertSimpleRef(input.ref, "Commit")];
  else if (action === "restore") {
    const paths = (input.paths || []).map((item) => assertProjectRelative(item, "Caminho"));
    if (!paths.length || paths.some((item) => item === "." || item === "*")) throw new Error("Escolha arquivos específicos para restaurar.");
    args = ["restore", "--", ...paths];
  }
  else throw new Error(`Operação Git desconhecida: ${action}`);
  const result = await runProcess("git", args, { cwd: root, timeoutMs: action === "pull" || action === "push" ? 300000 : 120000 });
  const status = await runProcess("git", ["status", "--short", "--branch"], { cwd: root, timeoutMs: 30000 });
  return { ...result, action, status: status.stdout, conflicts: parseGitConflicts(status.stdout) };
}

async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return null; }
}

async function detectTests(root) {
  const packageInfo = await readJson(path.join(root, "package.json"));
  const dependencies = { ...(packageInfo?.dependencies || {}), ...(packageInfo?.devDependencies || {}) };
  const runners = [];
  const scripts = packageInfo?.scripts || {};
  if (scripts.test && !/no test specified/i.test(scripts.test)) runners.push({ id: "package", name: "Script do projeto", command: "npm", args: ["test"], script: scripts.test });
  if (dependencies.vitest) runners.push({ id: "vitest", name: "Vitest", command: "npx", args: ["vitest", "run"] });
  if (dependencies.jest) runners.push({ id: "jest", name: "Jest", command: "npx", args: ["jest", "--runInBand"] });
  if (dependencies.mocha) runners.push({ id: "mocha", name: "Mocha", command: "npx", args: ["mocha"] });
  try { await fs.access(path.join(root, "pytest.ini")); runners.push({ id: "pytest", name: "Pytest", command: process.platform === "win32" ? "py" : "python3", args: ["-m", "pytest"] }); } catch {}
  if (!runners.some((item) => item.id === "pytest")) {
    for (const marker of ["pyproject.toml", "requirements.txt", "setup.cfg"]) try { await fs.access(path.join(root, marker)); runners.push({ id: "pytest", name: "Pytest", command: process.platform === "win32" ? "py" : "python3", args: ["-m", "pytest"] }); break; } catch {}
  }
  try { await fs.access(path.join(root, "Cargo.toml")); runners.push({ id: "cargo", name: "Cargo test", command: "cargo", args: ["test"] }); } catch {}
  try { await fs.access(path.join(root, "go.mod")); runners.push({ id: "go", name: "Go test", command: "go", args: ["test", "./..."] }); } catch {}
  return runners.filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index);
}

function parseTestFailures(output) {
  const failures = [];
  const seen = new Set();
  for (const line of String(output || "").split(/\r?\n/)) {
    const match = line.match(/(?:^|\s|\()((?:[A-Za-z]:)?[^\s():]+\.(?:[cm]?[jt]sx?|py|rs|go)):(\d+)(?::(\d+))?/i)
      || line.match(/File "([^"]+\.py)", line (\d+)/i);
    if (!match) continue;
    const key = `${match[1]}:${match[2]}:${match[3] || 1}`;
    if (seen.has(key)) continue;
    seen.add(key);
    failures.push({ path: match[1].replaceAll("\\", "/"), line: Number(match[2]), column: Number(match[3] || 1), message: line.trim().slice(0, 500) });
  }
  return failures.slice(0, 100);
}

async function runTests(root, input = {}, onOutput) {
  const runners = await detectTests(root);
  if (input.action === "detect") return { runners };
  const runner = runners.find((item) => item.id === input.runner) || runners[0];
  if (!runner) throw new Error("Nenhum executor de testes foi detectado neste projeto.");
  const args = [...runner.args];
  const target = input.path ? assertProjectRelative(input.path, "Arquivo de teste") : null;
  const name = String(input.name || "").trim();
  if (target) args.push(target);
  if (name) {
    if (runner.id === "vitest" || runner.id === "jest") args.push("-t", name.slice(0, 200));
    else if (runner.id === "pytest") args.push("-k", name.slice(0, 200));
  }
  if (input.coverage && ["vitest", "jest"].includes(runner.id)) args.push("--coverage");
  const result = await runProcess(process.platform === "win32" && ["npm", "npx"].includes(runner.command) ? `${runner.command}.cmd` : runner.command, args, { cwd: root, timeoutMs: Math.min(900000, Math.max(10000, Number(input.timeout_seconds || 300) * 1000)), onOutput });
  return { ...result, runner, failures: parseTestFailures(`${result.stdout}\n${result.stderr}`), passed: result.code === 0 };
}

async function detectLsp(root) {
  const detected = [];
  const candidates = [
    { id: "typescript", markers: ["package.json", "tsconfig.json"], command: "typescript-language-server", install: { command: process.platform === "win32" ? "npm.cmd" : "npm", args: ["install", "--save-dev", "typescript", "typescript-language-server"] } },
    { id: "python", markers: ["pyproject.toml", "requirements.txt"], command: "pyright-langserver", install: { command: process.platform === "win32" ? "npm.cmd" : "npm", args: ["install", "--save-dev", "pyright"] } },
    { id: "rust", markers: ["Cargo.toml"], command: "rust-analyzer", install: { command: "rustup", args: ["component", "add", "rust-analyzer"] } },
    { id: "go", markers: ["go.mod"], command: "gopls", install: { command: "go", args: ["install", "golang.org/x/tools/gopls@latest"] } },
  ];
  for (const candidate of candidates) {
    let relevant = false;
    for (const marker of candidate.markers) try { await fs.access(path.join(root, marker)); relevant = true; break; } catch {}
    if (relevant) detected.push({ ...candidate, installed: await commandAvailable(candidate.command) });
  }
  return detected;
}

async function manageLsp(root, input = {}, onOutput) {
  const servers = await detectLsp(root);
  if (input.action === "detect") return { servers };
  const server = servers.find((item) => item.id === input.language);
  if (!server) throw new Error("A linguagem solicitada não foi detectada no projeto.");
  if (server.installed) return { installed: true, server };
  const result = await runProcess(server.install.command, server.install.args, { cwd: root, timeoutMs: 600000, onOutput });
  return { ...result, installed: result.code === 0, server: { ...server, installed: result.code === 0 } };
}

function decodeXml(value) {
  return String(value || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}

async function webSearch(query, limit = 8) {
  const clean = String(query || "").trim().slice(0, 500);
  if (!clean) throw new Error("Informe o que deve ser pesquisado.");
  const url = `https://www.bing.com/search?format=rss&q=${encodeURIComponent(clean)}`;
  const response = await fetch(url, { headers: { "user-agent": "Dama-IDE/1.0 (+https://github.com/lucasalto5/Dama-IDE)" }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`A busca respondeu ${response.status}.`);
  const xml = await response.text();
  const results = [];
  for (const item of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const body = item[1];
    const title = decodeXml(body.match(/<title>([\s\S]*?)<\/title>/i)?.[1]);
    const link = decodeXml(body.match(/<link>([\s\S]*?)<\/link>/i)?.[1]);
    const snippet = decodeXml(body.match(/<description>([\s\S]*?)<\/description>/i)?.[1]);
    if (/^https?:\/\//i.test(link)) results.push({ title, url: link, snippet });
    if (results.length >= Math.min(12, Math.max(1, Number(limit || 8)))) break;
  }
  return { query: clean, results, searchedAt: new Date().toISOString(), source: url };
}

async function listArchive(archivePath, cwd) {
  const result = await runProcess("tar", ["-tf", archivePath], { cwd, timeoutMs: 60000 });
  if (result.code !== 0) throw new Error(result.stderr || "Não foi possível ler o arquivo compactado.");
  const entries = result.stdout.split(/\r?\n/).map((item) => item.trim().replaceAll("\\", "/")).filter(Boolean);
  if (entries.length > 5000) throw new Error("O arquivo compactado possui itens demais.");
  if (entries.some((item) => path.posix.isAbsolute(item) || item.split("/").includes("..") || /^[A-Za-z]:/.test(item))) throw new Error("O arquivo compactado contém caminhos inseguros.");
  return entries;
}

async function archiveOperation(root, input = {}) {
  const action = String(input.action || "list");
  const archive = assertProjectRelative(input.archive, "Arquivo compactado");
  if (action === "list") return { archive, entries: await listArchive(archive, root) };
  if (action === "extract") {
    const destination = assertProjectRelative(input.destination || ".", "Destino");
    const entries = await listArchive(archive, root);
    await fs.mkdir(path.join(root, destination), { recursive: true });
    const result = await runProcess("tar", ["-xf", archive, "-C", destination], { cwd: root, timeoutMs: 300000 });
    return { ...result, archive, destination, entries };
  }
  if (action === "create") {
    const sources = (input.sources || []).map((item) => assertProjectRelative(item, "Origem"));
    if (!sources.length) throw new Error("Informe ao menos um arquivo ou pasta para compactar.");
    const result = await runProcess("tar", ["-a", "-cf", archive, ...sources], { cwd: root, timeoutMs: 300000 });
    return { ...result, archive, sources };
  }
  throw new Error("Operação de arquivo compactado desconhecida.");
}

const cliAdapters = {
  codex: { command: "codex", args: (prompt) => ["exec", "--skip-git-repo-check", prompt] },
  claude: { command: "claude", args: (prompt) => ["-p", prompt] },
  gemini: { command: "gemini", args: (prompt) => ["-p", prompt] },
  opencode: { command: "opencode", args: (prompt) => ["run", prompt] },
};

async function cliAgent(root, input = {}, onOutput) {
  if (input.action === "detect") {
    const adapters = [];
    for (const [id, adapter] of Object.entries(cliAdapters)) adapters.push({ id, command: adapter.command, installed: await commandAvailable(adapter.command) });
    return { adapters };
  }
  const adapter = cliAdapters[input.adapter];
  if (!adapter) throw new Error("Adaptador de CLI desconhecido.");
  if (!(await commandAvailable(adapter.command))) throw new Error(`${adapter.command} não está instalado ou não está no PATH.`);
  const prompt = String(input.prompt || "").trim().slice(0, 30000);
  if (!prompt) throw new Error("O pedido para o agente de CLI está vazio.");
  return runProcess(adapter.command, adapter.args(prompt), { cwd: root, timeoutMs: Math.min(1800000, Math.max(30000, Number(input.timeout_seconds || 600) * 1000)), onOutput });
}

async function pluginManifest(pluginPath) {
  for (const candidate of ["dama-plugin.json", path.join(".dama", "plugin.json"), path.join(".codex-plugin", "plugin.json"), "package.json"]) {
    const manifest = await readJson(path.join(pluginPath, candidate));
    if (!manifest) continue;
    const config = manifest.dama || manifest;
    if (Array.isArray(config.tools)) return { manifest, config, file: candidate };
  }
  return null;
}

async function pluginRuntime(settings, input = {}, onOutput) {
  const plugins = (settings.plugins || []).filter((item) => item.enabled);
  if (input.action === "list_tools") {
    const tools = [];
    for (const plugin of plugins) {
      const descriptor = await pluginManifest(plugin.path);
      for (const tool of descriptor?.config.tools || []) tools.push({ plugin: plugin.name, pluginId: plugin.id, name: tool.name, description: tool.description || "Ferramenta de plugin" });
    }
    return { tools };
  }
  const query = String(input.plugin || "").toLowerCase();
  const plugin = plugins.find((item) => String(item.id).toLowerCase() === query || String(item.name).toLowerCase() === query);
  if (!plugin) throw new Error("Plugin inexistente ou desativado.");
  const descriptor = await pluginManifest(plugin.path);
  const tool = descriptor?.config.tools?.find((item) => item.name === input.tool);
  if (!tool?.command) throw new Error("A ferramenta não existe ou não declara um comando executável.");
  const command = path.isAbsolute(tool.command) ? tool.command : path.resolve(plugin.path, tool.command);
  if (!path.isAbsolute(tool.command) && (path.relative(path.resolve(plugin.path), command).startsWith("..") || path.isAbsolute(path.relative(path.resolve(plugin.path), command)))) throw new Error("O comando do plugin aponta para fora da pasta instalada.");
  const args = Array.isArray(tool.args) ? tool.args.map(String) : [];
  const result = await runProcess(command, args, { cwd: plugin.path, input: JSON.stringify(input.arguments || {}), timeoutMs: Math.min(600000, Math.max(1000, Number(tool.timeoutMs || 120000))), onOutput });
  let data = null;
  try { data = JSON.parse(result.stdout); } catch {}
  return { ...result, data, plugin: plugin.name, tool: tool.name };
}

class DapClient {
  constructor(command, args, cwd) {
    this.command = command; this.args = args; this.cwd = cwd; this.sequence = 1; this.buffer = Buffer.alloc(0); this.pending = new Map(); this.events = []; this.process = null;
  }
  start() {
    this.process = spawn(this.command, this.args, { cwd: this.cwd, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    this.process.stdout.on("data", (chunk) => this.consume(chunk));
    this.process.stderr.on("data", (chunk) => this.events.push({ event: "stderr", body: limited(chunk.toString(), 8000) }));
    this.process.on("close", (code) => this.events.push({ event: "terminated", body: { code } }));
  }
  consume(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const header = this.buffer.subarray(0, headerEnd).toString();
      const length = Number(header.match(/Content-Length:\s*(\d+)/i)?.[1]);
      if (!length || this.buffer.length < headerEnd + 4 + length) return;
      const body = this.buffer.subarray(headerEnd + 4, headerEnd + 4 + length).toString();
      this.buffer = this.buffer.subarray(headerEnd + 4 + length);
      let message; try { message = JSON.parse(body); } catch { continue; }
      if (message.type === "response") {
        const pending = this.pending.get(message.request_seq); this.pending.delete(message.request_seq);
        if (pending) message.success ? pending.resolve(message) : pending.reject(new Error(message.message || "Falha no adaptador de depuração."));
      } else if (message.type === "event") this.events.push(message);
    }
  }
  request(command, args = {}, timeoutMs = 20000) {
    const seq = this.sequence++;
    const message = JSON.stringify({ seq, type: "request", command, arguments: args });
    this.process.stdin.write(`Content-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(seq); reject(new Error(`O debugger não respondeu a ${command}.`)); }, timeoutMs);
      this.pending.set(seq, { resolve: (value) => { clearTimeout(timer); resolve(value); }, reject: (error) => { clearTimeout(timer); reject(error); } });
    });
  }
  stop() { try { this.process?.kill(); } catch {} }
}

function createProfessionalRuntime({ BrowserWindow, getProjectRoot, getSettings }) {
  let browser = null;
  let browserConsole = [];
  let browserNetwork = [];
  let dap = null;
  let dapThreadId = 1;

  async function ensureBrowser() {
    if (browser && !browser.isDestroyed()) return browser;
    browserConsole = []; browserNetwork = [];
    browser = new BrowserWindow({ show: false, width: 1365, height: 900, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, partition: `dama-browser-${randomUUID()}` } });
    browser.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    browser.webContents.on("console-message", (_event, level, message, line, sourceId) => { browserConsole.push({ level, message: String(message).slice(0, 2000), line, source: sourceId }); browserConsole = browserConsole.slice(-300); });
    browser.webContents.session.webRequest.onCompleted((details) => { browserNetwork.push({ url: details.url, method: details.method, status: details.statusCode, type: details.resourceType }); browserNetwork = browserNetwork.slice(-500); });
    return browser;
  }

  async function browserAutomation(input = {}) {
    const action = String(input.action || "inspect");
    if (action === "stop") { if (browser && !browser.isDestroyed()) browser.destroy(); browser = null; return { stopped: true }; }
    const win = await ensureBrowser();
    if (["start", "navigate"].includes(action)) {
      const url = new URL(String(input.url || ""));
      if (!/^https?:$/.test(url.protocol)) throw new Error("A automação aceita apenas HTTP e HTTPS.");
      await win.loadURL(url.href);
      if (input.wait_ms) await new Promise((resolve) => setTimeout(resolve, Math.min(15000, Number(input.wait_ms))));
    }
    if (action === "inspect" || action === "start" || action === "navigate") {
      const page = await win.webContents.executeJavaScript(`(() => { let n=0; const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'}; const controls=[...document.querySelectorAll('a,button,input,textarea,select,[role="button"],[contenteditable="true"]')].filter(visible).slice(0,250).map(e=>{const ref='dama-'+(++n);e.setAttribute('data-dama-agent-ref',ref);const r=e.getBoundingClientRect();return{ref,tag:e.tagName.toLowerCase(),text:(e.innerText||e.value||e.getAttribute('aria-label')||e.title||'').trim().slice(0,300),type:e.type||'',href:e.href||'',rect:{x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)}}}); return {url:location.href,title:document.title,text:(document.body?.innerText||'').slice(0,30000),controls}; })()`);
      return { ...page, console: browserConsole.slice(-30), network: browserNetwork.slice(-40) };
    }
    const selector = input.ref ? `[data-dama-agent-ref="${String(input.ref).replace(/[^\w-]/g, "")}"]` : String(input.selector || "");
    if (action === "click") return win.webContents.executeJavaScript(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e) throw new Error('Elemento não encontrado'); e.click(); return true; })()`);
    if (action === "type") return win.webContents.executeJavaScript(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e) throw new Error('Elemento não encontrado'); e.focus(); if('value' in e)e.value=${JSON.stringify(String(input.text || ""))}; else e.textContent=${JSON.stringify(String(input.text || ""))}; e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:${JSON.stringify(String(input.text || ""))}})); e.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
    if (action === "key") { win.webContents.sendInputEvent({ type: "keyDown", keyCode: String(input.key || "ENTER") }); win.webContents.sendInputEvent({ type: "keyUp", keyCode: String(input.key || "ENTER") }); return { sent: true }; }
    if (action === "wait") { await new Promise((resolve) => setTimeout(resolve, Math.min(15000, Math.max(100, Number(input.wait_ms || 500))))); return { waited: true }; }
    if (action === "console") return { entries: browserConsole.slice(-200) };
    if (action === "network") return { entries: browserNetwork.slice(-300) };
    if (action === "screenshot") {
      const root = getProjectRoot(); if (!root) throw new Error("Abra um projeto para salvar screenshots.");
      const relative = `.dama/artifacts/browser-${Date.now()}.png`; const target = path.join(root, relative);
      await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, (await win.webContents.capturePage()).toPNG());
      return { path: relative, url: win.webContents.getURL() };
    }
    throw new Error("Ação de navegador desconhecida.");
  }

  async function debuggerOperation(input = {}) {
    const root = getProjectRoot(); if (!root) throw new Error("Abra um projeto para depurar.");
    const action = String(input.action || "detect");
    if (action === "detect") return { adapters: [{ id: "python", installed: await commandAvailable(process.platform === "win32" ? "py" : "python3"), protocol: "DAP" }], active: Boolean(dap) };
    if (action === "start") {
      dap?.stop();
      const adapter = String(input.adapter || "python");
      if (adapter !== "python") throw new Error("Esta versão ativa DAP para Python; outros adaptadores podem ser fornecidos por plugins.");
      const python = process.platform === "win32" ? "py" : "python3";
      dap = new DapClient(python, ["-m", "debugpy.adapter"], root); dap.start();
      await dap.request("initialize", { clientID: "dama", clientName: "Dama", adapterID: "python", pathFormat: "path", linesStartAt1: true, columnsStartAt1: true, supportsVariableType: true });
      const program = path.resolve(root, assertProjectRelative(input.program, "Programa"));
      void dap.request("launch", { name: "Dama", type: "python", request: "launch", program, cwd: root, console: "internalConsole", justMyCode: input.just_my_code !== false }, 60000).catch((error) => dap.events.push({ event: "error", body: error.message }));
      await new Promise((resolve) => setTimeout(resolve, 500));
      await dap.request("configurationDone", {}, 30000).catch(() => {});
      return { started: true, adapter, program, events: dap.events.splice(0) };
    }
    if (!dap) throw new Error("Nenhuma sessão de depuração está ativa.");
    if (action === "set_breakpoints") {
      const source = path.resolve(root, assertProjectRelative(input.path, "Arquivo"));
      const response = await dap.request("setBreakpoints", { source: { path: source }, breakpoints: (input.lines || []).map((line) => ({ line: Number(line) })) });
      return { breakpoints: response.body?.breakpoints || [], events: dap.events.splice(0) };
    }
    if (action === "continue") return (await dap.request("continue", { threadId: Number(input.thread_id || dapThreadId) })).body;
    if (["next", "stepIn", "stepOut"].includes(action)) return (await dap.request(action, { threadId: Number(input.thread_id || dapThreadId) })).body;
    if (action === "threads") { const response = await dap.request("threads"); dapThreadId = response.body?.threads?.[0]?.id || 1; return { ...response.body, events: dap.events.splice(0) }; }
    if (action === "stack") return (await dap.request("stackTrace", { threadId: Number(input.thread_id || dapThreadId), startFrame: 0, levels: 100 })).body;
    if (action === "scopes") return (await dap.request("scopes", { frameId: Number(input.frame_id) })).body;
    if (action === "variables") return (await dap.request("variables", { variablesReference: Number(input.variables_reference), start: 0, count: 500 })).body;
    if (action === "evaluate") return (await dap.request("evaluate", { expression: String(input.expression || ""), frameId: input.frame_id == null ? undefined : Number(input.frame_id), context: "repl" })).body;
    if (action === "events") return { events: dap.events.splice(0) };
    if (action === "stop") { await dap.request("disconnect", { terminateDebuggee: true }, 5000).catch(() => {}); dap.stop(); dap = null; return { stopped: true }; }
    throw new Error("Ação de debugger desconhecida.");
  }

  return {
    gitOperation: (input) => gitOperation(getProjectRoot(), input),
    detectTests: () => detectTests(getProjectRoot()),
    runTests: (input, onOutput) => runTests(getProjectRoot(), input, onOutput),
    manageLsp: (input, onOutput) => manageLsp(getProjectRoot(), input, onOutput),
    webSearch,
    archiveOperation: (input) => archiveOperation(getProjectRoot(), input),
    listArchive: (archive) => listArchive(archive, getProjectRoot()),
    cliAgent: (input, onOutput) => cliAgent(getProjectRoot(), input, onOutput),
    pluginRuntime: async (input, onOutput) => pluginRuntime(await getSettings(), input, onOutput),
    browserAutomation,
    debuggerOperation,
    stopAll: () => { if (browser && !browser.isDestroyed()) browser.destroy(); browser = null; dap?.stop(); dap = null; },
  };
}

module.exports = { createProfessionalRuntime, detectTests, parseTestFailures, webSearch, listArchive, gitOperation };
