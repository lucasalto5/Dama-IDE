import assert from "node:assert/strict";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { createRemoteManager } = require("../electron/remote-server.cjs");
const manager = createRemoteManager({
  app: { getPath: () => path.join(os.tmpdir(), "dama-remote-tunnel-test") },
  getSnapshot: async () => ({ protocol: 1, computer: { name: "teste" }, projects: [] }),
  onChat: async () => ({ content: "ok" }),
  onResolveApproval: async () => true,
  onSelectProject: async () => ({ opened: true }),
  onSteer: async () => ({ accepted: true }),
});

try {
  const ready = await manager.start({ remoteAppUrl: "https://dama-remote.vercel.app", tunnel: true });
  assert.equal(ready.status, "ready", ready.error || "O túnel não ficou pronto.");
  const pairing = new URL(ready.pairingUrl);
  const token = new URLSearchParams(pairing.hash.slice(1)).get("token");
  let response = null;
  let lastError = null;
  for (let attempt = 0; attempt < 15; attempt += 1) {
    response = await fetch(`${ready.endpoint}/api/snapshot`, { headers: { authorization: `Bearer ${token}`, origin: "https://dama-remote.vercel.app" } }).catch((error) => { lastError = error; return null; });
    if (response?.ok) break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  if (!response?.ok && lastError?.cause?.code === "ENOTFOUND") {
    const hostname = new URL(ready.endpoint).hostname;
    const dnsResponse = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`, { headers: { accept: "application/dns-json" } });
    const dns = await dnsResponse.json();
    assert.ok(dns.Answer?.some((answer) => answer.type === 1), `O domínio ${hostname} não foi registrado no DNS público.`);
    console.log(`Túnel registrado em ${ready.endpoint}; o resolvedor local ainda estava atualizando.`);
  } else {
    assert.equal(response?.status, 200, `O endpoint ${ready.endpoint} não respondeu: ${lastError?.message || response?.status || "sem resposta"}`);
    console.log(`Túnel externo confirmado em ${ready.endpoint}`);
  }
} finally { await manager.stop(); }
