const path = require("node:path");
const fs = require("node:fs/promises");

let cachedAutoUpdater = null;

function electronAutoUpdater() {
  if (!cachedAutoUpdater) cachedAutoUpdater = require("electron-updater").autoUpdater;
  return cachedAutoUpdater;
}

function releaseNotesText(value) {
  if (typeof value === "string") return value.trim();
  if (!Array.isArray(value)) return "";
  return value.map((item) => typeof item === "string" ? item : item?.note || item?.version || "").filter(Boolean).join("\n\n").trim();
}

function publicError(error) {
  const message = String(error?.message || error || "Falha desconhecida ao procurar atualizações.");
  return message.replace(/https?:\/\/[^\s]+/gi, (url) => {
    try { const parsed = new URL(url); return `${parsed.origin}/…`; } catch { return "endereço de atualização"; }
  }).slice(0, 1200);
}

function versionParts(value) {
  return String(value || "0").replace(/^v/i, "").split(/[.-]/).slice(0, 3).map((part) => Number(part) || 0);
}

function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let index = 0; index < 3; index += 1) {
    if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) - (b[index] || 0);
  }
  return 0;
}

function selectPreviousRelease(releases, currentVersion) {
  return (Array.isArray(releases) ? releases : [])
    .filter((release) => !release?.draft && !release?.prerelease && compareVersions(release?.tag_name, currentVersion) < 0)
    .sort((left, right) => compareVersions(right?.tag_name, left?.tag_name))
    .map((release) => ({
      version: String(release.tag_name || "").replace(/^v/i, ""),
      name: release.name || release.tag_name,
      notes: releaseNotesText(release.body),
      asset: (release.assets || []).find((asset) => /^Dama-Setup-[\d.]+\.exe$/i.test(asset?.name || "")),
    }))
    .find((release) => release.asset) || null;
}

function createUpdateManager({ app, getWindow, readSettings, isDev, confirmRollback = async () => true, prepareRollback = async () => {}, launchInstaller = async () => {} }) {
  const autoUpdater = electronAutoUpdater();
  const metadataPath = () => path.join(app.getPath("userData"), "update-history.json");
  let started = false;
  let initialized = false;
  let checking = null;
  let installTimer = null;
  let metadata = { lastSeenVersion: null, pending: null, history: [] };
  let state = {
    supported: !isDev && process.platform === "win32",
    status: !isDev && process.platform === "win32" ? "idle" : "unsupported",
    currentVersion: app.getVersion(),
    version: null,
    releaseName: null,
    releaseNotes: "",
    releaseDate: null,
    percent: 0,
    transferred: 0,
    total: 0,
    bytesPerSecond: 0,
    automatic: true,
    error: null,
    postUpdate: null,
    rollbackStatus: "idle",
    rollbackPercent: 0,
    rollbackError: null,
  };

  function publish(patch = {}) {
    state = { ...state, ...patch };
    const window = getWindow();
    if (window && !window.isDestroyed()) window.webContents.send("updates:state", state);
    return state;
  }

  async function readPackagedNotes() {
    try { return (await fs.readFile(path.join(app.getAppPath(), "build", "release-notes.md"), "utf8")).trim(); }
    catch { return "Melhorias de estabilidade, segurança e experiência da Dama."; }
  }

  async function writeMetadata() {
    await fs.mkdir(path.dirname(metadataPath()), { recursive: true });
    await fs.writeFile(metadataPath(), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  }

  async function initialize() {
    if (initialized) return state;
    initialized = true;
    let hadMetadata = false;
    try {
      metadata = { ...metadata, ...JSON.parse(await fs.readFile(metadataPath(), "utf8")) };
      hadMetadata = true;
    } catch {}
    const currentVersion = app.getVersion();
    if (state.supported && metadata.lastSeenVersion !== currentVersion) {
      const pending = metadata.pending?.toVersion === currentVersion ? metadata.pending : null;
      const userData = app.getPath("userData");
      const legacyInstallation = await Promise.all([
        fs.stat(path.join(userData, "dama-settings.json")).then(() => true).catch(() => false),
        fs.stat(path.join(userData, "dama-workspace.json")).then(() => true).catch(() => false),
      ]).then((entries) => entries.some(Boolean));
      if (pending || hadMetadata || legacyInstallation) {
        state.postUpdate = {
          version: currentVersion,
          previousVersion: pending?.fromVersion || metadata.lastSeenVersion || null,
          releaseName: pending?.releaseName || `Dama ${currentVersion}`,
          releaseNotes: pending?.releaseNotes || await readPackagedNotes(),
          releaseDate: pending?.releaseDate || null,
        };
      } else {
        // Em uma instalação realmente nova não há atualização para anunciar.
        metadata.lastSeenVersion = currentVersion;
        await writeMetadata();
      }
    }
    return state;
  }

  async function automaticEnabled() {
    const settings = await readSettings();
    return settings.updates?.automatic !== false;
  }

  function wireEvents() {
    if (started || !state.supported) return;
    started = true;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowDowngrade = false;
    autoUpdater.on("checking-for-update", () => publish({ status: "checking", error: null }));
    autoUpdater.on("update-not-available", (info) => publish({ status: "current", version: info?.version || null, error: null }));
    autoUpdater.on("update-available", async (info) => {
      const automatic = await automaticEnabled();
      publish({ status: "available", automatic, version: info?.version || null, releaseName: info?.releaseName || null, releaseNotes: releaseNotesText(info?.releaseNotes), releaseDate: info?.releaseDate || null, percent: 0, transferred: 0, total: 0, bytesPerSecond: 0, error: null });
      if (automatic) void download();
    });
    autoUpdater.on("download-progress", (progress) => publish({ status: "downloading", percent: Math.max(0, Math.min(100, Number(progress?.percent || 0))), transferred: Number(progress?.transferred || 0), total: Number(progress?.total || 0), bytesPerSecond: Number(progress?.bytesPerSecond || 0), error: null }));
    autoUpdater.on("update-downloaded", (info) => {
      publish({ status: "downloaded", version: info?.version || state.version, releaseName: info?.releaseName || state.releaseName, releaseNotes: releaseNotesText(info?.releaseNotes) || state.releaseNotes, percent: 100, error: null });
      if (state.automatic) install(950);
    });
    autoUpdater.on("error", (error) => publish({ status: "error", error: publicError(error) }));
  }

  async function check() {
    await initialize();
    if (!state.supported) return publish({ status: "unsupported" });
    wireEvents();
    if (checking) return checking;
    publish({ status: "checking", error: null });
    checking = autoUpdater.checkForUpdates().then(() => state).catch((error) => publish({ status: "error", error: publicError(error) })).finally(() => { checking = null; });
    return checking;
  }

  async function download() {
    if (!state.supported) return state;
    wireEvents();
    publish({ status: "downloading", error: null });
    try { await autoUpdater.downloadUpdate(); } catch (error) { publish({ status: "error", error: publicError(error) }); }
    return state;
  }

  async function rememberPendingUpdate() {
    metadata.pending = { fromVersion: app.getVersion(), toVersion: state.version, releaseName: state.releaseName, releaseNotes: state.releaseNotes, releaseDate: state.releaseDate, recordedAt: new Date().toISOString() };
    await writeMetadata();
  }

  function install(delay = 120) {
    if (!state.supported || state.status !== "downloaded") return false;
    if (installTimer) clearTimeout(installTimer);
    publish({ status: "installing", percent: 100, error: null });
    void rememberPendingUpdate().then(() => { installTimer = setTimeout(() => autoUpdater.quitAndInstall(true, true), delay); }).catch((error) => publish({ status: "error", error: publicError(error) }));
    return true;
  }

  async function acknowledgePostUpdate() {
    if (state.postUpdate) {
      metadata.history = [state.postUpdate, ...(metadata.history || []).filter((item) => item.version !== state.postUpdate.version)].slice(0, 20);
      metadata.lastSeenVersion = app.getVersion();
      metadata.pending = null;
      await writeMetadata();
    }
    return publish({ postUpdate: null });
  }

  async function downloadRollbackAsset(release) {
    const response = await fetch(release.asset.browser_download_url, { headers: { Accept: "application/octet-stream", "User-Agent": "Dama-IDE-Updater" }, redirect: "follow" });
    if (!response.ok || !response.body) throw new Error(`O GitHub respondeu ${response.status} ao baixar a versão anterior.`);
    const expected = Number(release.asset.size || response.headers.get("content-length") || 0);
    if (expected > 350 * 1024 * 1024) throw new Error("O instalador de rollback excede o limite de segurança.");
    const directory = path.join(app.getPath("userData"), "updates", "rollback");
    await fs.mkdir(directory, { recursive: true });
    const target = path.join(directory, release.asset.name);
    const temporary = `${target}.download`;
    const file = await fs.open(temporary, "w");
    let transferred = 0;
    try {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        transferred += value.byteLength;
        if (transferred > 350 * 1024 * 1024) throw new Error("O download excedeu o limite de segurança.");
        await file.write(value);
        publish({ rollbackStatus: "downloading", rollbackPercent: expected ? Math.min(100, (transferred / expected) * 100) : 0, rollbackError: null });
      }
    } finally { await file.close(); }
    const header = Buffer.alloc(2);
    const verify = await fs.open(temporary, "r");
    try { await verify.read(header, 0, 2, 0); } finally { await verify.close(); }
    if (header.toString("ascii") !== "MZ") throw new Error("O arquivo baixado não é um instalador Windows válido.");
    await fs.rm(target, { force: true });
    await fs.rename(temporary, target);
    return target;
  }

  async function rollback() {
    if (!state.supported || state.rollbackStatus === "downloading") return state;
    publish({ rollbackStatus: "checking", rollbackPercent: 0, rollbackError: null });
    try {
      const response = await fetch("https://api.github.com/repos/lucasalto5/Dama-IDE/releases?per_page=30", { headers: { Accept: "application/vnd.github+json", "User-Agent": "Dama-IDE-Updater" } });
      if (!response.ok) throw new Error(`O GitHub respondeu ${response.status} ao procurar versões anteriores.`);
      const release = selectPreviousRelease(await response.json(), app.getVersion());
      if (!release) throw new Error("Nenhuma versão anterior compatível foi encontrada.");
      if (!await confirmRollback(release)) return publish({ rollbackStatus: "idle", rollbackPercent: 0 });
      const installer = await downloadRollbackAsset(release);
      await prepareRollback(release);
      publish({ rollbackStatus: "ready", rollbackPercent: 100, rollbackError: null });
      await launchInstaller(installer, release);
    } catch (error) {
      publish({ rollbackStatus: "error", rollbackError: publicError(error) });
    }
    return state;
  }

  async function start() {
    await initialize();
    const settings = await readSettings();
    state.automatic = settings.updates?.automatic !== false;
    if (!state.supported || settings.updates?.checkOnStartup === false) return state;
    return check();
  }

  return { initialize, start, check, download, install, rollback, acknowledgePostUpdate, getState: () => state, releaseNotesText, publicError };
}

module.exports = { compareVersions, createUpdateManager, publicError, releaseNotesText, selectPreviousRelease };
