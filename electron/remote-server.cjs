const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs/promises");
const { spawn, execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { randomBytes, createHash, timingSafeEqual } = require("node:crypto");
const QRCode = require("qrcode");

const execFileAsync = promisify(execFile);
const MAX_BODY_BYTES = 256 * 1024;
const CLOUDFLARED_ASSETS = {
  "win32-x64": "cloudflared-windows-amd64.exe",
  "win32-arm64": "cloudflared-windows-arm64.exe",
  "darwin-x64": "cloudflared-darwin-amd64.tgz",
  "darwin-arm64": "cloudflared-darwin-arm64.tgz",
  "linux-x64": "cloudflared-linux-amd64",
  "linux-arm64": "cloudflared-linux-arm64",
};

function constantTimeTokenMatches(expected, received) {
  const left = Buffer.from(String(expected || ""));
  const right = Buffer.from(String(received || ""));
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}

function safeJson(response, status, payload, origin, allowedOrigin) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  };
  if (origin && originAllowed(origin, allowedOrigin)) {
    headers["access-control-allow-origin"] = origin;
    headers.vary = "Origin";
  }
  response.writeHead(status, headers);
  response.end(JSON.stringify(payload));
}

function originAllowed(origin, configuredOrigin) {
  if (!origin) return true;
  if (configuredOrigin && origin === configuredOrigin) return true;
  return /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(origin);
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("A solicitação é grande demais."), { statusCode: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("JSON inválido."), { statusCode: 400 }); }
}

function normalizeRemoteAppUrl(value) {
  const parsed = new URL(String(value || "https://dama-remote.vercel.app"));
  if (parsed.protocol !== "https:" && !/^http:\/\/(?:localhost|127\.0\.0\.1)/i.test(parsed.href)) throw new Error("A URL do Dama Remote precisa usar HTTPS.");
  parsed.hash = "";
  parsed.search = "";
  return parsed.href.replace(/\/$/, "");
}

async function findSystemCloudflared() {
  const command = process.platform === "win32" ? "where.exe" : "which";
  try {
    const { stdout } = await execFileAsync(command, ["cloudflared"], { windowsHide: true, timeout: 5000 });
    return String(stdout || "").split(/\r?\n/).map((item) => item.trim()).find(Boolean) || null;
  } catch { return null; }
}

async function downloadCloudflared(app, onProgress) {
  const existing = await findSystemCloudflared();
  if (existing) return existing;
  const key = `${process.platform}-${process.arch}`;
  const assetName = CLOUDFLARED_ASSETS[key];
  if (!assetName || assetName.endsWith(".tgz")) throw new Error(`O túnel automático ainda não está disponível para ${key}. Instale cloudflared manualmente.`);
  const directory = path.join(app.getPath("userData"), "remote-runtime");
  const target = path.join(directory, process.platform === "win32" ? "cloudflared.exe" : "cloudflared");
  try { await fs.access(target); return target; } catch {}

  onProgress?.("downloading", "Baixando o componente oficial do túnel seguro…");
  await fs.mkdir(directory, { recursive: true });
  const releaseResponse = await fetch("https://api.github.com/repos/cloudflare/cloudflared/releases/latest", {
    headers: { accept: "application/vnd.github+json", "user-agent": "Dama-IDE-Remote" },
  });
  if (!releaseResponse.ok) throw new Error(`Não foi possível consultar o componente de acesso remoto (${releaseResponse.status}).`);
  const release = await releaseResponse.json();
  const asset = (release.assets || []).find((item) => item.name === assetName);
  if (!asset?.browser_download_url) throw new Error(`O componente ${assetName} não foi encontrado na versão oficial mais recente.`);
  const binaryResponse = await fetch(asset.browser_download_url, { headers: { "user-agent": "Dama-IDE-Remote" }, redirect: "follow" });
  if (!binaryResponse.ok) throw new Error(`O download do componente remoto falhou (${binaryResponse.status}).`);
  const data = Buffer.from(await binaryResponse.arrayBuffer());
  const digest = createHash("sha256").update(data).digest("hex");
  if (asset.digest && asset.digest !== `sha256:${digest}`) throw new Error("A integridade do componente remoto não pôde ser confirmada.");
  const temporary = `${target}.download`;
  await fs.writeFile(temporary, data, { mode: 0o755 });
  await fs.rename(temporary, target);
  if (process.platform !== "win32") await fs.chmod(target, 0o755);
  return target;
}

function createRemoteManager({ app, getSnapshot, onChat, onGetConversation, onCreateConversation, onSendConversationMessage, onResolveApproval, onSelectProject, onSteer, onStatus }) {
  let server = null;
  let tunnel = null;
  let tunnelOutput = "";
  let secret = "";
  let requestWindow = { startedAt: Date.now(), count: 0 };
  let state = {
    enabled: false,
    status: "off",
    endpoint: null,
    localPort: null,
    connected: false,
    lastSeenAt: null,
    pairingUrl: null,
    qrDataUrl: null,
    error: null,
    mode: "internet",
  };

  function publish(patch = {}) {
    state = { ...state, ...patch };
    onStatus?.(publicState());
    return publicState();
  }

  function publicState() {
    return { ...state };
  }

  function markSeen() {
    publish({ connected: true, lastSeenAt: new Date().toISOString() });
  }

  async function handle(request, response, allowedOrigin) {
    const origin = String(request.headers.origin || "");
    if (origin && !originAllowed(origin, allowedOrigin)) return safeJson(response, 403, { error: "Origem não autorizada." }, origin, allowedOrigin);
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "access-control-allow-origin": origin || allowedOrigin,
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "authorization, content-type",
        "access-control-max-age": "600",
        vary: "Origin",
      });
      return response.end();
    }
    const url = new URL(request.url || "/", "http://127.0.0.1");
    if (request.method === "GET" && url.pathname === "/api/health") return safeJson(response, 200, { ok: true, app: "Dama", protocol: 1 }, origin, allowedOrigin);
    const authorization = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!constantTimeTokenMatches(secret, authorization)) return safeJson(response, 401, { error: "Pareamento inválido ou expirado." }, origin, allowedOrigin);
    const now = Date.now();
    if (now - requestWindow.startedAt >= 60000) requestWindow = { startedAt: now, count: 0 };
    requestWindow.count += 1;
    if (requestWindow.count > 180) return safeJson(response, 429, { error: "Muitas solicitações nesta sessão. Aguarde alguns segundos." }, origin, allowedOrigin);
    markSeen();
    try {
      if (request.method === "GET" && url.pathname === "/api/snapshot") {
        return safeJson(response, 200, await getSnapshot(), origin, allowedOrigin);
      }
      if (request.method === "POST" && url.pathname === "/api/chat") {
        const body = await readJsonBody(request);
        return safeJson(response, 200, await onChat(body), origin, allowedOrigin);
      }
      if (request.method === "POST" && url.pathname === "/api/conversations") {
        const body = await readJsonBody(request);
        return safeJson(response, 201, await onCreateConversation(body), origin, allowedOrigin);
      }
      const conversationMessages = url.pathname.match(/^\/api\/conversations\/([a-f0-9-]+)\/messages$/i);
      if (request.method === "POST" && conversationMessages) {
        const body = await readJsonBody(request);
        return safeJson(response, 200, await onSendConversationMessage(conversationMessages[1], body), origin, allowedOrigin);
      }
      const conversation = url.pathname.match(/^\/api\/conversations\/([a-f0-9-]+)$/i);
      if (request.method === "GET" && conversation) {
        return safeJson(response, 200, await onGetConversation(conversation[1]), origin, allowedOrigin);
      }
      const approval = url.pathname.match(/^\/api\/approvals\/([a-f0-9-]+)$/i);
      if (request.method === "POST" && approval) {
        const body = await readJsonBody(request);
        return safeJson(response, 200, { accepted: await onResolveApproval(approval[1], body.decision) }, origin, allowedOrigin);
      }
      const project = url.pathname.match(/^\/api\/projects\/([a-f0-9-]+)\/open$/i);
      if (request.method === "POST" && project) {
        return safeJson(response, 200, await onSelectProject(project[1]), origin, allowedOrigin);
      }
      const steer = url.pathname.match(/^\/api\/agent\/([a-f0-9-]+)\/steer$/i);
      if (request.method === "POST" && steer) {
        const body = await readJsonBody(request);
        return safeJson(response, 200, await onSteer(steer[1], body.message), origin, allowedOrigin);
      }
      return safeJson(response, 404, { error: "Rota não encontrada." }, origin, allowedOrigin);
    } catch (error) {
      return safeJson(response, Number(error?.statusCode) || 500, { error: String(error?.message || error).slice(0, 1000) }, origin, allowedOrigin);
    }
  }

  async function openLocalServer(allowedOrigin) {
    return new Promise((resolve, reject) => {
      server = http.createServer((request, response) => void handle(request, response, allowedOrigin));
      server.on("error", reject);
      server.listen(0, "127.0.0.1", () => resolve(server.address().port));
    });
  }

  async function openQuickTunnel(localPort) {
    const executable = await downloadCloudflared(app, (status, detail) => publish({ status, error: null, detail }));
    return new Promise((resolve, reject) => {
      let settled = false;
      let timeout = null;
      const finish = (error, endpoint) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        error ? reject(error) : resolve(endpoint);
      };
      tunnel = spawn(executable, ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${localPort}`], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      const consume = (chunk) => {
        const text = String(chunk || "");
        tunnelOutput = `${tunnelOutput}${text}`.slice(-24000);
        const match = tunnelOutput.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
        if (match) finish(null, match[0]);
      };
      tunnel.stdout.on("data", consume);
      tunnel.stderr.on("data", consume);
      tunnel.on("error", (error) => finish(error));
      tunnel.on("exit", (code) => {
        if (!settled) finish(new Error(`O túnel remoto encerrou antes de conectar (código ${code ?? "desconhecido"}).`));
        else if (state.enabled) publish({ status: "error", enabled: false, connected: false, error: "A conexão externa foi encerrada." });
      });
      timeout = setTimeout(() => finish(new Error("O túnel remoto demorou demais para fornecer um endereço HTTPS.")), 45000);
    });
  }

  async function start({ remoteAppUrl, tunnel: useTunnel = true } = {}) {
    if (["starting", "downloading", "ready"].includes(state.status)) return publicState();
    await stop();
    secret = randomBytes(32).toString("base64url");
    requestWindow = { startedAt: Date.now(), count: 0 };
    const appUrl = normalizeRemoteAppUrl(remoteAppUrl);
    const allowedOrigin = new URL(appUrl).origin;
    publish({ enabled: true, status: "starting", endpoint: null, connected: false, lastSeenAt: null, pairingUrl: null, qrDataUrl: null, error: null, mode: useTunnel ? "internet" : "local" });
    try {
      const localPort = await openLocalServer(allowedOrigin);
      const endpoint = useTunnel ? await openQuickTunnel(localPort) : `http://127.0.0.1:${localPort}`;
      const pairingUrl = `${appUrl}/#endpoint=${encodeURIComponent(endpoint)}&token=${encodeURIComponent(secret)}`;
      const qrDataUrl = await QRCode.toDataURL(pairingUrl, { width: 300, margin: 2, color: { dark: "#191916", light: "#e9e5dc" } });
      return publish({ enabled: true, status: "ready", endpoint, localPort, pairingUrl, qrDataUrl, error: null });
    } catch (error) {
      await stop();
      return publish({ enabled: false, status: "error", error: String(error?.message || error) });
    }
  }

  async function stop() {
    if (tunnel && !tunnel.killed) try { tunnel.kill(); } catch {}
    tunnel = null;
    if (server) await new Promise((resolve) => server.close(() => resolve()));
    server = null;
    secret = "";
    tunnelOutput = "";
    return publish({ enabled: false, status: "off", endpoint: null, localPort: null, connected: false, lastSeenAt: null, pairingUrl: null, qrDataUrl: null, error: null });
  }

  return { start, stop, getState: publicState };
}

module.exports = { createRemoteManager, constantTimeTokenMatches, normalizeRemoteAppUrl, originAllowed };
