const path = require("node:path");
const fs = require("node:fs/promises");
const { createHash } = require("node:crypto");

const COMPONENT_ID = "dama-ai";

function isSafeRelativePath(value) {
  const normalized = String(value || "").replaceAll("\\", "/");
  return Boolean(normalized)
    && !normalized.startsWith("/")
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

function createDamaEngineManager(app, projectDirectory) {
  const userComponentRoot = () => path.join(app.getPath("userData"), "components", COMPONENT_ID);
  const packagedComponentRoot = () => path.join(process.resourcesPath, "dama-engine");
  const developmentPayloadRoot = () => path.join(projectDirectory, "dama-engine-payload");

  async function findInstalledRoot() {
    const candidates = app.isPackaged
      ? [packagedComponentRoot(), userComponentRoot()]
      : [userComponentRoot()];
    for (const candidate of candidates) {
      try {
        const manifest = await readJson(path.join(candidate, "manifest.json"));
        if (manifest.id === COMPONENT_ID) return { root: candidate, manifest };
      } catch {}
    }
    return null;
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

  async function status({ verify = false } = {}) {
    const installed = await findInstalledRoot();
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
          ? "O componente não foi selecionado no instalador. Execute o instalador novamente para adicioná-lo."
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
    await fs.rm(target, { recursive: true, force: true });
    await fs.rename(staging, target);
    return status({ verify: true });
  }

  async function removeUserComponent() {
    const target = userComponentRoot();
    await fs.rm(target, { recursive: true, force: true });
    const packaged = await findInstalledRoot();
    if (packaged && path.resolve(packaged.root) === path.resolve(packagedComponentRoot())) {
      throw new Error("Este componente foi instalado junto com a Dama. Execute o instalador novamente e desmarque Dama AI para removê-lo.");
    }
    return status();
  }

  async function promptAddon() {
    const installed = await findInstalledRoot();
    if (!installed) return "";
    return String(installed.manifest.promptAddon || "").trim();
  }

  return { status, installDevelopmentPayload, removeUserComponent, promptAddon };
}

module.exports = { createDamaEngineManager };
