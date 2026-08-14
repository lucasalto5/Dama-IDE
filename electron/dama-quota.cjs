const path = require("node:path");
const fs = require("node:fs/promises");

const DEFAULT_LIMIT = 500000;
const CYCLE_DAYS = 30;

class DamaQuotaError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "DamaQuotaError";
    this.code = "DAMA_QUOTA_EXHAUSTED";
    this.status = status;
  }
}

function nextCycleDate(startedAt) {
  return new Date(new Date(startedAt).getTime() + CYCLE_DAYS * 24 * 60 * 60 * 1000);
}

function normalizeRecord(value, now = new Date()) {
  const current = value && typeof value === "object" ? value : {};
  const cycleStartedAt = current.cycleStartedAt && Number.isFinite(Date.parse(current.cycleStartedAt))
    ? current.cycleStartedAt
    : now.toISOString();
  if (nextCycleDate(cycleStartedAt).getTime() <= now.getTime()) {
    return { version: 1, limit: DEFAULT_LIMIT, used: 0, cycleStartedAt: now.toISOString(), updatedAt: now.toISOString() };
  }
  return {
    version: 1,
    limit: Math.max(1, Number(current.limit || DEFAULT_LIMIT)),
    used: Math.max(0, Math.floor(Number(current.used || 0))),
    cycleStartedAt,
    updatedAt: current.updatedAt || now.toISOString(),
  };
}

function publicQuota(record) {
  const limit = Math.max(1, Number(record.limit || DEFAULT_LIMIT));
  const used = Math.min(limit, Math.max(0, Number(record.used || 0)));
  const remaining = Math.max(0, limit - used);
  return {
    limit,
    used,
    remaining,
    percentage: Math.max(0, Math.min(100, Math.round((remaining / limit) * 100))),
    exhausted: remaining <= 0,
    cycleStartedAt: record.cycleStartedAt,
    renewsAt: nextCycleDate(record.cycleStartedAt).toISOString(),
    updatedAt: record.updatedAt,
    unit: "tokens",
    enforcement: "local",
  };
}

function estimateTokens(messages, responseText) {
  const input = (Array.isArray(messages) ? messages : []).reduce((total, message) => total + String(message?.content || "").length, 0);
  return Math.max(1, Math.ceil((input + String(responseText || "").length) / 4));
}

function usageTokens(usage, messages, responseText) {
  const reported = Number(usage?.total_tokens ?? usage?.totalTokens);
  if (Number.isFinite(reported) && reported > 0) return Math.ceil(reported);
  const prompt = Number(usage?.prompt_tokens ?? usage?.input_tokens ?? usage?.promptTokens ?? usage?.inputTokens);
  const completion = Number(usage?.completion_tokens ?? usage?.output_tokens ?? usage?.completionTokens ?? usage?.outputTokens);
  if (Number.isFinite(prompt) || Number.isFinite(completion)) return Math.max(1, Math.ceil((prompt || 0) + (completion || 0)));
  return estimateTokens(messages, responseText);
}

function createDamaQuotaManager(app, onChange = () => {}) {
  const filePath = () => path.join(app.getPath("userData"), "dama-ai-quota.json");
  let queue = Promise.resolve();

  async function read() {
    let raw = null;
    try { raw = JSON.parse(await fs.readFile(filePath(), "utf8")); } catch {}
    const normalized = normalizeRecord(raw);
    if (!raw || JSON.stringify(raw) !== JSON.stringify(normalized)) await write(normalized, false);
    return normalized;
  }

  async function write(record, notify = true) {
    await fs.mkdir(path.dirname(filePath()), { recursive: true });
    const temporary = `${filePath()}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    await fs.rm(filePath(), { force: true });
    await fs.rename(temporary, filePath());
    const state = publicQuota(record);
    if (notify) onChange(state);
    return state;
  }

  async function status() {
    const record = await read();
    return publicQuota(record);
  }

  async function assertAvailable() {
    const current = await status();
    if (current.exhausted) {
      throw new DamaQuotaError(`O limite da Dama AI acabou. A cota será renovada em ${new Date(current.renewsAt).toLocaleDateString("pt-BR")}. Escolha outro modelo para continuar.`, current);
    }
    return current;
  }

  async function consume({ usage, messages, responseText } = {}) {
    const amount = usageTokens(usage, messages, responseText);
    queue = queue.then(async () => {
      const record = await read();
      record.used = Math.min(record.limit, record.used + amount);
      record.updatedAt = new Date().toISOString();
      return write(record);
    });
    return queue;
  }

  return { status, assertAvailable, consume };
}

module.exports = { DEFAULT_LIMIT, DamaQuotaError, createDamaQuotaManager, estimateTokens, normalizeRecord, publicQuota, usageTokens };
