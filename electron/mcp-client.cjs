const { createFramedRpc } = require("./rpc-client.cjs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

function splitCommandLine(value) {
  if (/[&|<>`%\^!\r\n]/.test(String(value || ""))) throw new Error("O comando MCP contém operadores de shell não permitidos.");
  const parts = [];
  let current = "";
  let quote = null;
  for (const character of String(value || "").trim()) {
    if (quote) {
      if (character === quote) quote = null;
      else current += character;
    } else if (character === '"' || character === "'") quote = character;
    else if (/\s/.test(character)) { if (current) { parts.push(current); current = ""; } }
    else current += character;
  }
  if (quote) throw new Error("O comando MCP possui aspas não fechadas.");
  if (current) parts.push(current);
  return parts;
}

async function runStdio(server, operation, cwd) {
  const commandParts = splitCommandLine(server.command);
  if (!commandParts.length) throw new Error("O servidor MCP não possui comando.");
  const extraArgs = Array.isArray(server.args) ? server.args : splitCommandLine(server.args || "");
  let executable = commandParts[0];
  if (!path.isAbsolute(executable)) {
    const locator = process.platform === "win32" ? "where.exe" : "which";
    try { executable = (await execFileAsync(locator, [executable], { windowsHide: true, timeout: 5000 })).stdout.trim().split(/\r?\n/)[0]; }
    catch { throw new Error(`O executável MCP “${commandParts[0]}” não foi encontrado.`); }
  }
  let rpcArgs = [...commandParts.slice(1), ...extraArgs];
  if (process.platform === "win32" && /\.(?:cmd|bat)$/i.test(executable)) {
    const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
    rpcArgs = ["/d", "/s", "/c", `call ${quote(executable)} ${rpcArgs.map(quote).join(" ")}`];
    executable = process.env.ComSpec || "cmd.exe";
  }
  const rpc = createFramedRpc(executable, rpcArgs, {
    cwd,
    timeoutMs: 45000,
    shell: false,
  });
  try {
    await rpc.request("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "Dama", version: "0.8.0" },
    });
    rpc.notify("notifications/initialized", {});
    if (operation.action === "list_tools") return await rpc.request("tools/list", {});
    return await rpc.request("tools/call", { name: operation.tool, arguments: operation.arguments || {} }, 90000);
  } finally { rpc.close(); }
}

async function postRpc(url, body, sessionId) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
    },
    body: JSON.stringify(body),
    redirect: "error",
  });
  if (!response.ok) throw new Error(`O servidor MCP respondeu ${response.status} ${response.statusText}.`);
  const text = await response.text();
  if (!text.trim()) return { result: null, sessionId: response.headers.get("mcp-session-id") || sessionId };
  const payload = response.headers.get("content-type")?.includes("text/event-stream")
    ? text.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).filter((line) => line && line !== "[DONE]").map((line) => JSON.parse(line)).at(-1)
    : JSON.parse(text);
  if (payload?.error) throw new Error(payload.error.message || "O servidor MCP retornou um erro.");
  return { result: payload?.result, sessionId: response.headers.get("mcp-session-id") || sessionId };
}

async function runHttp(server, operation) {
  const base = String(server.url || "");
  const url = new URL(base);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("O endpoint MCP deve usar HTTP ou HTTPS.");
  let id = 1;
  const initialized = await postRpc(url, { jsonrpc: "2.0", id: id++, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "Dama", version: "0.8.0" } } });
  await postRpc(url, { jsonrpc: "2.0", method: "notifications/initialized", params: {} }, initialized.sessionId);
  const method = operation.action === "list_tools" ? "tools/list" : "tools/call";
  const params = operation.action === "list_tools" ? {} : { name: operation.tool, arguments: operation.arguments || {} };
  return (await postRpc(url, { jsonrpc: "2.0", id: id++, method, params }, initialized.sessionId)).result;
}

async function runMcp(server, operation, cwd) {
  if (server.transport === "http") return runHttp(server, operation);
  return runStdio(server, operation, cwd);
}

module.exports = { runMcp, splitCommandLine };
