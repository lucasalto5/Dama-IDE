import assert from "node:assert/strict";
import { createRequire } from "node:module";
import os from "node:os";

const require = createRequire(import.meta.url);
const { createRemoteManager, constantTimeTokenMatches, normalizeRemoteAppUrl, originAllowed } = require("../electron/remote-server.cjs");

assert.equal(constantTimeTokenMatches("segredo", "segredo"), true);
assert.equal(constantTimeTokenMatches("segredo", "outro"), false);
assert.equal(constantTimeTokenMatches("", ""), false);
assert.equal(normalizeRemoteAppUrl("https://dama-remote.vercel.app/test?x=1#token"), "https://dama-remote.vercel.app/test");
assert.equal(originAllowed("https://dama-remote.vercel.app", "https://dama-remote.vercel.app"), true);
assert.equal(originAllowed("https://evil.example", "https://dama-remote.vercel.app"), false);
assert.equal(originAllowed("http://localhost:5173", "https://dama-remote.vercel.app"), true);

const manager = createRemoteManager({
  app: { getPath: () => os.tmpdir() },
  getSnapshot: async () => ({ protocol: 1, projects: [{ id: "project-1", name: "Dama" }] }),
  onChat: async (body) => ({ content: `Resposta: ${body.messages?.at(-1)?.content}` }),
  onResolveApproval: async (_id, decision) => decision === "once",
  onSelectProject: async (id) => ({ opened: id === "project-1" }),
  onSteer: async (_id, message) => ({ accepted: message === "continue" }),
});

const ready = await manager.start({ remoteAppUrl: "https://dama-remote.vercel.app", tunnel: false });
assert.equal(ready.status, "ready");
const pairing = new URL(ready.pairingUrl);
const token = new URLSearchParams(pairing.hash.slice(1)).get("token");
const headers = { authorization: `Bearer ${token}`, "content-type": "application/json", origin: "https://dama-remote.vercel.app" };
assert.equal((await fetch(`${ready.endpoint}/api/snapshot`)).status, 401);
const snapshotResponse = await fetch(`${ready.endpoint}/api/snapshot`, { headers });
assert.equal(snapshotResponse.status, 200);
assert.equal((await snapshotResponse.json()).projects[0].name, "Dama");
const chatResponse = await fetch(`${ready.endpoint}/api/chat`, { method: "POST", headers, body: JSON.stringify({ messages: [{ role: "user", content: "Oi" }] }) });
assert.equal((await chatResponse.json()).content, "Resposta: Oi");
const approvalResponse = await fetch(`${ready.endpoint}/api/approvals/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`, { method: "POST", headers, body: JSON.stringify({ decision: "once" }) });
assert.equal((await approvalResponse.json()).accepted, true);
await manager.stop();

console.log("Remote server: autenticação, CORS e rotas reais passaram.");
