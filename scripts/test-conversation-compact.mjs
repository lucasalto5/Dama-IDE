import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { compactConversationData, compactExecutionMessages, limits } = require("../electron/conversation-compact.cjs");

const events = Array.from({ length: 500 }, (_, index) => ({ id: `event-${index}`, runId: "run", at: new Date(index).toISOString(), detail: `Evento ${index}` }));
const compacted = compactConversationData({
  agentEvents: events,
  agentMessages: Array.from({ length: 200 }, (_, index) => ({ id: `message-${index}` })),
  agentPlans: Array.from({ length: 60 }, (_, index) => ({ id: `plan-${index}` })),
  toolApprovals: Array.from({ length: 80 }, (_, index) => ({ id: `approval-${index}` })),
  chatMessages: Array.from({ length: 180 }, (_, index) => ({ content: `chat-${index}` })),
});

assert.equal(compacted.agentEvents.length, limits.agentEvents);
assert.equal(compacted.agentEvents[0].id, "dama-history-compacted");
assert.match(compacted.agentEvents[0].detail, /181 eventos/);
assert.equal(compacted.agentMessages.length, limits.agentMessages);
assert.equal(compacted.agentMessages[0].id, "message-80");
assert.equal(compacted.agentPlans.length, limits.agentPlans);
assert.equal(compacted.toolApprovals.length, limits.toolApprovals);
assert.equal(compacted.chatMessages.length, limits.chatMessages);

const execution = [{ role: "system", content: "executor" }, { role: "user", content: "pedido original" }];
for (let index = 0; index < 14; index += 1) {
  execution.push({ role: "assistant", content: `etapa ${index}`, tool_calls: [{ id: `call-${index}`, function: { name: "read_file", arguments: JSON.stringify({ path: `src/${index}.ts` }) } }] });
  execution.push({ role: "tool", tool_call_id: `call-${index}`, content: `resultado ${index} ${"x".repeat(5000)}` });
}
const executionResult = compactExecutionMessages(execution, { keepCycles: 5, maxCharacters: 10000 });
assert.ok(executionResult);
assert.ok(executionResult.removedMessages > 0);
assert.ok(executionResult.currentCharacters < executionResult.previousCharacters);
assert.match(execution[2].content, /RESUMO COMPACTADO/);
assert.equal(execution.filter((item) => item.role === "assistant").length, 5);

console.log("Conversas: histórico salvo e contexto ativo compactados com limites previsíveis.");
