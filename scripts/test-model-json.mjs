import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { parseModelJson, repairJson, parseModelJsonWithRepair } = require("../electron/model-json.cjs");

const missingComma = '{"mode":"plan","intro":"Certo" "plan":{"title":"Site","summary":"Criar","steps":[]}}';
assert.equal(parseModelJson(missingComma).plan.title, "Site");

const unescapedQuotes = '{"title":"Ajustar botão "Começar agora" no topo","summary":"Mudança pequena","steps":[]}';
assert.equal(parseModelJson(unescapedQuotes).title, 'Ajustar botão "Começar agora" no topo');

const mixedModelOutput = `Aqui está:\n\n\`\`\`json\n{
  mode: 'direct',
  intro: 'Vou corrigir',
  plan: {
    title: 'Correção',
    summary: 'Linha um\nlinha dois',
    steps: [{ title: 'Editar', detail: 'Aplicar', files: ['src/App.tsx'], }],
  },
}\n\`\`\``;
const mixed = parseModelJson(mixedModelOutput);
assert.equal(mixed.mode, "direct");
assert.equal(mixed.plan.steps[0].files[0], "src/App.tsx");
assert.match(mixed.plan.summary, /linha dois/);

assert.doesNotThrow(() => JSON.parse(repairJson('{"a":True,"b":None,}')));
assert.throws(() => parseModelJson("sem objeto"), /não devolveu um objeto/);
let retryCalls = 0;
const retried = await parseModelJsonWithRepair("resposta sem JSON", async (_content, attempt) => {
  retryCalls += 1;
  return attempt === 1 ? "ainda inválido" : '{"title":"Recuperado","steps":[]}';
}, 2);
assert.equal(retried.value.title, "Recuperado");
assert.equal(retried.attempts, 2);
assert.equal(retryCalls, 2);

console.log("JSON de modelos: reparo local e retry automático verificados.");
