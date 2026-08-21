const limits = Object.freeze({ agentMessages: 120, agentEvents: 320, agentPlans: 24, toolApprovals: 48, chatMessages: 120 });

function compactEvents(input) {
  const events = Array.isArray(input) ? input : [];
  if (events.length <= limits.agentEvents) return events;
  const previousSummary = events.find((item) => item?.id === "dama-history-compacted");
  const previousCount = Number(String(previousSummary?.detail || "").match(/\d+/)?.[0] || 0);
  const source = events.filter((item) => item?.id !== "dama-history-compacted");
  const keep = source.slice(-(limits.agentEvents - 1));
  const compacted = previousCount + Math.max(0, source.length - keep.length);
  return [{
    id: "dama-history-compacted",
    runId: keep[0]?.runId || "history",
    at: keep[0]?.at || new Date().toISOString(),
    stage: "execution",
    type: "status",
    title: "Histórico anterior resumido",
    detail: `${compacted} eventos técnicos antigos foram compactados para manter esta conversa leve. Mensagens e alterações importantes continuam salvas.`,
    state: "done",
  }, ...keep];
}

function compactConversationData(input = {}) {
  return {
    ...input,
    agentMessages: (Array.isArray(input.agentMessages) ? input.agentMessages : []).slice(-limits.agentMessages),
    agentEvents: compactEvents(input.agentEvents),
    agentPlans: (Array.isArray(input.agentPlans) ? input.agentPlans : []).slice(-limits.agentPlans),
    toolApprovals: (Array.isArray(input.toolApprovals) ? input.toolApprovals : []).slice(-limits.toolApprovals),
    chatMessages: (Array.isArray(input.chatMessages) ? input.chatMessages : []).slice(-limits.chatMessages),
  };
}

function compactExecutionMessages(messages, options = {}) {
  const serializedSize = messages.reduce((sum, message) => sum + String(message?.content || "").length + JSON.stringify(message?.tool_calls || []).length, 0);
  const assistantIndexes = messages.map((message, index) => message?.role === "assistant" ? index : -1).filter((index) => index >= 2);
  const keepCycles = Math.min(10, Math.max(4, Number(options.keepCycles || 7)));
  if (serializedSize < Number(options.maxCharacters || 520000) && assistantIndexes.length <= keepCycles + 3) return null;
  const keepFrom = assistantIndexes[Math.max(0, assistantIndexes.length - keepCycles)];
  if (!keepFrom || keepFrom <= 2) return null;
  const removed = messages.slice(2, keepFrom);
  const notes = [];
  for (const message of removed) {
    if (message.role === "assistant") {
      const content = String(message.content || "").trim();
      if (content) notes.push(`Dama: ${content.slice(0, 900)}`);
      const calls = (message.tool_calls || []).map((call) => {
        let args = {};
        try { args = JSON.parse(call.function?.arguments || "{}"); } catch {}
        const subject = args.path || args.to || args.query || args.url || args.action || args.command || "";
        return `${call.function?.name || "ferramenta"}${subject ? ` (${String(subject).slice(0, 240)})` : ""}`;
      });
      if (calls.length) notes.push(`Ferramentas: ${calls.join(", ")}`);
    } else if (message.role === "tool") {
      const content = String(message.content || "").trim();
      if (content) notes.push(`Retorno técnico: ${content.slice(0, 1200)}`);
    } else if (message.role === "user") notes.push(`Orientação recebida: ${String(message.content || "").slice(0, 1200)}`);
    if (notes.length >= 36) break;
  }
  const compacted = [messages[0], messages[1], {
    role: "user",
    content: `RESUMO COMPACTADO DE CICLOS TÉCNICOS ANTERIORES\nEste resumo substitui logs e chamadas antigas para manter a execução responsiva. Preserve as decisões e os resultados abaixo; releia arquivos quando precisar do conteúdo exato.\n\n${notes.join("\n") || "As etapas anteriores não produziram informação durável."}`.slice(0, 48000),
  }, ...messages.slice(keepFrom)];
  messages.splice(0, messages.length, ...compacted);
  return { removedMessages: removed.length, previousCharacters: serializedSize, currentCharacters: compacted.reduce((sum, message) => sum + String(message?.content || "").length + JSON.stringify(message?.tool_calls || []).length, 0) };
}

module.exports = { limits, compactEvents, compactConversationData, compactExecutionMessages };
