import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { normalizeCatalog, rankAutomaticProfiles } = require("../electron/nvidia-catalog.cjs");

const catalog = normalizeCatalog({ data: [
  { id: "qwen/qwen3-coder-480b-a35b-instruct", max_model_len: 262144 },
  { id: "nvidia/nemotron-3-super-120b-a12b", max_model_len: 1048576 },
  { id: "nvidia/llama-nemotron-embed-1b-v2" },
] }, [{ model: "qwen/qwen3-coder-480b-a35b-instruct" }]);

assert.equal(catalog.length, 2);
assert.equal(catalog[0].id, "nvidia/nemotron-3-super-120b-a12b");
assert.equal(catalog.find((item) => item.id.startsWith("qwen/"))?.added, true);
assert.ok(catalog.every((item) => item.tags.length));

const ranked = rankAutomaticProfiles([
  { id: "slow", damaScore: 98, tags: ["Programação"], health: { samples: 5, successes: 3, averageLatencyMs: 42000, lastFailureAt: new Date().toISOString() } },
  { id: "healthy", damaScore: 90, tags: ["Programação", "Agente"], health: { samples: 5, successes: 5, averageLatencyMs: 1800 } },
], "build");
assert.equal(ranked[0].id, "healthy");

console.log("NVIDIA: catálogo, filtros, notas e roteamento automático validados.");
