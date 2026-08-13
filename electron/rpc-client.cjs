const { spawn } = require("node:child_process");

function createFramedRpc(command, args = [], options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...(options.env || {}) },
    windowsHide: true,
    shell: Boolean(options.shell),
    stdio: ["pipe", "pipe", "pipe"],
  });
  let sequence = 0;
  let buffer = Buffer.alloc(0);
  let stderr = "";
  const pending = new Map();
  const notifications = new Map();

  function failAll(error) {
    for (const record of pending.values()) record.reject(error);
    pending.clear();
  }

  child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-24000); });
  child.on("error", (error) => failAll(error));
  child.on("exit", (code) => failAll(new Error(`O processo RPC encerrou com código ${code}.${stderr ? `\n${stderr}` : ""}`)));
  child.stdout.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) break;
      const header = buffer.subarray(0, headerEnd).toString("ascii");
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) { buffer = buffer.subarray(headerEnd + 4); continue; }
      const length = Number(match[1]);
      if (buffer.length < headerEnd + 4 + length) break;
      const body = buffer.subarray(headerEnd + 4, headerEnd + 4 + length).toString("utf8");
      buffer = buffer.subarray(headerEnd + 4 + length);
      let message;
      try { message = JSON.parse(body); } catch { continue; }
      if (Object.prototype.hasOwnProperty.call(message, "id")) {
        const record = pending.get(message.id);
        if (!record) continue;
        pending.delete(message.id);
        if (message.error) record.reject(new Error(message.error.message || "O servidor RPC retornou um erro."));
        else record.resolve(message.result);
      } else if (message.method) {
        const handlers = notifications.get(message.method) || [];
        for (const handler of handlers) handler(message.params);
      }
    }
  });

  function send(message) {
    const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...message }), "utf8");
    child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
    child.stdin.write(body);
  }

  function request(method, params, timeoutMs = options.timeoutMs || 30000) {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`O servidor RPC não respondeu a ${method} dentro do prazo.`));
      }, timeoutMs);
      pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
      send({ id, method, params });
    });
  }

  function notify(method, params) { send({ method, params }); }
  function on(method, handler) {
    notifications.set(method, [...(notifications.get(method) || []), handler]);
  }
  function close() {
    try { child.stdin.end(); } catch {}
    if (!child.killed) child.kill();
  }
  return { child, request, notify, on, close, getStderr: () => stderr };
}

module.exports = { createFramedRpc };
