import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import quotaModule from "../electron/dama-quota.cjs";

const { createDamaQuotaManager, estimateTokens, normalizeRecord, usageTokens } = quotaModule;
const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dama-quota-"));
const events = [];
const manager = createDamaQuotaManager({ getPath: () => directory }, (state) => events.push(state));

const initial = await manager.status();
assert.equal(initial.percentage, 100);
assert.equal(initial.used, 0);
assert.equal(usageTokens({ total_tokens: 120 }, [], ""), 120);
assert.ok(estimateTokens([{ content: "teste" }], "resposta") > 0);

const after = await manager.consume({ usage: { prompt_tokens: 80, completion_tokens: 40 } });
assert.equal(after.used, 120);
assert.equal(after.remaining, after.limit - 120);
assert.equal(events.length, 1);
await manager.assertAvailable();

const exhausted = await manager.consume({ usage: { total_tokens: after.remaining } });
assert.equal(exhausted.remaining, 0);
assert.equal(exhausted.exhausted, true);
await assert.rejects(() => manager.assertAvailable(), (error) => error?.code === "DAMA_QUOTA_EXHAUSTED");

const renewed = normalizeRecord({ limit: 100, used: 100, cycleStartedAt: "2020-01-01T00:00:00.000Z" }, new Date("2026-08-14T00:00:00.000Z"));
assert.equal(renewed.used, 0);
assert.equal(renewed.limit, 500000);

await fs.rm(directory, { recursive: true, force: true });
console.log("Dama AI: cota persistente, consumo e renovação validados.");
