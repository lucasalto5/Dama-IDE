import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { DAMA_AI_MODEL_ID, buildPublicModelsState, resolveDamaBaseProfile } = require("../electron/model-catalog.cjs");

const profiles = [
  { id: "fast", name: "Rápido", model: "fast/model", url: "https://example.com/v1", tokenCipher: "protected", testedAt: "now" },
  { id: "smart", name: "Preciso", model: "smart/model", url: "https://example.com/v1", tokenCipher: null, testedAt: "now" },
];
const settings = {
  agent: { temperature: 0.2 },
  modelProfiles: profiles,
  activeModelId: "fast",
  modelRouting: { mode: "single", primary: "fast", fallbackOrder: [] },
  damaEngine: { baseModelId: "smart" },
};

const installed = buildPublicModelsState(settings, { installed: true });
assert.equal(installed.models[0].id, DAMA_AI_MODEL_ID);
assert.equal(installed.models[0].available, true);
assert.equal(installed.models[0].baseModelId, "smart");
assert.equal(installed.models[0].endpoint, "Motor local · Base: Preciso");
assert.equal(installed.models[1].tokenCipher, undefined);
assert.equal(installed.models[1].hasStoredToken, true);
assert.equal(resolveDamaBaseProfile(settings).id, "smart");

const absent = buildPublicModelsState(settings, { installed: false });
assert.equal(absent.models.some((model) => model.id === DAMA_AI_MODEL_ID), false);

const noBase = buildPublicModelsState({ ...settings, modelProfiles: [], damaEngine: { baseModelId: null } }, { installed: true });
assert.equal(noBase.models[0].id, DAMA_AI_MODEL_ID);
assert.equal(noBase.models[0].available, false);
assert.equal(resolveDamaBaseProfile({ modelProfiles: [], damaEngine: {} }), null);

console.log("Modelos: Dama AI integrada, base e indisponibilidade validadas.");
