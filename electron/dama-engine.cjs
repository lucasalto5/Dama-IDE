const path = require("node:path");
const fs = require("node:fs/promises");
const { createHash } = require("node:crypto");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const COMPONENT_ID = "dama-ai";
const COMPONENT_MANIFEST_URL = "https://github.com/lucasalto5/Dama-IDE/releases/latest/download/dama-ai-component.json";
const MAX_COMPONENT_BYTES = 50 * 1024 * 1024;
const execFileAsync = promisify(execFile);

function isSafeRelativePath(value) {
  const normalized = String(value || "").replaceAll("\\", "/");
  return Boolean(normalized)
    && !normalized.startsWith("/")
    && !normalized.includes(":")
    && !normalized.split("/").includes("..")
    && !path.isAbsolute(normalized);
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function fileSha256(filePath) {
  const content = await fs.readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

function validateRemoteDescriptor(value) {
  const descriptor = value && typeof value === "object" ? value : {};
  if (descriptor.id !== COMPONENT_ID) throw new Error("O catálogo remoto não pertence ao Dama AI.");
  if (!/^\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?$/i.test(String(descriptor.version || ""))) throw new Error("O catálogo remoto informou uma versão inválida.");
  if (!/^Dama-AI-Component-[\w.-]+\.zip$/i.test(String(descriptor.asset || ""))) throw new Error("O catálogo remoto informou um arquivo inválido.");
  if (!/^[a-f0-9]{64}$/i.test(String(descriptor.sha256 || ""))) throw new Error("O catálogo remoto não contém uma assinatura SHA-256 válida.");
  const size = Number(descriptor.size || 0);
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_COMPONENT_BYTES) throw new Error("O tamanho informado para o Dama AI é inválido.");
  return { id: COMPONENT_ID, version: String(descriptor.version), asset: String(descriptor.asset), sha256: String(descriptor.sha256).toLowerCase(), size };
}

async function listExtractedFiles(root, current = root, output = []) {
  for (const item of await fs.readdir(current, { withFileTypes: true })) {
    const target = path.join(current, item.name);
    const relative = path.relative(root, target).replaceAll("\\", "/");
    if (!isSafeRelativePath(relative)) throw new Error("O pacote contém um caminho inseguro.");
    const stat = await fs.lstat(target);
    if (stat.isSymbolicLink()) throw new Error(`O pacote contém um link não permitido: ${relative}`);
    if (stat.isDirectory()) await listExtractedFiles(root, target, output);
    else if (stat.isFile()) output.push({ path: relative, size: stat.size });
    else throw new Error(`O pacote contém uma entrada não suportada: ${relative}`);
  }
  return output;
}

async function extractZipArchive(archivePath, destination) {
  await fs.mkdir(destination, { recursive: true });
  try {
    const listing = await execFileAsync("tar.exe", ["-tf", archivePath], { windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024 });
    const entries = String(listing.stdout || "").split(/\r?\n/).map((entry) => entry.trim().replace(/\/$/, "")).filter(Boolean);
    if (!entries.length || entries.some((entry) => !isSafeRelativePath(entry))) throw new Error("O ZIP contém um caminho inseguro.");
    await execFileAsync("tar.exe", ["-xf", archivePath, "-C", destination], { windowsHide: true, timeout: 60000, maxBuffer: 1024 * 1024 });
  } catch (error) {
    throw new Error(`Não foi possível extrair o componente do Dama AI: ${error.message}`);
  }
}

function createDamaEngineManager(app, projectDirectory, options = {}) {
  const manifestUrl = options.manifestUrl || COMPONENT_MANIFEST_URL;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const extractArchive = options.extractArchive || extractZipArchive;
  const onProgress = options.onProgress || (() => {});
  const userComponentRoot = () => path.join(app.getPath("userData"), "components", COMPONENT_ID);
  const packagedComponentRoot = () => path.join(process.resourcesPath, "dama-engine");
  const developmentPayloadRoot = () => path.join(projectDirectory, "dama-engine-payload");

  async function findInstalledRoot() {
    const candidates = app.isPackaged
      ? [userComponentRoot(), packagedComponentRoot()]
      : [userComponentRoot()];
    for (const candidate of candidates) {
      try {
        const manifest = await readJson(path.join(candidate, "manifest.json"));
        if (manifest.id === COMPONENT_ID) return { root: candidate, manifest };
      } catch {}
    }
    return null;
  }

  async function persistPackagedComponent(installed) {
    if (!app.isPackaged) return installed;
    if (!installed || path.resolve(installed.root) !== path.resolve(packagedComponentRoot())) return installed;
    const problems = await verifyRoot(installed.root, installed.manifest);
    if (problems.length) return installed;
    const target = userComponentRoot();
    const staging = `${target}.migrating`;
    await fs.rm(staging, { recursive: true, force: true });
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.cp(installed.root, staging, { recursive: true, errorOnExist: false, force: true });
    await fs.rm(target, { recursive: true, force: true });
    await fs.rename(staging, target);
    return { root: target, manifest: installed.manifest };
  }

  async function verifyRoot(root, manifest) {
    const problems = [];
    for (const file of Array.isArray(manifest.files) ? manifest.files : []) {
      if (!isSafeRelativePath(file.path)) {
        problems.push(`${file.path || "arquivo"}: caminho inválido`);
        continue;
      }
      const target = path.join(root, file.path);
      try {
        const stat = await fs.stat(target);
        if (!stat.isFile() || stat.size !== Number(file.size)) {
          problems.push(`${file.path}: tamanho inesperado`);
          continue;
        }
        const hash = await fileSha256(target);
        if (hash !== String(file.sha256 || "").toLowerCase()) problems.push(`${file.path}: assinatura divergente`);
      } catch {
        problems.push(`${file.path}: ausente`);
      }
    }
    return problems;
  }

  function progress(status, percent, detail, error = null) {
    const state = { status, percent: Math.max(0, Math.min(100, Number(percent || 0))), detail, error };
    onProgress(state);
    return state;
  }

  async function fetchRemoteDescriptor() {
    progress("checking", 0, "Consultando o pacote oficial…");
    const response = await fetchImpl(manifestUrl, { headers: { Accept: "application/json", "User-Agent": "Dama-IDE-Component-Manager" }, redirect: "follow", cache: "no-store" });
    if (!response.ok) throw new Error(`O catálogo do Dama AI respondeu ${response.status}. Tente novamente mais tarde.`);
    const length = Number(response.headers?.get?.("content-length") || 0);
    if (length > 64 * 1024) throw new Error("O catálogo remoto excede o limite de segurança.");
    return validateRemoteDescriptor(await response.json());
  }

  async function downloadComponent(descriptor, archivePath) {
    const assetUrl = new URL(descriptor.asset, manifestUrl).toString();
    if (!options.allowInsecureDownloads) {
      const parsed = new URL(assetUrl);
      if (parsed.protocol !== "https:" || parsed.hostname !== "github.com" || !parsed.pathname.startsWith("/lucasalto5/Dama-IDE/releases/")) throw new Error("O catálogo tentou usar uma origem de download não autorizada.");
    }
    const response = await fetchImpl(assetUrl, { headers: { Accept: "application/octet-stream", "User-Agent": "Dama-IDE-Component-Manager" }, redirect: "follow", cache: "no-store" });
    if (!response.ok || !response.body) throw new Error(`O download do Dama AI respondeu ${response.status}.`);
    const headerSize = Number(response.headers?.get?.("content-length") || 0);
    if (headerSize && headerSize !== descriptor.size) throw new Error("O tamanho recebido não corresponde ao catálogo oficial.");
    const temporary = `${archivePath}.download`;
    const file = await fs.open(temporary, "w");
    const hash = createHash("sha256");
    let transferred = 0;
    try {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        transferred += value.byteLength;
        if (transferred > descriptor.size || transferred > MAX_COMPONENT_BYTES) throw new Error("O pacote excedeu o tamanho autorizado.");
        hash.update(value);
        await file.write(value);
        progress("downloading", (transferred / descriptor.size) * 100, `Baixando Dama AI · ${Math.round((transferred / descriptor.size) * 100)}%`);
      }
    } finally { await file.close(); }
    if (transferred !== descriptor.size) throw new Error("O download terminou incompleto.");
    if (hash.digest("hex") !== descriptor.sha256) throw new Error("A assinatura do pacote baixado não confere.");
    await fs.rm(archivePath, { force: true });
    await fs.rename(temporary, archivePath);
  }

  async function activateStaging(staging, target) {
    const backup = `${target}.previous`;
    await fs.rm(backup, { recursive: true, force: true });
    let movedPrevious = false;
    try {
      await fs.rename(target, backup);
      movedPrevious = true;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    try {
      await fs.rename(staging, target);
      await fs.rm(backup, { recursive: true, force: true });
    } catch (error) {
      if (movedPrevious) {
        await fs.rm(target, { recursive: true, force: true });
        await fs.rename(backup, target);
      }
      throw error;
    }
  }

  async function installRemoteComponent() {
    const downloads = path.join(app.getPath("userData"), "components", ".downloads");
    const target = userComponentRoot();
    const staging = `${target}.installing`;
    let archivePath = null;
    try {
      if (typeof fetchImpl !== "function") throw new Error("Este computador não possui suporte ao download seguro do componente.");
      const descriptor = await fetchRemoteDescriptor();
      await fs.mkdir(downloads, { recursive: true });
      archivePath = path.join(downloads, descriptor.asset);
      await downloadComponent(descriptor, archivePath);
      progress("verifying", 100, "Verificando arquivos do componente…");
      await fs.rm(staging, { recursive: true, force: true });
      await extractArchive(archivePath, staging);
      const extracted = await listExtractedFiles(staging);
      const manifest = await readJson(path.join(staging, "manifest.json"));
      if (manifest.id !== COMPONENT_ID || String(manifest.version) !== descriptor.version) throw new Error("O conteúdo extraído não corresponde ao catálogo oficial.");
      if (!Array.isArray(manifest.files) || !manifest.files.length) throw new Error("O pacote não declarou os arquivos do componente.");
      const declared = new Set(["manifest.json", ...(Array.isArray(manifest.files) ? manifest.files.map((file) => String(file.path).replaceAll("\\", "/")) : [])]);
      if (!isSafeRelativePath(manifest.promptFile) || !declared.has(String(manifest.promptFile).replaceAll("\\", "/"))) throw new Error("O pacote não declarou um perfil válido para o Dama AI.");
      const unknown = extracted.find((file) => !declared.has(file.path));
      if (unknown) throw new Error(`O pacote contém um arquivo não declarado: ${unknown.path}`);
      const unpackedSize = extracted.reduce((total, file) => total + file.size, 0);
      if (unpackedSize > MAX_COMPONENT_BYTES) throw new Error("O conteúdo extraído excede o limite de segurança.");
      const problems = await verifyRoot(staging, manifest);
      if (problems.length) throw new Error(`O Dama AI não passou na verificação: ${problems.join("; ")}`);
      progress("installing", 100, "Ativando o componente…");
      await fs.mkdir(path.dirname(target), { recursive: true });
      await activateStaging(staging, target);
      progress("done", 100, "Dama AI instalado.");
      return status({ verify: true });
    } catch (error) {
      progress("error", 0, "Não foi possível instalar o Dama AI.", error.message || String(error));
      throw error;
    } finally {
      await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
      if (archivePath) {
        await fs.rm(archivePath, { force: true }).catch(() => {});
        await fs.rm(`${archivePath}.download`, { force: true }).catch(() => {});
      }
    }
  }

  async function status({ verify = false } = {}) {
    const installed = await persistPackagedComponent(await findInstalledRoot());
    if (!installed) {
      return {
        id: COMPONENT_ID,
        installed: false,
        verified: false,
        version: null,
        source: "Carnaval IA / Dama",
        features: [],
        location: null,
        message: app.isPackaged
          ? "O componente ainda não está instalado. Você pode adicioná-lo por esta tela."
          : "O componente está disponível para instalação local neste ambiente de desenvolvimento.",
      };
    }
    const problems = verify ? await verifyRoot(installed.root, installed.manifest) : [];
    return {
      id: COMPONENT_ID,
      installed: true,
      verified: verify ? problems.length === 0 : null,
      version: installed.manifest.version,
      source: installed.manifest.source,
      features: installed.manifest.features || [],
      location: installed.root,
      message: problems.length ? `Falha de integridade: ${problems.join("; ")}` : "Motor local disponível.",
    };
  }

  async function installDevelopmentPayload() {
    if (app.isPackaged) throw new Error("Use o instalador da Dama para adicionar este componente.");
    const source = developmentPayloadRoot();
    const manifest = await readJson(path.join(source, "manifest.json"));
    const problems = await verifyRoot(source, manifest);
    if (problems.length) throw new Error(`O pacote local da Dama AI não passou na verificação: ${problems.join("; ")}`);
    const target = userComponentRoot();
    const staging = `${target}.installing`;
    await fs.rm(staging, { recursive: true, force: true });
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.cp(source, staging, { recursive: true, errorOnExist: false, force: true });
    await activateStaging(staging, target);
    return status({ verify: true });
  }

  async function removeUserComponent() {
    const target = userComponentRoot();
    await fs.rm(target, { recursive: true, force: true });
    return status();
  }

  async function promptAddon() {
    const installed = await findInstalledRoot();
    if (!installed) return "";
    if (isSafeRelativePath(installed.manifest.promptFile)) {
      try { return (await fs.readFile(path.join(installed.root, installed.manifest.promptFile), "utf8")).trim(); }
      catch {}
    }
    return String(installed.manifest.promptAddon || "").trim();
  }

  return { status, installDevelopmentPayload, installRemoteComponent, removeUserComponent, promptAddon };
}

module.exports = { COMPONENT_MANIFEST_URL, MAX_COMPONENT_BYTES, createDamaEngineManager, extractZipArchive, isSafeRelativePath, validateRemoteDescriptor };
