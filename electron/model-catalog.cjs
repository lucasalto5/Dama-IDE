const DAMA_AI_MODEL_ID = "builtin:dama-ai";

function publicRegularModels(settings) {
  return (settings.modelProfiles || []).map(({ tokenCipher, ...profile }) => ({
    ...profile,
    hasStoredToken: Boolean(tokenCipher),
  }));
}

function resolveDamaBaseProfile(settings) {
  const profiles = settings.modelProfiles || [];
  return profiles.find((profile) => profile.id === settings.damaEngine?.baseModelId) || profiles[0] || null;
}

function buildPublicModelsState(settings, engineStatus) {
  const regularModels = publicRegularModels(settings);
  const baseModel = regularModels.find((profile) => profile.id === settings.damaEngine?.baseModelId) || regularModels[0] || null;
  const damaModel = engineStatus?.installed ? {
    id: DAMA_AI_MODEL_ID,
    name: "Dama AI",
    provider: "dama",
    kind: "engine",
    url: "local://dama-ai",
    endpoint: baseModel ? `Motor local · Base: ${baseModel.name}` : "Motor local · modelo base necessário",
    model: "Dama AI",
    temperature: Number(settings.agent?.temperature ?? 0.2),
    maxTokens: null,
    testedAt: "",
    hasStoredToken: false,
    builtIn: true,
    available: Boolean(baseModel),
    baseModelId: baseModel?.id || null,
    baseModelName: baseModel?.name || null,
  } : null;
  return {
    models: damaModel ? [damaModel, ...regularModels] : regularModels,
    activeModelId: settings.activeModelId,
    routing: settings.modelRouting,
  };
}

module.exports = { DAMA_AI_MODEL_ID, buildPublicModelsState, resolveDamaBaseProfile };
