const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

const curated = [
  { match: /nemotron-3-ultra/i, score: 98, tags: ["Agente", "Programação", "Raciocínio", "Ferramentas"], summary: "Maior capacidade para planejamento, código e tarefas agênticas longas." },
  { match: /glm[-_.]?5(?:\.2)?/i, score: 97, tags: ["Agente", "Programação", "Raciocínio"], summary: "Modelo de alta capacidade para código e trabalho agêntico de longo prazo." },
  { match: /nemotron-3-super/i, score: 96, tags: ["Agente", "Programação", "Raciocínio", "Ferramentas"], summary: "Equilíbrio forte entre planejamento, código, ferramentas e eficiência." },
  { match: /qwen3[-_.]?coder/i, score: 95, tags: ["Programação", "Agente", "Ferramentas"], summary: "Especialista em programação, edição de projetos e uso de ferramentas." },
  { match: /mistral-medium-3\.5/i, score: 93, tags: ["Programação", "Agente", "Raciocínio", "Chat"], summary: "Modelo geral forte para código, raciocínio e tarefas agênticas." },
  { match: /gpt[-_.]?oss[-_.]?120b/i, score: 92, tags: ["Raciocínio", "Programação", "Agente"], summary: "Raciocínio amplo e boa capacidade para problemas técnicos complexos." },
  { match: /llama-3\.3-nemotron-super/i, score: 91, tags: ["Raciocínio", "Agente", "Chat", "Ferramentas"], summary: "Bom equilíbrio entre raciocínio, chat, instruções e chamadas de ferramenta." },
  { match: /nemotron-3-nano(?!-omni)/i, score: 90, tags: ["Agente", "Programação", "Raciocínio", "Rápido"], summary: "Modelo eficiente para código, ferramentas e tarefas frequentes da IDE." },
  { match: /mistral-nemotron/i, score: 89, tags: ["Agente", "Programação", "Ferramentas"], summary: "Preparado para fluxos agênticos, código e chamadas de função." },
  { match: /deepseek.*(?:v3|r1)/i, score: 88, tags: ["Programação", "Raciocínio", "Agente"], summary: "Boa capacidade técnica para programação e raciocínio." },
  { match: /nvidia-nemotron-nano-9b/i, score: 86, tags: ["Raciocínio", "Agente", "Rápido"], summary: "Modelo eficiente para raciocínio e tarefas agênticas menores." },
  { match: /qwen2\.5[-_.]?coder/i, score: 86, tags: ["Programação", "Rápido"], summary: "Especialista compacto para geração e manutenção de código." },
  { match: /gpt[-_.]?oss[-_.]?20b/i, score: 84, tags: ["Raciocínio", "Programação", "Rápido"], summary: "Alternativa eficiente para raciocínio e tarefas técnicas." },
  { match: /llama-3\.3-70b-instruct/i, score: 83, tags: ["Chat", "Raciocínio", "Programação", "Ferramentas"], summary: "Modelo geral confiável para chat, instruções, código e funções." },
];

function cleanModelName(id) {
  const short = String(id || "").split("/").at(-1) || String(id || "Modelo");
  return short.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isConversationalModel(id) {
  const value = String(id || "").toLowerCase();
  if (!value || !value.includes("/")) return false;
  return !/(?:embed|embedding|rerank|guard|safety|moderation|ocr|parse|retriev|vision|vlm|image|audio|speech|tts|asr|video|diffusion)/i.test(value);
}

function inferMetadata(id) {
  const value = String(id || "");
  const known = curated.find((item) => item.match.test(value));
  if (known) return { name: cleanModelName(value), score: known.score, tags: known.tags, summary: known.summary, curated: true };
  const tags = [];
  if (/coder|code|devstral|codestral/i.test(value)) tags.push("Programação");
  if (/reason|thinking|r1|nemotron|agent/i.test(value)) tags.push("Raciocínio");
  if (/tool|function|nemotron|agent/i.test(value)) tags.push("Agente", "Ferramentas");
  if (/instruct|chat|llama|mistral|qwen/i.test(value)) tags.push("Chat");
  if (/mini|nano|small|flash|20b|8b|7b/i.test(value)) tags.push("Rápido");
  const uniqueTags = [...new Set(tags.length ? tags : ["Chat"])].slice(0, 4);
  let score = 72;
  if (uniqueTags.includes("Programação")) score += 8;
  if (uniqueTags.includes("Agente")) score += 6;
  if (uniqueTags.includes("Raciocínio")) score += 5;
  if (uniqueTags.includes("Ferramentas")) score += 3;
  return { name: cleanModelName(value), score: Math.min(91, score), tags: uniqueTags, summary: "Modelo disponível no catálogo NVIDIA; a nota usa as capacidades detectadas no identificador.", curated: false };
}

function normalizeCatalog(payload, existingProfiles = []) {
  const existing = new Set(existingProfiles.map((profile) => profile.model));
  return (Array.isArray(payload?.data) ? payload.data : [])
    .map((item) => ({ id: String(item?.id || ""), contextLength: Number(item?.max_model_len || 0) || null }))
    .filter((item) => isConversationalModel(item.id))
    .map((item) => ({ ...item, ...inferMetadata(item.id), added: existing.has(item.id) }))
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
}

function healthScore(profile, now = Date.now()) {
  const health = profile.health || {};
  const samples = Math.max(0, Number(health.samples) || 0);
  const successes = Math.max(0, Number(health.successes) || 0);
  const successRate = samples ? successes / samples : 0.8;
  const latency = Math.max(0, Number(health.averageLatencyMs) || 0);
  const recentFailure = health.lastFailureAt && now - new Date(health.lastFailureAt).getTime() < 5 * 60 * 1000;
  const latencyPoints = !latency ? 0 : latency <= 2500 ? 10 : latency <= 6000 ? 6 : latency <= 12000 ? 1 : latency <= 30000 ? -7 : -18;
  return Math.round(successRate * 20 + latencyPoints - (recentFailure ? 22 : 0));
}

function roleScore(profile, role) {
  const tags = new Set(profile.tags || []);
  const wanted = role === "build" ? ["Programação", "Agente", "Ferramentas"]
    : role === "review" ? ["Raciocínio", "Programação"]
      : role === "orchestrate" ? ["Agente", "Raciocínio", "Ferramentas"]
        : ["Chat", "Raciocínio", "Agente"];
  return wanted.reduce((score, tag) => score + (tags.has(tag) ? 5 : 0), 0);
}

function rankAutomaticProfiles(profiles, role = "primary", now = Date.now()) {
  return [...profiles].sort((left, right) => {
    const leftScore = Number(left.damaScore || 70) + roleScore(left, role) + healthScore(left, now);
    const rightScore = Number(right.damaScore || 70) + roleScore(right, role) + healthScore(right, now);
    return rightScore - leftScore;
  });
}

module.exports = { NVIDIA_BASE_URL, inferMetadata, isConversationalModel, normalizeCatalog, rankAutomaticProfiles, healthScore };
