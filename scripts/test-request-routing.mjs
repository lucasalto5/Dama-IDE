import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { isStandaloneResearchRequest, isDirectConversationRequest } = require("../electron/request-routing.cjs");

assert.equal(isStandaloneResearchRequest("Pesquisa se existe algum clone do Discord?"), true);
assert.equal(isStandaloneResearchRequest("Quais IDEs de IA existem hoje?"), true);
assert.equal(isStandaloneResearchRequest("Pesquise a documentação e implemente no projeto"), false);
assert.equal(isStandaloneResearchRequest("Crie um clone do Discord"), false);
assert.equal(isStandaloneResearchRequest("Coloque o site no localhost para eu ver no Preview"), false);
assert.equal(isDirectConversationRequest("Oi, tudo bem?"), true);
assert.equal(isDirectConversationRequest("Você acha que essa ideia faz sentido?"), true);
assert.equal(isDirectConversationRequest("A Dama atualiza as notas sozinha?"), true);
assert.equal(isDirectConversationRequest("Uma duvida a IA atualiza sozinha as notas"), true);
assert.equal(isDirectConversationRequest("Por que meu botão não funciona?"), false);
assert.equal(isDirectConversationRequest("Analise meu projeto"), false);

console.log("Roteamento: dúvidas gerais e pesquisas seguem sem leitura de workspace ou plano.");
