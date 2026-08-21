const path = require("node:path");
const fs = require("node:fs/promises");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");

const ignored = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", ".cache", "target", ".venv"]);
const textExtensions = new Set([".js", ".jsx", ".ts", ".tsx", ".json", ".md", ".css", ".scss", ".html", ".vue", ".svelte", ".py", ".go", ".rs", ".java", ".kt", ".c", ".h", ".cpp", ".hpp", ".yaml", ".yml", ".toml", ".txt", ".sql", ".sh", ".ps1"]);

function limited(value, size = 120000) {
  const text = String(value || "");
  return text.length > size ? `${text.slice(0, size)}\n… saída limitada pela Dama` : text;
}

function executable(command) {
  return process.platform === "win32" && ["npm", "npx", "pnpm", "yarn", "bun", "pip", "pytest", "vercel", "netlify", "wrangler", "gh", "glab", "act"].includes(command) ? `${command}.cmd` : command;
}

function runProcess(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable(command), args.map(String), {
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
    }, Math.min(1800000, Math.max(1000, Number(options.timeoutMs || 120000))));
    child.stdout?.on("data", (chunk) => { stdout = limited(stdout + chunk.toString()); options.onOutput?.("stdout", chunk.toString()); });
    child.stderr?.on("data", (chunk) => { stderr = limited(stderr + chunk.toString()); options.onOutput?.("stderr", chunk.toString()); });
    child.once("error", (error) => { clearTimeout(timeout); if (!finished) { finished = true; reject(error); } });
    child.once("close", (code, signal) => { clearTimeout(timeout); if (!finished) { finished = true; resolve({ code: code ?? -1, signal: signal || null, stdout, stderr, command: [command, ...args].join(" ") }); } });
    if (options.input != null) child.stdin?.end(String(options.input));
  });
}

async function exists(file) { try { await fs.access(file); return true; } catch { return false; } }
async function readJson(file) { try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return null; } }

function assertRelative(value, label = "Caminho") {
  const clean = String(value || "").trim().replaceAll("\\", "/");
  if (!clean || clean.includes("\0") || path.posix.isAbsolute(clean) || /^[A-Za-z]:/.test(clean) || clean.split("/").includes("..")) throw new Error(`${label} precisa ficar dentro do projeto.`);
  return clean;
}

function assertSimple(value, label = "Valor") {
  const clean = String(value || "").trim();
  if (!clean || clean.length > 500 || /[\r\n\0]/.test(clean)) throw new Error(`${label} inválido.`);
  return clean;
}

async function collectTextFiles(root, current = root, output = [], limit = 1600) {
  if (output.length >= limit) return output;
  let entries = [];
  try { entries = await fs.readdir(current, { withFileTypes: true }); } catch { return output; }
  for (const entry of entries) {
    if (output.length >= limit || ignored.has(entry.name)) continue;
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) await collectTextFiles(root, full, output, limit);
    else if (entry.isFile() && (textExtensions.has(path.extname(entry.name).toLowerCase()) || entry.name === "Dockerfile")) output.push(full);
  }
  return output;
}

function tokens(text) {
  return String(text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9_$.-]{2,}/g) || [];
}

async function semanticSearch(root, input = {}) {
  const query = String(input.query || "").trim();
  if (!query) throw new Error("Informe o conceito que deve ser buscado.");
  const queryTerms = new Set(tokens(query));
  const files = await collectTextFiles(root, root, [], Math.min(2400, Math.max(50, Number(input.max_files || 1200))));
  const documents = [];
  const documentFrequency = new Map();
  for (const file of files) {
    let content;
    try { content = await fs.readFile(file, "utf8"); } catch { continue; }
    if (content.length > 1500000 || content.includes("\0")) continue;
    const lines = content.split(/\r?\n/);
    for (let start = 0; start < lines.length; start += 32) {
      const excerpt = lines.slice(start, start + 40).join("\n");
      const termList = tokens(excerpt);
      if (!termList.length) continue;
      const frequencies = new Map();
      for (const term of termList) frequencies.set(term, (frequencies.get(term) || 0) + 1);
      for (const term of frequencies.keys()) documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
      documents.push({ path: path.relative(root, file).replaceAll("\\", "/"), start: start + 1, excerpt, frequencies, length: termList.length });
      if (documents.length >= 12000) break;
    }
    if (documents.length >= 12000) break;
  }
  const count = Math.max(1, documents.length);
  const results = documents.map((document) => {
    let score = 0;
    for (const term of queryTerms) {
      const tf = (document.frequencies.get(term) || 0) / document.length;
      const idf = Math.log((count + 1) / ((documentFrequency.get(term) || 0) + 1)) + 1;
      score += tf * idf;
      for (const candidate of document.frequencies.keys()) if (candidate.includes(term) || term.includes(candidate)) score += Math.min(0.008, (document.frequencies.get(candidate) || 0) / document.length * 0.15);
    }
    if (document.path.toLowerCase().includes(query.toLowerCase().replace(/\s+/g, "-"))) score += 0.05;
    return { path: document.path, line: document.start, score: Number(score.toFixed(5)), preview: document.excerpt.slice(0, 1200) };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, Math.min(30, Math.max(1, Number(input.limit || 12))));
  return { query, engine: "local-tfidf", indexedFiles: files.length, indexedChunks: documents.length, results };
}

async function httpRequest(input = {}) {
  const url = new URL(String(input.url || ""));
  if (!/^https?:$/.test(url.protocol)) throw new Error("O cliente HTTP aceita apenas HTTP e HTTPS.");
  const method = String(input.method || "GET").toUpperCase();
  if (!new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]).has(method)) throw new Error("Método HTTP não suportado.");
  const headers = {};
  for (const [key, value] of Object.entries(input.headers || {}).slice(0, 40)) headers[String(key).slice(0, 100)] = String(value).slice(0, 10000);
  let body = input.body;
  if (input.json !== undefined) { body = JSON.stringify(input.json); if (!Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) headers["content-type"] = "application/json"; }
  const started = Date.now();
  const response = await fetch(url, { method, headers, body: ["GET", "HEAD"].includes(method) ? undefined : String(body ?? ""), redirect: input.follow_redirects === false ? "manual" : "follow", signal: AbortSignal.timeout(Math.min(120000, Math.max(1000, Number(input.timeout_ms || 30000)))) });
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "";
  const text = /(?:json|text|xml|javascript|urlencoded)/i.test(contentType) ? buffer.toString("utf8") : null;
  let parsed = null;
  if (/json/i.test(contentType) && text) try { parsed = JSON.parse(text); } catch {}
  const responseHeaders = {};
  response.headers.forEach((value, key) => { if (!/set-cookie|authorization/i.test(key)) responseHeaders[key] = value; });
  return { url: response.url, method, status: response.status, ok: response.ok, durationMs: Date.now() - started, headers: responseHeaders, bytes: buffer.length, body: parsed ?? (text == null ? `[binário: ${buffer.length} bytes]` : limited(text, 80000)) };
}

async function gitCompare(root, input = {}) {
  const base = assertSimple(input.base || "main", "Branch base");
  const compare = assertSimple(input.compare || "HEAD", "Branch comparada");
  const mode = String(input.mode || "summary");
  const args = mode === "files" ? ["diff", "--name-status", `${base}...${compare}`] : mode === "patch" ? ["diff", "--stat", "--patch", `${base}...${compare}`] : ["diff", "--stat", "--shortstat", `${base}...${compare}`];
  const result = await runProcess("git", args, { cwd: root, timeoutMs: 120000 });
  const commits = await runProcess("git", ["log", "--oneline", "--decorate", `${base}..${compare}`], { cwd: root, timeoutMs: 30000 });
  return { ...result, base, compare, mode, commits: limited(commits.stdout, 30000) };
}

async function detectAudit(root) {
  const options = [];
  if (await exists(path.join(root, "package.json"))) options.push({ id: "npm", command: "npm", args: ["audit", "--json"] });
  if (await exists(path.join(root, "requirements.txt")) || await exists(path.join(root, "pyproject.toml"))) options.push({ id: "pip-audit", command: "pip-audit", args: ["--format", "json"] });
  if (await exists(path.join(root, "Cargo.toml"))) options.push({ id: "cargo-audit", command: "cargo", args: ["audit", "--json"] });
  if (await exists(path.join(root, "go.mod"))) options.push({ id: "govulncheck", command: "govulncheck", args: ["-json", "./..."] });
  return options;
}

async function dependencyAudit(root, input = {}, onOutput) {
  const options = await detectAudit(root);
  if (input.action === "detect") return { auditors: options };
  const auditor = options.find((item) => item.id === input.auditor) || options[0];
  if (!auditor) throw new Error("Nenhum ecossistema compatível com auditoria foi detectado.");
  const result = await runProcess(auditor.command, auditor.args, { cwd: root, timeoutMs: 600000, onOutput });
  let report = null;
  try { report = JSON.parse(result.stdout || result.stderr); } catch {}
  return { ...result, auditor: auditor.id, report };
}

async function detectQuality(root) {
  const packageInfo = await readJson(path.join(root, "package.json"));
  const scripts = packageInfo?.scripts || {};
  const deps = { ...(packageInfo?.dependencies || {}), ...(packageInfo?.devDependencies || {}) };
  const tasks = [];
  const addScript = (id, names) => { const name = names.find((candidate) => scripts[candidate]); if (name) tasks.push({ id, command: "npm", args: ["run", name], mutates: /fix|format/.test(name) }); };
  addScript("lint", ["lint", "lint:check"]); addScript("format", ["format:check", "format"]); addScript("typecheck", ["typecheck", "type-check", "check:types"]); addScript("coverage", ["test:coverage", "coverage"]); addScript("deadcode", ["deadcode", "knip"]);
  if (!tasks.some((item) => item.id === "typecheck") && (await exists(path.join(root, "tsconfig.json")) || deps.typescript)) tasks.push({ id: "typecheck", command: "npx", args: ["tsc", "--noEmit"], mutates: false });
  if (!tasks.some((item) => item.id === "lint") && deps.eslint) tasks.push({ id: "lint", command: "npx", args: ["eslint", "."], mutates: false });
  if (!tasks.some((item) => item.id === "format") && deps.prettier) tasks.push({ id: "format", command: "npx", args: ["prettier", "--check", "."], mutates: false });
  if (!tasks.some((item) => item.id === "deadcode") && deps.knip) tasks.push({ id: "deadcode", command: "npx", args: ["knip"], mutates: false });
  if (await exists(path.join(root, "pyproject.toml"))) {
    tasks.push({ id: "python-lint", command: "python", args: ["-m", "ruff", "check", "."], mutates: false });
    tasks.push({ id: "python-typecheck", command: "python", args: ["-m", "mypy", "."], mutates: false });
  }
  if (await exists(path.join(root, "Cargo.toml"))) {
    tasks.push({ id: "rust-lint", command: "cargo", args: ["clippy", "--all-targets", "--", "-D", "warnings"], mutates: false });
    tasks.push({ id: "rust-format", command: "cargo", args: ["fmt", "--", "--check"], mutates: false });
  }
  return tasks.filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index);
}

async function qualityCheck(root, input = {}, onOutput) {
  const tasks = await detectQuality(root);
  if (input.action === "detect") return { tasks };
  const selected = input.task === "all" ? tasks : [tasks.find((item) => item.id === input.task) || tasks[0]].filter(Boolean);
  if (!selected.length) throw new Error("Nenhuma tarefa de qualidade foi detectada.");
  const results = [];
  for (const task of selected) results.push({ task: task.id, ...(await runProcess(task.command, task.args, { cwd: root, timeoutMs: Number(input.timeout_seconds || 600) * 1000, onOutput })) });
  return { tasks: selected, passed: results.every((item) => item.code === 0), results };
}

async function detectBuilds(root) {
  const packageInfo = await readJson(path.join(root, "package.json"));
  const builds = [];
  if (packageInfo?.scripts?.build) builds.push({ id: "npm", command: "npm", args: ["run", "build"] });
  if (await exists(path.join(root, "Cargo.toml"))) builds.push({ id: "cargo", command: "cargo", args: ["build"] });
  if (await exists(path.join(root, "go.mod"))) builds.push({ id: "go", command: "go", args: ["build", "./..."] });
  if (await exists(path.join(root, "pyproject.toml"))) builds.push({ id: "python", command: "python", args: ["-m", "build"] });
  return builds;
}

async function buildProject(root, input = {}, onOutput) {
  const builds = await detectBuilds(root);
  if (input.action === "detect") return { builds };
  const build = builds.find((item) => item.id === input.builder) || builds[0];
  if (!build) throw new Error("Nenhuma rotina de build foi detectada.");
  return { builder: build.id, ...(await runProcess(build.command, build.args, { cwd: root, timeoutMs: Number(input.timeout_seconds || 900) * 1000, onOutput })) };
}

async function inspectCi(root) {
  const workflows = [];
  for (const directory of [".github/workflows", ".gitlab-ci.yml"]) {
    const target = path.join(root, directory);
    try {
      const stat = await fs.stat(target);
      if (stat.isFile()) workflows.push({ provider: "gitlab", path: directory, content: limited(await fs.readFile(target, "utf8"), 30000) });
      else for (const entry of await fs.readdir(target)) if (/\.ya?ml$/i.test(entry)) workflows.push({ provider: "github", path: `${directory}/${entry}`, content: limited(await fs.readFile(path.join(target, entry), "utf8"), 30000) });
    } catch {}
  }
  return workflows;
}

async function ciPipeline(root, input = {}, onOutput) {
  const workflows = await inspectCi(root);
  if (input.action === "inspect") return { workflows };
  if (input.action !== "run") throw new Error("Ação de CI desconhecida.");
  const provider = String(input.provider || workflows[0]?.provider || "github");
  if (provider !== "github") throw new Error("A execução local estruturada está disponível para GitHub Actions com o utilitário act; pipelines GitLab podem ser inspecionados.");
  const args = [];
  if (input.job) args.push("-j", assertSimple(input.job, "Job"));
  return { provider, ...(await runProcess("act", args, { cwd: root, timeoutMs: Number(input.timeout_seconds || 1200) * 1000, onOutput })) };
}

async function detectDeploy(root) {
  const packageInfo = await readJson(path.join(root, "package.json"));
  const options = [];
  if (await exists(path.join(root, "vercel.json")) || await exists(path.join(root, ".vercel"))) options.push({ id: "vercel", command: "npx", args: ["vercel", "--prod", "--yes"] });
  if (await exists(path.join(root, "netlify.toml"))) options.push({ id: "netlify", command: "npx", args: ["netlify", "deploy", "--prod"] });
  if (await exists(path.join(root, "wrangler.toml")) || await exists(path.join(root, "wrangler.jsonc"))) options.push({ id: "cloudflare", command: "npx", args: ["wrangler", "deploy"] });
  for (const [name, value] of Object.entries(packageInfo?.scripts || {})) if (/^(deploy|publish)(:|$)/.test(name)) options.push({ id: `npm:${name}`, command: "npm", args: ["run", name], script: value });
  return options;
}

async function deployProject(root, input = {}, onOutput) {
  const options = await detectDeploy(root);
  if (input.action === "detect") return { targets: options };
  const target = options.find((item) => item.id === input.target) || options[0];
  if (!target) throw new Error("Nenhuma configuração de deploy foi detectada. Configure Vercel, Netlify, Cloudflare ou um script deploy.");
  return { target: target.id, ...(await runProcess(target.command, target.args, { cwd: root, timeoutMs: Number(input.timeout_seconds || 1200) * 1000, onOutput })) };
}

async function forgeOperation(root, input = {}, onOutput) {
  const provider = String(input.provider || "github");
  const command = provider === "gitlab" ? "glab" : "gh";
  const action = String(input.action || "status");
  let args;
  if (action === "status") args = provider === "gitlab" ? ["auth", "status"] : ["auth", "status"];
  else if (action === "prs") args = provider === "gitlab" ? ["mr", "list"] : ["pr", "list", "--json", "number,title,state,url,headRefName,baseRefName"];
  else if (action === "issues") args = ["issue", "list"];
  else if (action === "reviews") args = provider === "gitlab" ? ["mr", "view", assertSimple(input.number, "Número")] : ["pr", "view", assertSimple(input.number, "Número"), "--json", "reviews,comments,reviewRequests,statusCheckRollup"];
  else if (action === "create_pr") {
    args = provider === "gitlab" ? ["mr", "create", "--title", assertSimple(input.title, "Título"), "--description", String(input.body || "").slice(0, 10000)] : ["pr", "create", "--title", assertSimple(input.title, "Título"), "--body", String(input.body || "").slice(0, 10000)];
    if (input.base) args.push("--base", assertSimple(input.base, "Branch base"));
  } else if (action === "create_issue") args = ["issue", "create", "--title", assertSimple(input.title, "Título"), "--body", String(input.body || "").slice(0, 10000)];
  else throw new Error("Operação de GitHub/GitLab desconhecida.");
  return { provider, action, ...(await runProcess(command, args, { cwd: root, timeoutMs: 300000, onOutput })) };
}

async function screenshotDiff(root, nativeImage, input = {}) {
  const before = assertRelative(input.before, "Imagem anterior");
  const after = assertRelative(input.after, "Imagem posterior");
  const beforeImage = nativeImage.createFromPath(path.join(root, before));
  const afterImage = nativeImage.createFromPath(path.join(root, after));
  if (beforeImage.isEmpty() || afterImage.isEmpty()) throw new Error("Não foi possível abrir uma das screenshots.");
  const sizeA = beforeImage.getSize(); const sizeB = afterImage.getSize();
  if (sizeA.width !== sizeB.width || sizeA.height !== sizeB.height) throw new Error(`As screenshots precisam ter o mesmo tamanho (${sizeA.width}×${sizeA.height} contra ${sizeB.width}×${sizeB.height}).`);
  const a = beforeImage.toBitmap(); const b = afterImage.toBitmap(); const diff = Buffer.alloc(a.length);
  const threshold = Math.min(255, Math.max(0, Number(input.threshold || 16)));
  let changed = 0;
  for (let index = 0; index < a.length; index += 4) {
    const delta = Math.max(Math.abs(a[index] - b[index]), Math.abs(a[index + 1] - b[index + 1]), Math.abs(a[index + 2] - b[index + 2]));
    if (delta > threshold) { changed += 1; diff[index] = 40; diff[index + 1] = 40; diff[index + 2] = 255; diff[index + 3] = 255; }
    else { const gray = Math.round((a[index] + a[index + 1] + a[index + 2]) / 3 * 0.28); diff[index] = gray; diff[index + 1] = gray; diff[index + 2] = gray; diff[index + 3] = 255; }
  }
  const output = assertRelative(input.output || `.dama/artifacts/screenshot-diff-${Date.now()}.png`, "Saída");
  const target = path.join(root, output); await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, nativeImage.createFromBitmap(diff, sizeA).toPNG());
  const pixels = sizeA.width * sizeA.height;
  return { before, after, output, width: sizeA.width, height: sizeA.height, changedPixels: changed, totalPixels: pixels, changedPercent: Number((changed / Math.max(1, pixels) * 100).toFixed(3)), threshold };
}

async function checkpointOperation(root, dataDirectory, input = {}, onOutput) {
  const directory = path.join(dataDirectory, "manual-checkpoints"); await fs.mkdir(directory, { recursive: true });
  const metadataFile = path.join(directory, "index.json");
  let records = await readJson(metadataFile); if (!Array.isArray(records)) records = [];
  const action = String(input.action || "list");
  if (action === "list") return { checkpoints: records.filter((item) => item.project === root).slice(-100).reverse() };
  if (action === "create") {
    const id = `${Date.now()}-${randomUUID().slice(0, 8)}`; const ref = `refs/dama/checkpoints/${id}`;
    const snapshot = await runProcess("git", ["stash", "create", String(input.label || "Checkpoint manual da Dama").slice(0, 200)], { cwd: root, timeoutMs: 120000, onOutput });
    if (snapshot.code !== 0) throw new Error(snapshot.stderr || "Não foi possível criar o checkpoint Git.");
    const commit = snapshot.stdout.trim();
    const head = await runProcess("git", ["rev-parse", "HEAD"], { cwd: root, timeoutMs: 30000 });
    const record = { id, project: root, label: String(input.label || "Checkpoint manual").slice(0, 200), createdAt: new Date().toISOString(), commit: commit || head.stdout.trim(), dirty: Boolean(commit), ref: commit ? ref : null };
    if (commit) { const kept = await runProcess("git", ["update-ref", ref, commit], { cwd: root, timeoutMs: 30000 }); if (kept.code !== 0) throw new Error(kept.stderr || "Não foi possível preservar o checkpoint."); }
    records.push(record); records = records.slice(-500); await fs.writeFile(metadataFile, JSON.stringify(records, null, 2), "utf8"); return record;
  }
  const record = records.find((item) => item.id === input.id && item.project === root);
  if (!record) throw new Error("Checkpoint não encontrado para este projeto.");
  if (action === "restore") {
    if (!record.dirty) return { ...record, restored: true, detail: "O checkpoint representava um workspace limpo; não havia alterações para reaplicar." };
    const result = await runProcess("git", ["stash", "apply", "--index", record.commit], { cwd: root, timeoutMs: 180000, onOutput });
    return { ...record, ...result, restored: result.code === 0 };
  }
  if (action === "delete") {
    if (record.ref) await runProcess("git", ["update-ref", "-d", record.ref], { cwd: root, timeoutMs: 30000 });
    records = records.filter((item) => item.id !== record.id); await fs.writeFile(metadataFile, JSON.stringify(records, null, 2), "utf8"); return { deleted: true, id: record.id };
  }
  throw new Error("Ação de checkpoint desconhecida.");
}

function createDevelopmentRuntime({ getProjectRoot, getUserData, nativeImage }) {
  const root = () => { const value = getProjectRoot(); if (!value) throw new Error("Abra um projeto para usar esta ferramenta."); return value; };
  return {
    semanticSearch: (input) => semanticSearch(root(), input),
    httpRequest,
    gitCompare: (input) => gitCompare(root(), input),
    dependencyAudit: (input, onOutput) => dependencyAudit(root(), input, onOutput),
    qualityCheck: (input, onOutput) => qualityCheck(root(), input, onOutput),
    buildProject: (input, onOutput) => buildProject(root(), input, onOutput),
    ciPipeline: (input, onOutput) => ciPipeline(root(), input, onOutput),
    deployProject: (input, onOutput) => deployProject(root(), input, onOutput),
    forgeOperation: (input, onOutput) => forgeOperation(root(), input, onOutput),
    screenshotDiff: (input) => screenshotDiff(root(), nativeImage, input),
    checkpointOperation: (input, onOutput) => checkpointOperation(root(), getUserData(), input, onOutput),
  };
}

module.exports = { createDevelopmentRuntime, semanticSearch, httpRequest, gitCompare, detectAudit, detectQuality, detectBuilds, inspectCi, detectDeploy };
