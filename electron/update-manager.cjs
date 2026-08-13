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

function createUpdateManager({ app, getWindow, readSettings, isDev }) {
  const autoUpdater = electronAutoUpdater();
  let started = false;
  let checking = null;
  let installTimer = null;
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
  };

  function publish(patch = {}) {
    state = { ...state, ...patch };
    const window = getWindow();
    if (window && !window.isDestroyed()) window.webContents.send("updates:state", state);
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
      publish({
        status: "available",
        automatic,
        version: info?.version || null,
        releaseName: info?.releaseName || null,
        releaseNotes: releaseNotesText(info?.releaseNotes),
        releaseDate: info?.releaseDate || null,
        percent: 0,
        transferred: 0,
        total: 0,
        bytesPerSecond: 0,
        error: null,
      });
      if (automatic) void download();
    });
    autoUpdater.on("download-progress", (progress) => publish({
      status: "downloading",
      percent: Math.max(0, Math.min(100, Number(progress?.percent || 0))),
      transferred: Number(progress?.transferred || 0),
      total: Number(progress?.total || 0),
      bytesPerSecond: Number(progress?.bytesPerSecond || 0),
      error: null,
    }));
    autoUpdater.on("update-downloaded", (info) => {
      publish({
        status: "downloaded",
        version: info?.version || state.version,
        releaseName: info?.releaseName || state.releaseName,
        releaseNotes: releaseNotesText(info?.releaseNotes) || state.releaseNotes,
        percent: 100,
        error: null,
      });
      if (state.automatic) install(950);
    });
    autoUpdater.on("error", (error) => publish({ status: "error", error: publicError(error) }));
  }

  async function check() {
    if (!state.supported) return publish({ status: "unsupported" });
    wireEvents();
    if (checking) return checking;
    publish({ status: "checking", error: null });
    checking = autoUpdater.checkForUpdates()
      .then(() => state)
      .catch((error) => publish({ status: "error", error: publicError(error) }))
      .finally(() => { checking = null; });
    return checking;
  }

  async function download() {
    if (!state.supported) return state;
    wireEvents();
    publish({ status: "downloading", error: null });
    try { await autoUpdater.downloadUpdate(); }
    catch (error) { publish({ status: "error", error: publicError(error) }); }
    return state;
  }

  function install(delay = 120) {
    if (!state.supported || state.status !== "downloaded") return false;
    if (installTimer) clearTimeout(installTimer);
    publish({ status: "installing", percent: 100, error: null });
    installTimer = setTimeout(() => autoUpdater.quitAndInstall(true, true), delay);
    return true;
  }

  async function start() {
    const settings = await readSettings();
    state.automatic = settings.updates?.automatic !== false;
    if (!state.supported || settings.updates?.checkOnStartup === false) return state;
    return check();
  }

  return { start, check, download, install, getState: () => state, releaseNotesText, publicError };
}

module.exports = { createUpdateManager, releaseNotesText, publicError };
