const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("dama", {
  apiVersion: 10,
  openProject: () => ipcRenderer.invoke("project:open"),
  selectProject: (projectPath) => ipcRenderer.invoke("workspace:selectProject", projectPath),
  createProjectFromPrompt: (prompt) => ipcRenderer.invoke("project:createFromPrompt", prompt),
  listWorkspace: () => ipcRenderer.invoke("workspace:list"),
  saveConversation: (payload) => ipcRenderer.invoke("workspace:saveConversation", payload),
  loadConversation: (id) => ipcRenderer.invoke("workspace:loadConversation", id),
  deleteConversation: (id) => ipcRenderer.invoke("workspace:deleteConversation", id),
  refreshProject: () => ipcRenderer.invoke("project:refresh"),
  readFile: (relativePath) => ipcRenderer.invoke("project:read", relativePath),
  writeFile: (relativePath, content) => ipcRenderer.invoke("project:write", relativePath, content),
  createFile: (relativePath) => ipcRenderer.invoke("project:createFile", relativePath),
  createNote: (title) => ipcRenderer.invoke("notes:create", title),
  importNoteAsset: (payload) => ipcRenderer.invoke("notes:importAsset", payload),
  readNoteAsset: (relativePath) => ipcRenderer.invoke("notes:readAsset", relativePath),
  runSystemBenchmark: () => ipcRenderer.invoke("system:benchmark"),
  searchProject: (query) => ipcRenderer.invoke("project:search", query),
  gitSummary: () => ipcRenderer.invoke("git:summary"),
  gitDiff: (relativePath) => ipcRenderer.invoke("git:diff", relativePath),
  gitInit: () => ipcRenderer.invoke("git:init"),
  gitOperation: (input) => ipcRenderer.invoke("git:operation", input),
  runCommand: (command) => ipcRenderer.invoke("terminal:run", command),
  startCommand: (command, id) => ipcRenderer.invoke("terminal:start", command, id),
  stopCommand: (id) => ipcRenderer.invoke("terminal:stop", id),
  onTerminalEvent: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("terminal:event", listener);
    return () => ipcRenderer.removeListener("terminal:event", listener);
  },
  startPreview: () => ipcRenderer.invoke("preview:start"),
  stopPreview: () => ipcRenderer.invoke("preview:stop"),
  previewStatus: () => ipcRenderer.invoke("preview:status"),
  enablePreviewInspector: (url) => ipcRenderer.invoke("preview:inspector:enable", url),
  previewInspectorState: (url) => ipcRenderer.invoke("preview:inspector:state", url),
  getPreviewSelection: (url) => ipcRenderer.invoke("preview:inspector:selection", url),
  clearPreviewInspector: (url) => ipcRenderer.invoke("preview:inspector:clear", url),
  disablePreviewInspector: (url) => ipcRenderer.invoke("preview:inspector:disable", url),
  onPreviewUpdate: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("preview:update", listener);
    return () => ipcRenderer.removeListener("preview:update", listener);
  },
  setConnector: (config) => ipcRenderer.invoke("connector:set", config),
  clearConnector: () => ipcRenderer.invoke("connector:clear"),
  testConnector: () => ipcRenderer.invoke("connector:test"),
  listModels: () => ipcRenderer.invoke("models:list"),
  testAndSaveModel: (config) => ipcRenderer.invoke("models:testAndSave", config),
  testModel: (id) => ipcRenderer.invoke("models:test", id),
  setActiveModel: (id) => ipcRenderer.invoke("models:setActive", id),
  updateModelRouting: (routing) => ipcRenderer.invoke("models:updateRouting", routing),
  removeModel: (id) => ipcRenderer.invoke("models:remove", id),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  updateSettings: (patch) => ipcRenderer.invoke("settings:update", patch),
  resetOnboarding: () => ipcRenderer.invoke("settings:resetOnboarding"),
  getUpdateState: () => ipcRenderer.invoke("updates:state"),
  checkForUpdates: () => ipcRenderer.invoke("updates:check"),
  downloadUpdate: () => ipcRenderer.invoke("updates:download"),
  installUpdate: () => ipcRenderer.invoke("updates:install"),
  onUpdateState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("updates:state", listener);
    return () => ipcRenderer.removeListener("updates:state", listener);
  },
  onNotificationOpen: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("notification:open", listener);
    return () => ipcRenderer.removeListener("notification:open", listener);
  },
  getRemoteState: () => ipcRenderer.invoke("remote:state"),
  startRemote: () => ipcRenderer.invoke("remote:start"),
  stopRemote: () => ipcRenderer.invoke("remote:stop"),
  onRemoteState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("remote:state", listener);
    return () => ipcRenderer.removeListener("remote:state", listener);
  },
  onConversationChanged: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("workspace:conversationChanged", listener);
    return () => ipcRenderer.removeListener("workspace:conversationChanged", listener);
  },
  onRemoteAgentMessage: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("remote:agentMessage", listener);
    return () => ipcRenderer.removeListener("remote:agentMessage", listener);
  },
  damaEngineStatus: (verify = false) => ipcRenderer.invoke("damaEngine:status", verify),
  installDamaEngine: () => ipcRenderer.invoke("damaEngine:install"),
  removeDamaEngine: () => ipcRenderer.invoke("damaEngine:remove"),
  setDamaEngineBaseModel: (id) => ipcRenderer.invoke("damaEngine:setBaseModel", id),
  clearToolApprovals: () => ipcRenderer.invoke("toolApprovals:clear"),
  listPendingToolApprovals: () => ipcRenderer.invoke("agent:approval:pending"),
  chooseLocalPlugin: () => ipcRenderer.invoke("plugin:chooseLocal"),
  createPlan: (prompt, modelId, reasoning, runId, history, forcePlan) => ipcRenderer.invoke("agent:plan", { prompt, modelId, reasoning, runId, history, forcePlan }),
  revisePlan: (payload) => ipcRenderer.invoke("agent:revisePlan", payload),
  executePlan: (payload) => ipcRenderer.invoke("agent:execute", payload),
  getChangeSet: (id) => ipcRenderer.invoke("changes:get", id),
  getChangeDiff: (id, relativePath) => ipcRenderer.invoke("changes:diff", id, relativePath),
  acceptChangeSet: (id) => ipcRenderer.invoke("changes:accept", id),
  rejectChangeSet: (id) => ipcRenderer.invoke("changes:reject", id),
  steerAgent: (runId, message) => ipcRenderer.invoke("agent:steer", runId, message),
  onAgentEvent: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("agent:event", listener);
    return () => ipcRenderer.removeListener("agent:event", listener);
  },
  resolveToolApproval: (id, decision) => ipcRenderer.invoke("agent:approval:resolve", id, decision),
  onToolApproval: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("agent:approval", listener);
    return () => ipcRenderer.removeListener("agent:approval", listener);
  },
  chat: (payload) => ipcRenderer.invoke("agent:chat", payload),
  openExternal: (url) => ipcRenderer.invoke("system:openExternal", url),
  copyText: (value) => ipcRenderer.invoke("system:copyText", value),
  platform: process.platform,
});
