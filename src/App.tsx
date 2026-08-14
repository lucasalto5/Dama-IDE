import { ClipboardEvent as ReactClipboardEvent, Component, createElement, DragEvent as ReactDragEvent, ErrorInfo, FormEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import MonacoEditor, { type OnMount } from "@monaco-editor/react";
import { marked, type Token, type Tokens } from "marked";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  ArrowDownToLine,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Bell,
  Bot,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Code2,
  Command,
  Copy,
  Cpu,
  ExternalLink,
  Eye,
  File,
  FileCode2,
  Folder,
  FolderOpen,
  GitBranch,
  Globe2,
  GraduationCap,
  Gauge,
  LoaderCircle,
  Languages,
  MessageSquareText,
  ImagePlus,
  Link2,
  PanelLeft,
  PanelRightClose,
  PanelRightOpen,
  Palette,
  Play,
  Plug,
  Plus,
  Puzzle,
  QrCode,
  RefreshCw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Smartphone,
  Square,
  TerminalSquare,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { DinoLogo } from "./DinoLogo";
import { useInterfaceLanguage } from "./i18n";

const onboardingVideoUrl = new URL("./assets/dama-onboarding.webm", import.meta.url).href;

type View = "chat" | "agent" | "editor" | "notes" | "changes" | "search" | "git" | "terminal" | "preview";
type TaskPhase = "idle" | "planning" | "review" | "executing" | "done" | "error";
type ActivityEvent = { id: number; label: string; detail: string; status: "running" | "done" | "error" };
type TerminalEntry = { id: string; command: string; output: string; errorOutput: string; code?: number; running: boolean };
type ChatMessage = { role: "user" | "assistant"; content: string; model?: string | null };
type AgentThreadMessage = { id: string; runId: string; role: "user" | "assistant"; content: string; at: string };
type AgentPlanStatus = TaskPhase | "editing" | "rejected" | "superseded";
type AgentPlanRecord = { id: string; runId: string; prompt: string; plan: Plan; status: AgentPlanStatus; result: AgentResult | null; baseChangeSetId?: string | null; at: string };
type ConversationKind = "agent" | "chat";
type AgentFeedEntry =
  | { kind: "message"; id: string; at: string; item: AgentThreadMessage }
  | { kind: "plan"; id: string; at: string; item: AgentPlanRecord }
  | { kind: "event"; id: string; at: string; item: AgentProgressEvent }
  | { kind: "approval"; id: string; at: string; item: ToolApprovalRequest }
  | { kind: "activity"; id: string; at: string; items: AgentProgressEvent[] };

const browserSettings: DamaSettings = {
  onboardingCompleted: false,
  profile: { name: "", useCase: "personal", experience: "intermediate" },
  agent: { defaultMode: "plan", approvalPolicy: "balanced", limitTurns: false, maxTurns: 12, sendOnEnter: true, language: "pt-BR", temperature: 0.2, contextWindow: 64000, connectionRetries: 2, formatRetries: 2, customInstructions: "" },
  privacy: { telemetry: false, diagnostics: false, localHistory: true },
  notifications: { enabled: true, approvals: true, completion: true, onlyWhenUnfocused: true, longRunSeconds: 20 },
  updates: { automatic: true, checkOnStartup: true, channel: "stable" },
  appearance: { density: "comfortable", motion: true, contextPanel: true, accent: "amber", surface: "warm", scale: 1.12 },
  remote: { appUrl: "https://dama-remote.vercel.app" },
  damaEngine: { baseModelId: null },
  computerUse: { enabled: false },
  projectMemory: { enabled: false },
  mcpServers: [],
  plugins: [],
};

const viewItems: Array<{ id: View; label: string; icon: typeof Sparkles }> = [
  { id: "chat", label: "Chat", icon: MessageSquareText },
  { id: "agent", label: "Agente", icon: Sparkles },
  { id: "editor", label: "Código", icon: Code2 },
  { id: "notes", label: "Notas", icon: BookOpen },
  { id: "search", label: "Buscar", icon: Search },
  { id: "git", label: "Git", icon: GitBranch },
  { id: "terminal", label: "Terminal", icon: TerminalSquare },
  { id: "preview", label: "Preview", icon: Globe2 },
];

function hasWorkspaceApi() {
  return Boolean(window.dama
    && typeof window.dama.listWorkspace === "function"
    && typeof window.dama.selectProject === "function"
    && typeof window.dama.saveConversation === "function"
    && typeof window.dama.loadConversation === "function"
    && typeof window.dama.deleteConversation === "function");
}

function isStandaloneResearchRequest(value: string) {
  const request = value.trim();
  if (!request || request.length > 1800) return false;
  const asksForInformation = /^(?:pesquis[ae]|procure|busque|descubra|encontre|compare|explique|me\s+diga|quais?|qual|o\s+que|como|onde|existe|existem|tem\s+algum|h[aá]\s+algum)|\b(?:pesquis[ae]|procure|busque|existe(?:m)?|alternativas?|compara[çc][aã]o|not[ií]cias?|fontes?|documenta[çc][aã]o)\b/i.test(request);
  const asksToChangeProject = /\b(?:crie|criar|fa[çc]a|construa|implemente|edite|mude|ajuste|corrija|adicione|remova|instale|execute|rode|arquivo|c[oó]digo|componente|fun[çc][aã]o|localhost|preview|deploy|commit|branch)\b/i.test(request);
  return asksForInformation && !asksToChangeProject;
}

function isDirectConversationRequest(value: string) {
  const request = value.trim();
  if (!request || request.length > 1800 || isStandaloneResearchRequest(request)) return false;
  const social = /^(?:oi|ol[aá]|opa|e\s+a[ií]|bom\s+dia|boa\s+tarde|boa\s+noite|obrigad[oa]|valeu|beleza|entendi|show|legal|perfeito)\b/i.test(request);
  const question = /\?$/.test(request) || /^(?:por\s+qu[eê]|porque|ser[aá]\s+que|posso|devo|voc[eê]|o\s+dama|a\s+dama|qual\s+sua|o\s+que\s+voc[eê]\s+acha|(?:tenho\s+)?uma\s+d[uú]vida|queria\s+saber)\b/i.test(request);
  const projectContext = /\b(?:neste|nesse|nesta|nessa|meu|minha)\s+(?:projeto|site|app|aplicativo|c[oó]digo|arquivo|componente|bot[aã]o|fun[çc][aã]o)|\b(?:arquivo|c[oó]digo|linha|stack\s*trace|erro|bug|workspace|reposit[oó]rio|componente|bot[aã]o|localhost|preview|build|teste\s+falhando)\b/i.test(request);
  const asksForAction = /\b(?:crie|criar|fa[çc]a|construa|implemente|edite|mude|ajuste|corrija|adicione|remova|instale|execute|rode|abra|analise|revise|teste)\b/i.test(request);
  return (social || question) && !projectContext && !asksForAction;
}

function DamaSplash({ ready, onExited }: { ready: boolean; onExited: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const [videoUnavailable, setVideoUnavailable] = useState(false);

  useEffect(() => {
    if (!ready || !videoUnavailable) return;
    const timer = window.setTimeout(() => setLeaving(true), 900);
    return () => window.clearTimeout(timer);
  }, [ready, videoUnavailable]);

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(onExited, 720);
    return () => window.clearTimeout(timer);
  }, [leaving, onExited]);

  return (
    <div className={`dama-splash ${leaving ? "leaving" : ""}`} aria-label={ready ? "Abrindo a Dama" : "Carregando a Dama"}>
      {videoUnavailable ? (
        <DinoLogo animated title="Dama" />
      ) : (
        <video
          src={onboardingVideoUrl}
          autoPlay
          loop={!ready}
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
          onEnded={() => { if (ready) setLeaving(true); }}
          onError={() => setVideoUnavailable(true)}
        />
      )}
    </div>
  );
}

function FileTree({ nodes, selected, onOpen, level = 0 }: {
  nodes: ProjectNode[];
  selected?: string;
  onOpen: (path: string) => void;
  level?: number;
}) {
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set(level === 0 ? nodes.filter((n) => n.kind === "folder").slice(0, 1).map((n) => n.path) : []));
  return (
    <div className="file-tree">
      {nodes.map((node) => {
        const open = openFolders.has(node.path);
        return (
          <div key={node.path}>
            <button
              className={`tree-row ${selected === node.path ? "selected" : ""}`}
              style={{ paddingLeft: 10 + level * 13 }}
              onClick={() => {
                if (node.kind === "folder") {
                  setOpenFolders((current) => {
                    const next = new Set(current);
                    next.has(node.path) ? next.delete(node.path) : next.add(node.path);
                    return next;
                  });
                } else onOpen(node.path);
              }}
            >
              {node.kind === "folder" ? (
                <>{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}<Folder size={13} /></>
              ) : (
                <><span className="tree-indent" /><File size={13} /></>
              )}
              <span>{node.name}</span>
            </button>
            {node.kind === "folder" && open && node.children?.length ? (
              <FileTree nodes={node.children} selected={selected} onOpen={onOpen} level={level + 1} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function ConnectorDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (state: ModelsState) => void }) {
  const [provider, setProvider] = useState("nvidia");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const presets: Record<string, { name: string; url: string; kind: "api" | "local" }> = {
    nvidia: { name: "NVIDIA NIM", url: "https://integrate.api.nvidia.com", kind: "api" },
    openai: { name: "OpenAI-compatible", url: "https://api.openai.com/v1", kind: "api" },
    ollama: { name: "Ollama local", url: "http://127.0.0.1:11434/v1", kind: "local" },
    custom: { name: "API personalizada", url: "", kind: "api" },
  };
  const preset = presets[provider];

  async function testAndSave() {
    try {
      setTesting(true);
      setTestResult(null);
      if (!window.dama || !formRef.current) throw new Error("O teste de modelos exige o aplicativo desktop.");
      const data = new FormData(formRef.current);
      const model = String(data.get("model") || "").trim();
      const url = String(data.get("url") || "").trim();
      if (!model || !url) throw new Error("Informe a URL e o identificador do modelo.");
      const result = await window.dama.testAndSaveModel({
        name: String(data.get("name") || model), provider, kind: preset.kind,
        url, model, token: String(data.get("token") || ""), temperature: 0.2,
      });
      const state = await window.dama.listModels();
      onSaved(state);
      setTestResult(`Testado e salvo em ${result.latencyMs} ms`);
      window.setTimeout(onClose, 650);
    } catch (error) {
      setTestResult(error instanceof Error ? error.message : String(error));
    } finally { setTesting(false); }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <section className="dialog connector-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><span className="eyebrow">Novo modelo</span><h2>Conectar e testar</h2><p>O modelo só será adicionado depois de responder ao teste.</p></div>
          <button className="icon-button" onClick={onClose}><X size={17} /></button>
        </header>
        <div className="provider-grid">{Object.entries(presets).map(([id, item]) => <button key={id} className={provider === id ? "active" : ""} onClick={() => { setProvider(id); setTestResult(null); }}>{item.name}</button>)}</div>
        <form key={provider} ref={formRef} className="form-stack" onSubmit={(event) => { event.preventDefault(); void testAndSave(); }}>
          <label>Nome na Dama<input name="name" defaultValue={preset.name} /></label>
          <label>URL base ou endpoint<input name="url" required defaultValue={preset.url} placeholder="https://api.exemplo.com/v1" /></label>
          <label>Identificador do modelo<input name="model" required placeholder={provider === "nvidia" ? "qwen/qwen3-coder-480b-a35b-instruct" : provider === "ollama" ? "qwen2.5-coder:latest" : "nome-do-modelo"} /></label>
          <label>Token <span>{provider === "ollama" ? "normalmente não é necessário" : "será protegido pelo sistema operacional"}</span><input name="token" type="password" placeholder="••••••••••••" /></label>
        </form>
        {provider === "nvidia" && <div className="endpoint-preview"><span>Endpoint final</span><code>https://integrate.api.nvidia.com/v1/chat/completions</code></div>}
        {testResult && <div className={`test-result ${testResult.startsWith("Testado") ? "success" : ""}`}>{testResult}</div>}
        {testing && <div className="model-testing"><span className="testing-pulse"><LoaderCircle className="spin" size={19} /></span><div><strong>Testando o modelo</strong><small>A Dama está aguardando uma resposta válida antes de salvar.</small></div></div>}
        <footer>
          <button className="quiet-button" onClick={onClose}>Cancelar</button>
          <button className="primary-button" onClick={testAndSave} disabled={testing}>{testing ? <LoaderCircle className="spin" size={14} /> : <Activity size={14} />} Testar e adicionar</button>
        </footer>
      </section>
    </div>
  );
}

function Onboarding({ initial, onComplete, onLanguageChange }: { initial: DamaSettings; onComplete: (settings: DamaSettings) => Promise<void>; onLanguageChange: (language: string) => void }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initial.profile.name);
  const [useCase, setUseCase] = useState(initial.profile.useCase || "personal");
  const [experience, setExperience] = useState(initial.profile.experience || "intermediate");
  const [approvalPolicy, setApprovalPolicy] = useState(initial.agent.approvalPolicy || "balanced");
  const [language, setLanguage] = useState(initial.agent.language || "pt-BR");
  const [finishing, setFinishing] = useState(false);
  const [videoUnavailable, setVideoUnavailable] = useState(false);
  const [benchmarkStatus, setBenchmarkStatus] = useState<"idle" | "running" | "done" | "error" | "skipped">("idle");
  const [benchmarkStage, setBenchmarkStage] = useState(0);
  const [benchmarkReport, setBenchmarkReport] = useState<SystemBenchmarkReport | null>(null);
  const [benchmarkError, setBenchmarkError] = useState<string | null>(null);
  const totalSteps = 6;

  async function runBenchmark() {
    if (!window.dama?.runSystemBenchmark) {
      setBenchmarkStatus("error");
      setBenchmarkError("O teste de desempenho só pode ser executado no aplicativo desktop.");
      return;
    }
    setBenchmarkStatus("running");
    setBenchmarkError(null);
    setBenchmarkStage(0);
    const timer = window.setInterval(() => setBenchmarkStage((current) => Math.min(4, current + 1)), 680);
    try {
      const [report] = await Promise.all([
        window.dama.runSystemBenchmark(),
        new Promise<void>((resolve) => window.setTimeout(resolve, 3400)),
      ]);
      setBenchmarkReport(report);
      setBenchmarkStage(4);
      setBenchmarkStatus("done");
    } catch (cause) {
      setBenchmarkError(cause instanceof Error ? cause.message : String(cause));
      setBenchmarkStatus("error");
    } finally { window.clearInterval(timer); }
  }

  async function finish() {
    setFinishing(true);
    await onComplete({
      ...initial,
      onboardingCompleted: true,
      profile: { name: name.trim() || "Você", useCase, experience },
      agent: { ...initial.agent, approvalPolicy, sendOnEnter: true, language },
    });
  }

  const canContinue = step !== 1 || name.trim().length > 0;
  return (
    <div className={`onboarding-shell ${step === 5 ? "benchmark-step" : ""}`}>
      <header className="onboarding-brand"><DinoLogo animated /><strong>DAMA</strong><label className="onboarding-language"><Languages size={13} /><select aria-label="Idioma da interface" value={language} onChange={(event) => { setLanguage(event.target.value); onLanguageChange(event.target.value); }}><option value="pt-BR">Português</option><option value="en-US">English</option><option value="es-ES">Español</option></select></label></header>
      <div className="onboarding-progress">{Array.from({ length: totalSteps }, (_, index) => <span key={index} className={index <= step ? "active" : ""} />)}</div>
      <main key={step}>
        {step === 0 && <div className="onboarding-intro">{videoUnavailable ? <DinoLogo animated title="Dino da Dama" /> : <video className="onboarding-dino-video" src={onboardingVideoUrl} autoPlay loop muted playsInline preload="auto" aria-label="Animação do Dino da Dama" onError={() => setVideoUnavailable(true)} />}<span className="eyebrow">Bem-vindo à Dama</span><h1>Seu ambiente, do seu jeito.</h1><p>Antes de abrir o primeiro projeto, vamos ajustar a Dama ao modo como você trabalha. Leva menos de um minuto.</p></div>}
        {step === 1 && <div className="onboarding-question"><span className="eyebrow">Sobre você</span><h1>Como devo chamar você?</h1><p>Usaremos seu nome apenas na experiência local da Dama.</p><label className="name-field"><UserRound size={18} /><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Seu nome" onKeyDown={(event) => { if (event.key === "Enter" && name.trim()) setStep(2); }} /></label></div>}
        {step === 2 && <div className="onboarding-question"><span className="eyebrow">Finalidade</span><h1>Para que você vai usar a Dama?</h1><p>Isso ajuda a calibrar sugestões, linguagem e nível de explicação.</p><div className="choice-grid two">
          <Choice selected={useCase === "work"} icon={<BriefcaseBusiness size={18} />} title="Trabalho" detail="Projetos profissionais e equipes" onClick={() => setUseCase("work")} />
          <Choice selected={useCase === "product"} icon={<Sparkles size={18} />} title="Criar produtos" detail="Apps, sites e novas ideias" onClick={() => setUseCase("product")} />
          <Choice selected={useCase === "learning"} icon={<GraduationCap size={18} />} title="Aprender" detail="Estudo e prática de programação" onClick={() => setUseCase("learning")} />
          <Choice selected={useCase === "personal"} icon={<Code2 size={18} />} title="Projetos pessoais" detail="Experimentação e ferramentas" onClick={() => setUseCase("personal")} />
        </div></div>}
        {step === 3 && <div className="onboarding-question"><span className="eyebrow">Experiência</span><h1>Quanto detalhe você prefere?</h1><p>A Dama pode explicar cada decisão ou conversar de forma mais direta.</p><div className="choice-stack">
          <Choice selected={experience === "beginner"} title="Estou começando" detail="Explique conceitos e apresente os próximos passos" onClick={() => setExperience("beginner")} />
          <Choice selected={experience === "intermediate"} title="Já desenvolvo" detail="Equilibre explicação e velocidade" onClick={() => setExperience("intermediate")} />
          <Choice selected={experience === "expert"} title="Quero objetividade" detail="Seja técnica, curta e assuma familiaridade" onClick={() => setExperience("expert")} />
        </div></div>}
        {step === 4 && <div className="onboarding-question"><span className="eyebrow">Autonomia</span><h1>Como a Dama deve agir?</h1><p>Comandos perigosos sempre terão proteção, independentemente desta escolha.</p><div className="choice-stack">
          <Choice selected={approvalPolicy === "careful"} title="Pergunte com frequência" detail="Aprove cada grupo de alterações e cada comando" onClick={() => setApprovalPolicy("careful")} />
          <Choice selected={approvalPolicy === "balanced"} title="Equilíbrio recomendado" detail="Aprove o plano e confirme somente ações sensíveis" onClick={() => setApprovalPolicy("balanced")} badge="Recomendado" />
          <Choice selected={approvalPolicy === "autonomous"} title="Mais autonomia" detail="Trabalhe dentro do plano e interrompa apenas diante de risco" onClick={() => setApprovalPolicy("autonomous")} />
        </div></div>}
        {step === 5 && <OnboardingBenchmark status={benchmarkStatus} stage={benchmarkStage} report={benchmarkReport} error={benchmarkError} onRun={runBenchmark} onSkip={() => setBenchmarkStatus("skipped")} />}
      </main>
      <footer>
        <button className="onboarding-back" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0 || benchmarkStatus === "running"}><ArrowLeft size={14} /> Voltar</button>
        {step < totalSteps - 1 ? <button className="onboarding-next" disabled={!canContinue} onClick={() => setStep((value) => value + 1)}>{step === 0 ? "Personalizar" : "Continuar"}<ArrowRight size={14} /></button> : <button className="onboarding-next" onClick={finish} disabled={finishing || benchmarkStatus === "running"}>{finishing ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />} Entrar na Dama</button>}
      </footer>
      <small className="onboarding-local"><ShieldCheck size={11} /> Essas preferências ficam neste dispositivo.</small>
    </div>
  );
}

function benchmarkMemory(value: number) {
  return value >= 1024 ? `${(value / 1024).toFixed(value >= 2048 ? 1 : 2)} GB` : `${value} MB`;
}

function OnboardingBenchmark({ status, stage, report, error, onRun, onSkip }: { status: "idle" | "running" | "done" | "error" | "skipped"; stage: number; report: SystemBenchmarkReport | null; error: string | null; onRun: () => void; onSkip: () => void }) {
  const stages = ["Identificando o hardware", "Verificando o processador", "Verificando a memória", "Medindo leitura e gravação", "Montando o relatório"];
  if (status === "running") return <div className="onboarding-benchmark loading"><div className="benchmark-loader"><Gauge size={25} /><span><LoaderCircle className="spin" size={14} /></span></div><span className="eyebrow">Teste de desempenho</span><h1>Verificando o computador</h1><p>O teste roda apenas neste computador e termina em alguns segundos.</p><div className="benchmark-stages">{stages.map((item, index) => <div key={item} className={index < stage ? "done" : index === stage ? "running" : ""}><span>{index < stage ? <Check size={11} /> : index === stage ? <LoaderCircle className="spin" size={11} /> : index + 1}</span><strong>{item}</strong></div>)}</div></div>;
  if (status === "done" && report) return <div className="onboarding-benchmark results"><header><div><span className="eyebrow">Desempenho do computador</span><h1>{report.assessment.label}</h1><p>{report.assessment.summary}</p></div><span className={`benchmark-grade ${report.assessment.level}`}><Gauge size={15} />{report.assessment.level === "ideal" ? "Recomendado" : report.assessment.level === "good" ? "Adequado" : "Limitado"}</span></header><div className="benchmark-hardware"><div><span>Processador</span><strong>{report.system.cpu}</strong><small>{report.system.logicalCores} núcleos lógicos · {report.system.arch}</small></div><div><span>Memória</span><strong>{benchmarkMemory(report.system.totalMemoryMb)}</strong><small>{benchmarkMemory(report.system.freeMemoryMb)} livres durante o teste</small></div><div><span>Gráficos</span><strong>{report.system.gpu}</strong><small>{report.system.os}</small></div><div><span>Uso da Dama</span><strong>{benchmarkMemory(report.measured.appRamStartMb)}</strong><small>Pico observado: {benchmarkMemory(report.measured.appRamPeakMb)}</small></div></div><div className="benchmark-table-wrap"><table className="benchmark-table"><thead><tr><th>Cenário</th><th>Mínimo</th><th>Uso comum</th><th>Pico estimado</th><th>CPU comum / pico</th></tr></thead><tbody>{report.estimates.map((item) => <tr key={item.scenario}><td><strong>{item.scenario}</strong><small>{item.note}</small></td><td>{benchmarkMemory(item.minimumRamMb)}</td><td>{benchmarkMemory(item.typicalRamMb)}</td><td>{benchmarkMemory(item.peakRamMb)}</td><td>{item.typicalCpuPercent}% / {item.peakCpuPercent}%</td></tr>)}</tbody></table></div><footer><div className="benchmark-measures"><span>CPU <b>{report.measured.cpuOpsPerSecond.toLocaleString("pt-BR")} ops/s</b></span><span>Memória <b>{report.measured.memoryCopyMbps.toLocaleString("pt-BR")} MB/s</b></span><span>Disco <b>{report.measured.diskWriteMbps} / {report.measured.diskReadMbps} MB/s</b></span></div><div className="benchmark-advice">{report.recommendations.map((item) => <span key={item}><Check size={11} />{item}</span>)}</div><button onClick={onRun}><RefreshCw size={12} /> Testar novamente</button></footer><p className="benchmark-disclaimer">Estimativas baseadas neste teste e no consumo atual do aplicativo. Projetos maiores, builds e modelos locais podem usar mais recursos. O consumo de VRAM não está incluído.</p></div>;
  return <div className="onboarding-benchmark prompt"><div className="benchmark-prompt-icon"><Gauge size={24} /></div><span className="eyebrow">Etapa opcional</span><h1>Verificar desempenho</h1><p>Faça um teste rápido para ver o consumo esperado no editor, no preview e durante builds.</p><div className="benchmark-promise"><span><ShieldCheck size={14} /><strong>Executado localmente</strong><small>Os dados não são enviados</small></span><span><Activity size={14} /><strong>Leva poucos segundos</strong><small>Não instala nem baixa arquivos</small></span><span><Gauge size={14} /><strong>Relatório de uso</strong><small>Memória e CPU por cenário</small></span></div>{error && <div className="benchmark-error"><AlertCircle size={13} />{error}</div>}{status === "skipped" && <div className="benchmark-skipped"><Check size={12} />Teste ignorado. Isso não muda o funcionamento da Dama.</div>}<div className="benchmark-prompt-actions"><button className="quiet-button" onClick={onSkip}>Agora não</button><button className="primary-button" onClick={onRun}><Gauge size={13} /> Iniciar teste</button></div></div>;
}

function Choice({ selected, icon, title, detail, badge, onClick }: { selected: boolean; icon?: React.ReactNode; title: string; detail: string; badge?: string; onClick: () => void }) {
  return <button className={`choice-card ${selected ? "selected" : ""}`} onClick={onClick}>{icon && <span className="choice-icon">{icon}</span>}<span><strong>{title}</strong><small>{detail}</small></span>{badge && <em>{badge}</em>}<span className="choice-check">{selected && <Check size={11} />}</span></button>;
}

type SettingsSection = "profile" | "models" | "dama" | "remote" | "agent" | "mcp" | "plugins" | "appearance" | "notifications" | "updates" | "privacy";

function SettingsCenter({ initial, modelsState, onModelsChange, onClose, onSave, onConfigureModel, onResetOnboarding }: { initial: DamaSettings; modelsState: ModelsState; onModelsChange: (state: ModelsState) => void; onClose: () => void; onSave: (settings: DamaSettings) => Promise<void>; onConfigureModel: () => void; onResetOnboarding: () => Promise<void> }) {
  const [section, setSection] = useState<SettingsSection>("profile");
  const [draft, setDraft] = useState<DamaSettings>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testingModelId, setTestingModelId] = useState<string | null>(null);
  const [modelTestResults, setModelTestResults] = useState<Record<string, string>>({});
  const [permissionsCleared, setPermissionsCleared] = useState(false);
  const [engineStatus, setEngineStatus] = useState<DamaEngineStatus | null>(null);
  const [engineBusy, setEngineBusy] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [updateState, setUpdateState] = useState<UpdateState | null>(null);
  const [remoteState, setRemoteState] = useState<RemoteState | null>(null);
  const [remoteBusy, setRemoteBusy] = useState(false);
  const [mcpDraft, setMcpDraft] = useState({ name: "", transport: "stdio" as "stdio" | "http", value: "" });
  const sections: Array<{ id: SettingsSection; label: string; icon: typeof UserRound }> = [
    { id: "profile", label: "Perfil", icon: UserRound }, { id: "models", label: "Modelos", icon: Bot },
    { id: "dama", label: "Dama AI", icon: Sparkles }, { id: "remote", label: "Dama Remote", icon: Smartphone },
    { id: "agent", label: "Agente", icon: SlidersHorizontal }, { id: "mcp", label: "MCP", icon: Plug },
    { id: "plugins", label: "Plugins", icon: Puzzle }, { id: "appearance", label: "Aparência", icon: Palette },
    { id: "notifications", label: "Notificações", icon: Bell }, { id: "updates", label: "Atualizações", icon: RefreshCw },
    { id: "privacy", label: "Privacidade", icon: ShieldCheck },
  ];

  useEffect(() => {
    let current = true;
    window.dama?.damaEngineStatus().then((status) => { if (current) setEngineStatus(status); }).catch((error) => { if (current) setEngineError(error instanceof Error ? error.message : String(error)); });
    return () => { current = false; };
  }, []);

  useEffect(() => {
    if (!window.dama?.getUpdateState) return;
    let current = true;
    window.dama.getUpdateState().then((state) => { if (current) setUpdateState(state); });
    const dispose = window.dama.onUpdateState((state) => { if (current) setUpdateState(state); });
    return () => { current = false; dispose(); };
  }, []);

  useEffect(() => {
    if (!window.dama?.getRemoteState) return;
    let current = true;
    window.dama.getRemoteState().then((state) => { if (current) setRemoteState(state); });
    const dispose = window.dama.onRemoteState((state) => { if (current) setRemoteState(state); });
    return () => { current = false; dispose(); };
  }, []);

  function patch<K extends keyof DamaSettings>(key: K, value: DamaSettings[K]) { setDraft((current) => ({ ...current, [key]: value })); setSaved(false); }
  async function save() { setSaving(true); await onSave(draft); setSaving(false); setSaved(true); }
  function addMcp() {
    if (!mcpDraft.name.trim() || !mcpDraft.value.trim()) return;
    const server = { id: crypto.randomUUID(), name: mcpDraft.name.trim(), transport: mcpDraft.transport, enabled: true, ...(mcpDraft.transport === "stdio" ? { command: mcpDraft.value.trim(), args: "" } : { url: mcpDraft.value.trim() }) };
    patch("mcpServers", [...draft.mcpServers, server]);
    setMcpDraft({ name: "", transport: "stdio", value: "" });
  }
  async function addPlugin() {
    const plugin = await window.dama?.chooseLocalPlugin();
    if (plugin) patch("plugins", [...draft.plugins.filter((item) => item.path !== plugin.path), plugin]);
  }
  async function setActiveModel(id: string) { const result = window.dama ? await window.dama.setActiveModel(id) : { activeModelId: id, routing: modelsState.routing.mode === "single" ? { ...modelsState.routing, primary: id } : modelsState.routing }; onModelsChange({ ...modelsState, activeModelId: result.activeModelId, routing: result.routing }); }
  async function updateRouting(next: ModelRouting) { const routing = window.dama ? await window.dama.updateModelRouting(next) : next; onModelsChange({ ...modelsState, routing }); }
  async function removeModel(id: string) { if (window.dama) onModelsChange(await window.dama.removeModel(id)); }
  async function testExistingModel(id: string) {
    if (!window.dama) return;
    setTestingModelId(id);
    setModelTestResults((current) => ({ ...current, [id]: "Testando conexão…" }));
    try {
      const result = await window.dama.testModel(id);
      setModelTestResults((current) => ({ ...current, [id]: `Conexão confirmada em ${result.latencyMs} ms` }));
    } catch (error) {
      setModelTestResults((current) => ({ ...current, [id]: error instanceof Error ? error.message : String(error) }));
    } finally { setTestingModelId(null); }
  }
  async function runEngineAction(action: "install" | "verify" | "remove") {
    if (!window.dama) return;
    setEngineBusy(true);
    setEngineError(null);
    try {
      const status = action === "install"
        ? await window.dama.installDamaEngine()
        : action === "remove"
          ? await window.dama.removeDamaEngine()
          : await window.dama.damaEngineStatus(true);
      setEngineStatus(status);
    } catch (error) {
      setEngineError(error instanceof Error ? error.message : String(error));
    } finally { setEngineBusy(false); }
  }

  async function runRemoteAction(action: "start" | "stop") {
    if (!window.dama) return;
    setRemoteBusy(true);
    try {
      setRemoteState(action === "start" ? await window.dama.startRemote() : await window.dama.stopRemote());
    } finally { setRemoteBusy(false); }
  }

  async function chooseDamaBaseModel(baseModelId: string | null) {
    setEngineError(null);
    setDraft((current) => ({ ...current, damaEngine: { baseModelId } }));
    try {
      if (window.dama) onModelsChange(await window.dama.setDamaEngineBaseModel(baseModelId));
      setSaved(true);
    } catch (error) {
      setEngineError(error instanceof Error ? error.message : String(error));
    }
  }

  return <div className="settings-backdrop"><section className="settings-center">
    <aside><div className="settings-brand"><DinoLogo /><strong>Configurações</strong></div><nav>{sections.map((item) => { const Icon = item.icon; return <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => setSection(item.id)}><Icon size={14} />{item.label}</button>; })}</nav><div className="settings-version">Dama 0.12.1 · preview</div></aside>
    <main><header><div><span className="eyebrow">Preferências</span><h2>{sections.find((item) => item.id === section)?.label}</h2></div><button className="icon-button" onClick={onClose}><X size={17} /></button></header><div className="settings-scroll" key={section}>
      {section === "remote" && <RemoteSettings state={remoteState} busy={remoteBusy} appUrl={draft.remote.appUrl} onAppUrlChange={(appUrl) => patch("remote", { appUrl })} onAction={runRemoteAction} />}
      {section === "appearance" && <SettingsGroup title="Leitura" description="Aumenta toda a interface mantendo as proporções do aplicativo."><Field label="Tamanho da interface"><select value={draft.appearance.scale || 1.12} onChange={(event) => patch("appearance", { ...draft.appearance, scale: Number(event.target.value) })}><option value={1}>100% · compacto</option><option value={1.12}>112% · recomendado</option><option value={1.25}>125% · grande</option><option value={1.4}>140% · muito grande</option></select></Field></SettingsGroup>}
      {section === "models" && modelsState.models.length > 0 && <SettingsGroup title="Diagnóstico de conexão" description="Repete o teste usando o endpoint e o token protegido já salvos."><div className="model-list test-list">{modelsState.models.map((model) => <div key={model.id}><span className="model-live" /><div><strong>{model.name}</strong><em className={modelTestResults[model.id]?.startsWith("Conexão") ? "test-ok" : ""}>{modelTestResults[model.id] || "Pronto para testar"}</em></div><button className="quiet-button" disabled={testingModelId === model.id} onClick={() => testExistingModel(model.id)}>{testingModelId === model.id ? <LoaderCircle className="spin" size={12} /> : <Activity size={12} />} Testar</button></div>)}</div></SettingsGroup>}
      {section === "profile" && <><SettingsGroup title="Seu perfil" description="Personaliza como a Dama conversa com você."><Field label="Como devemos chamar você?"><input value={draft.profile.name} onChange={(event) => patch("profile", { ...draft.profile, name: event.target.value })} /></Field><Field label="Finalidade principal"><select value={draft.profile.useCase} onChange={(event) => patch("profile", { ...draft.profile, useCase: event.target.value })}><option value="work">Trabalho</option><option value="product">Criar produtos</option><option value="learning">Aprender</option><option value="personal">Projetos pessoais</option></select></Field><Field label="Nível de detalhe"><select value={draft.profile.experience} onChange={(event) => patch("profile", { ...draft.profile, experience: event.target.value })}><option value="beginner">Explicativo</option><option value="intermediate">Equilibrado</option><option value="expert">Objetivo e técnico</option></select></Field></SettingsGroup><SettingsGroup title="Primeira execução" description="Revise novamente as perguntas de personalização."><div className="reset-onboarding"><div><strong>Refazer onboarding</strong><small>Suas integrações e projetos não serão removidos.</small></div><button className="secondary-button" onClick={onResetOnboarding}>Começar novamente</button></div></SettingsGroup></>}
      {section === "models" && <>
        <SettingsGroup title="Modelos conectados" description="Somente modelos que passaram no teste aparecem aqui. Tokens persistidos usam a proteção do sistema operacional.">
          <button className="add-integration" onClick={onConfigureModel}><Plus size={14} /> Testar e adicionar modelo</button>
          {modelsState.models.length ? <div className="model-list">{modelsState.models.map((model) => <div key={model.id} className={modelsState.activeModelId === model.id ? "active" : ""}><span className={`model-live ${model.available === false ? "unavailable" : ""}`} /><div><strong>{model.name}{model.builtIn ? " · Integrado" : ""}</strong><small>{model.model}</small><em>{model.endpoint}</em></div>{modelsState.activeModelId === model.id ? <span className="active-label">Principal</span> : model.available === false ? <span className="active-label muted">Escolha uma base</span> : <button className="quiet-button" onClick={() => setActiveModel(model.id)}>Usar</button>}{!model.builtIn && <button className="icon-button" onClick={() => removeModel(model.id)}><Trash2 size={13} /></button>}</div>)}</div> : <SettingsEmpty icon={<Bot size={20} />} text="Nenhum modelo testado e salvo." />}
        </SettingsGroup>
        {modelsState.models.length > 0 && <ModelRoutingSettings modelsState={modelsState} onUpdate={updateRouting} onSetActive={setActiveModel} />}
        <SettingsGroup title="Geração" description="Valores padrão para modelos que aceitam estes parâmetros.">
          <RangeField label="Temperatura" value={draft.agent.temperature} min={0} max={1} step={0.1} onChange={(value) => patch("agent", { ...draft.agent, temperature: value })} />
          <Field label="Janela de contexto"><select value={draft.agent.contextWindow} onChange={(event) => patch("agent", { ...draft.agent, contextWindow: Number(event.target.value) })}><option value={16000}>16 mil tokens</option><option value={32000}>32 mil tokens</option><option value={64000}>64 mil tokens</option><option value={128000}>128 mil tokens</option></select></Field>
        </SettingsGroup>
        <SettingsGroup title="Falhas e reconexão" description="Repete chamadas apenas em erros temporários, como timeout, desconexão, 429, 502, 503 e 504. Cota esgotada, token inválido e modelo inexistente pulam direto para o fallback.">
          <Field label="Tentativas de reconexão"><select value={draft.agent.connectionRetries} onChange={(event) => patch("agent", { ...draft.agent, connectionRetries: Number(event.target.value) })}><option value={0}>Não repetir</option><option value={1}>1 nova tentativa</option><option value={2}>2 novas tentativas</option><option value={3}>3 novas tentativas</option><option value={5}>5 novas tentativas</option><option value={-1}>Ilimitadas</option></select></Field>
          <Field label="Correções de resposta inválida"><select value={draft.agent.formatRetries ?? 2} onChange={(event) => patch("agent", { ...draft.agent, formatRetries: Number(event.target.value) })}><option value={0}>Não chamar o modelo novamente</option><option value={1}>1 tentativa de correção</option><option value={2}>2 tentativas de correção</option><option value={3}>3 tentativas de correção</option><option value={5}>5 tentativas de correção</option></select></Field>
          {draft.agent.connectionRetries === -1 && <div className="settings-inline-warning"><AlertCircle size={14} /><span>O modo ilimitado continuará tentando enquanto a Dama estiver aberta ou até algum modelo/fallback responder.</span></div>}
        </SettingsGroup>
      </>}
      {section === "dama" && <>
        <SettingsGroup title="Motor local da Dama" description="Componente opcional baseado no Carnaval IA. O agente e as ferramentas rodam neste computador; as respostas continuam usando os modelos configurados por você.">
          <div className={`dama-engine-card ${engineStatus?.installed ? "installed" : ""}`}>
            <div className="dama-engine-mark"><DinoLogo animated={Boolean(engineStatus?.installed)} /></div>
            <div className="dama-engine-copy"><span className="eyebrow">{engineStatus?.installed ? "Instalado" : "Componente opcional"}</span><strong>Dama AI {engineStatus?.version ? `· ${engineStatus.version}` : ""}</strong><p>{engineStatus?.message || "Verificando a instalação local…"}</p>{engineStatus?.location && <code title={engineStatus.location}>{engineStatus.location}</code>}</div>
            <span className={`engine-state ${engineStatus?.verified === false ? "error" : engineStatus?.installed ? "ready" : "idle"}`}>{engineStatus?.verified === false ? "Arquivos alterados" : engineStatus?.verified ? "Integridade confirmada" : engineStatus?.installed ? "Disponível" : "Não instalado"}</span>
          </div>
          {engineStatus?.features.length ? <div className="dama-engine-features">{engineStatus.features.map((feature) => <span key={feature}><Check size={11} />{feature}</span>)}</div> : null}
          {engineStatus?.installed && <div className="dama-base-model"><Field label="Modelo base da Dama AI"><select value={draft.damaEngine.baseModelId || modelsState.models.find((model) => !model.builtIn)?.id || ""} onChange={(event) => void chooseDamaBaseModel(event.target.value || null)}><option value="">Selecione um modelo testado</option>{modelsState.models.filter((model) => !model.builtIn).map((model) => <option key={model.id} value={model.id}>{model.name} · {model.model}</option>)}</select></Field><p>A Dama AI aparece no chat e nas funções de orquestração como um perfil próprio. Este modelo base fornece a geração de texto; o motor, as ferramentas e o contexto continuam locais.</p></div>}
          {engineError && <div className="settings-inline-warning"><AlertCircle size={14} /><span>{engineError}</span></div>}
          <div className="dama-engine-actions">{!engineStatus?.installed ? <button className="primary-button" disabled={engineBusy} onClick={() => void runEngineAction("install")}>{engineBusy ? <LoaderCircle className="spin" size={13} /> : <Sparkles size={13} />} Instalar Dama AI</button> : <button className="secondary-button" disabled={engineBusy} onClick={() => void runEngineAction("verify")}>{engineBusy ? <LoaderCircle className="spin" size={13} /> : <ShieldCheck size={13} />} Verificar arquivos</button>}</div>
        </SettingsGroup>
        <SettingsGroup title="O que fica no computador" description="A opção do instalador não baixa pesos de modelo."><div className="engine-explanation"><span><Cpu size={14} /><div><strong>Local</strong><small>Motor do agente, ferramentas, permissões, contexto do projeto e histórico.</small></div></span><span><Globe2 size={14} /><div><strong>API configurada</strong><small>O modelo que raciocina e gera respostas. Tokens continuam protegidos pelo sistema operacional.</small></div></span></div></SettingsGroup>
      </>}
      {section === "agent" && <><SettingsGroup title="Comportamento" description="Define como o agente planeja e quando interrompe o trabalho."><Field label="Modo padrão"><select value={draft.agent.defaultMode} onChange={(event) => patch("agent", { ...draft.agent, defaultMode: event.target.value })}><option value="plan">Planejar antes de agir</option><option value="agent">Agente direto</option><option value="ask">Somente responder</option></select></Field><Field label="Política de aprovação"><select value={draft.agent.approvalPolicy} onChange={(event) => patch("agent", { ...draft.agent, approvalPolicy: event.target.value })}><option value="careful">Cautelosa</option><option value="balanced">Equilibrada</option><option value="autonomous">Mais autônoma</option></select></Field><Toggle label="Limitar ciclos do agente" detail="Desligado por padrão: a Dama continua trabalhando até concluir" checked={draft.agent.limitTurns} onChange={(value) => patch("agent", { ...draft.agent, limitTurns: value })} />{draft.agent.limitTurns && <RangeField label="Máximo de ciclos" value={draft.agent.maxTurns} min={4} max={100} step={1} onChange={(value) => patch("agent", { ...draft.agent, maxTurns: value })} />}<Toggle label="Enter envia a mensagem" detail="Use Shift+Enter para criar uma nova linha" checked={draft.agent.sendOnEnter} onChange={(value) => patch("agent", { ...draft.agent, sendOnEnter: value })} /></SettingsGroup><SettingsGroup title="Memória do projeto" description="Registro opcional e local das decisões importantes de cada workspace."><Toggle label="Atualizar memória automaticamente" detail="Após alterações reais, mantém notes/memoria-do-projeto.md com pedido, resultado e arquivos importantes." checked={draft.projectMemory.enabled} onChange={(value) => patch("projectMemory", { enabled: value })} /></SettingsGroup><SettingsGroup title="Uso do computador" description="Ferramenta opcional para testar sites e aplicativos na interface real do Windows."><Toggle label="Permitir controle assistido" detail="Mesmo ativada, cada sessão exige autorização. Uma borda laranja fica visível e Esc cancela imediatamente." checked={draft.computerUse.enabled} onChange={(value) => patch("computerUse", { enabled: value })} /><div className="settings-inline-warning"><ShieldCheck size={14} /><span>A Dama lê somente a janela ativa pela Acessibilidade do Windows. Campos de senha não são lidos e a sessão termina junto com a execução.</span></div></SettingsGroup><SettingsGroup title="Instruções pessoais" description="Aplicadas junto às regras de cada projeto."><textarea className="settings-textarea" value={draft.agent.customInstructions} onChange={(event) => patch("agent", { ...draft.agent, customInstructions: event.target.value })} placeholder="Ex.: prefira pnpm, explique decisões de arquitetura…" /></SettingsGroup></>}
      {section === "mcp" && <><SettingsGroup title="Servidores MCP" description="Cadastre servidores por comando local ou endpoint HTTP. O agente conecta somente quando você autorizar uma chamada."><div className="integration-form"><input value={mcpDraft.name} onChange={(event) => setMcpDraft({ ...mcpDraft, name: event.target.value })} placeholder="Nome do servidor" /><select value={mcpDraft.transport} onChange={(event) => setMcpDraft({ ...mcpDraft, transport: event.target.value as "stdio" | "http" })}><option value="stdio">Comando local</option><option value="http">HTTP</option></select><input value={mcpDraft.value} onChange={(event) => setMcpDraft({ ...mcpDraft, value: event.target.value })} placeholder={mcpDraft.transport === "stdio" ? "npx -y @servidor/mcp" : "https://mcp.exemplo.com"} /><button className="secondary-button" onClick={addMcp}><Plus size={13} /> Adicionar</button></div>{draft.mcpServers.length ? <div className="integration-list">{draft.mcpServers.map((server) => <div key={server.id}><span className="integration-icon"><Plug size={14} /></span><div><strong>{server.name}</strong><small>{server.transport === "stdio" ? server.command : server.url}</small><em>{server.enabled ? "Ativo · uso sujeito a autorização" : "Desativado"}</em></div><Toggle compact label="" checked={server.enabled} onChange={(enabled) => patch("mcpServers", draft.mcpServers.map((item) => item.id === server.id ? { ...item, enabled } : item))} /><button className="icon-button" onClick={() => patch("mcpServers", draft.mcpServers.filter((item) => item.id !== server.id))}><Trash2 size={13} /></button></div>)}</div> : <SettingsEmpty icon={<Plug size={20} />} text="Nenhum servidor MCP configurado." />}</SettingsGroup></>}
      {section === "plugins" && <SettingsGroup title="Plugins locais" description="Cadastre bundles locais. O runtime de extensões ainda não executa plugins nesta versão."><button className="add-integration" onClick={addPlugin}><Plus size={14} /> Adicionar pasta de plugin</button>{draft.plugins.length ? <div className="integration-list">{draft.plugins.map((plugin) => <div key={plugin.id}><span className="integration-icon"><Puzzle size={14} /></span><div><strong>{plugin.name}</strong><small>{plugin.description || plugin.path}</small><em>{plugin.version} · carregamento ainda não iniciado</em></div><Toggle compact label="" checked={plugin.enabled} onChange={(enabled) => patch("plugins", draft.plugins.map((item) => item.id === plugin.id ? { ...item, enabled } : item))} /><button className="icon-button" onClick={() => patch("plugins", draft.plugins.filter((item) => item.id !== plugin.id))}><Trash2 size={13} /></button></div>)}</div> : <SettingsEmpty icon={<Puzzle size={20} />} text="Nenhum plugin local adicionado." />}</SettingsGroup>}
      {section === "appearance" && <SettingsGroup title="Interface" description="Estas opções são aplicadas ao salvar."><Field label="Idioma da interface"><select value={draft.agent.language} onChange={(event) => patch("agent", { ...draft.agent, language: event.target.value })}><option value="pt-BR">Português (Brasil)</option><option value="en-US">English</option><option value="es-ES">Español</option></select></Field><Field label="Densidade"><select value={draft.appearance.density} onChange={(event) => patch("appearance", { ...draft.appearance, density: event.target.value })}><option value="compact">Compacta</option><option value="comfortable">Confortável</option><option value="spacious">Espaçosa</option></select></Field><Field label="Cor de destaque"><select value={draft.appearance.accent} onChange={(event) => patch("appearance", { ...draft.appearance, accent: event.target.value })}><option value="amber">Âmbar</option><option value="green">Verde</option><option value="blue">Azul</option><option value="violet">Violeta</option><option value="neutral">Neutra</option></select></Field><Field label="Superfície"><select value={draft.appearance.surface} onChange={(event) => patch("appearance", { ...draft.appearance, surface: event.target.value })}><option value="warm">Grafite quente</option><option value="black">Preto profundo</option><option value="slate">Azul ardósia</option></select></Field><Toggle label="Animações da interface" detail="Transições mais suaves entre telas e estados" checked={draft.appearance.motion} onChange={(value) => patch("appearance", { ...draft.appearance, motion: value })} /><Toggle label="Painel de contexto aberto" detail="Mostra atividade e estado do projeto à direita" checked={draft.appearance.contextPanel} onChange={(value) => patch("appearance", { ...draft.appearance, contextPanel: value })} /></SettingsGroup>}
      {section === "notifications" && <><SettingsGroup title="Notificações" description="A Dama usa as notificações nativas do Windows para avisos importantes."><Toggle label="Ativar notificações" detail="Permite que a Dama envie avisos do sistema" checked={draft.notifications.enabled} onChange={(value) => patch("notifications", { ...draft.notifications, enabled: value })} /><Toggle label="Autorizações pendentes" detail="Avisa quando uma ferramenta precisa da sua decisão" checked={draft.notifications.approvals} onChange={(value) => patch("notifications", { ...draft.notifications, approvals: value })} /><Toggle label="Execuções longas concluídas" detail="Avisa quando o agente termina um trabalho demorado" checked={draft.notifications.completion} onChange={(value) => patch("notifications", { ...draft.notifications, completion: value })} /><Toggle label="Somente quando a Dama não estiver em foco" detail="Evita avisos duplicados enquanto você já está olhando a execução" checked={draft.notifications.onlyWhenUnfocused} onChange={(value) => patch("notifications", { ...draft.notifications, onlyWhenUnfocused: value })} /><RangeField label="Tempo mínimo para considerar uma execução longa" value={draft.notifications.longRunSeconds} min={5} max={120} step={5} onChange={(value) => patch("notifications", { ...draft.notifications, longRunSeconds: value })} /></SettingsGroup></>}
      {section === "updates" && <><SettingsGroup title="Atualizações" description="Novas versões são verificadas em um canal assinado e instaladas pelo atualizador da Dama."><Toggle label="Atualização automática" detail="Baixa e instala a versão mais recente ao abrir a Dama" checked={draft.updates.automatic} onChange={(value) => patch("updates", { ...draft.updates, automatic: value })} /><Toggle label="Procurar ao iniciar" detail="Consulta o canal estável sempre que a Dama for aberta" checked={draft.updates.checkOnStartup} onChange={(value) => patch("updates", { ...draft.updates, checkOnStartup: value })} /><div className="update-settings-status"><div><strong>Versão instalada</strong><span>{updateState?.currentVersion || "0.10.0"}</span></div><div><strong>Estado</strong><span>{updateState?.status === "checking" ? "Procurando…" : updateState?.status === "available" ? `Versão ${updateState.version} disponível` : updateState?.status === "downloading" ? `Baixando · ${Math.round(updateState.percent)}%` : updateState?.status === "downloaded" || updateState?.status === "installing" ? "Pronta para instalar" : updateState?.status === "current" ? "Atualizada" : updateState?.status === "unsupported" ? "Disponível no aplicativo instalado" : updateState?.status === "error" ? "Falha na verificação" : "Pronta para verificar"}</span></div></div>{updateState?.error && <div className="settings-inline-warning"><AlertCircle size={14} /><span>{updateState.error}</span></div>}<button className="secondary-button" disabled={updateState?.status === "checking" || updateState?.status === "downloading"} onClick={() => void window.dama?.checkForUpdates()}>{updateState?.status === "checking" ? <LoaderCircle className="spin" size={13} /> : <RefreshCw size={13} />} Procurar atualização</button></SettingsGroup></>}
      {section === "privacy" && <><SettingsGroup title="Dados e privacidade" description="Projetos e conversas ficam somente neste computador. A Dama não possui telemetria nem envio automático de diagnóstico."><Toggle label="Histórico local" detail="Salvar conversas para continuar depois e alternar entre projetos" checked={draft.privacy.localHistory} onChange={(value) => patch("privacy", { ...draft.privacy, localHistory: value })} /><Toggle disabled label="Telemetria anônima" detail="Indisponível e desligada" checked={false} onChange={() => {}} /><Toggle disabled label="Relatórios de diagnóstico" detail="Indisponível e desligado" checked={false} onChange={() => {}} /></SettingsGroup><SettingsGroup title="Permissões de ferramentas" description="Autorizações de chat, projeto e comandos específicos ficam salvas apenas neste computador."><div className="reset-onboarding"><div><strong>{permissionsCleared ? "Permissões revogadas" : "Revogar permissões persistentes"}</strong><small>Na próxima operação protegida, o agente voltará a mostrar o card de autorização.</small></div><button className="secondary-button" onClick={async () => { await window.dama?.clearToolApprovals(); setPermissionsCleared(true); }}>Revogar todas</button></div></SettingsGroup></>}
    </div><footer><span>{saved ? <><Check size={12} /> Preferências salvas</> : "Alterações ficam locais"}</span><button className="primary-button" onClick={save} disabled={saving}>{saving ? <LoaderCircle className="spin" size={13} /> : <Save size={13} />} Salvar alterações</button></footer></main>
  </section></div>;
}

function RemoteSettings({ state, busy, appUrl, onAppUrlChange, onAction }: { state: RemoteState | null; busy: boolean; appUrl: string; onAppUrlChange: (value: string) => void; onAction: (action: "start" | "stop") => Promise<void> }) {
  return <>
    <SettingsGroup title="Acesso pelo celular" description="O celular conversa diretamente com este computador. O site não recebe o token, os modelos, os arquivos nem as conversas.">
      <div className={`remote-settings-card ${state?.status || "off"}`}>
        <div className="remote-settings-icon"><Smartphone size={22} /></div>
        <div><span className="eyebrow">{state?.status === "ready" ? "Pronto para parear" : state?.status === "downloading" ? "Preparando conexão" : state?.status === "starting" ? "Iniciando" : state?.status === "error" ? "Falha na conexão" : "Desligado"}</span><strong>Dama Remote</strong><p>{state?.status === "ready" ? (state.connected ? "Celular conectado a este computador." : "Leia o QR Code com a câmera do celular.") : state?.detail || state?.error || "Ative somente quando quiser acessar a Dama em outro dispositivo."}</p></div>
        <span className={`remote-live ${state?.connected ? "connected" : ""}`} />
      </div>
      {state?.status === "ready" && state.qrDataUrl && <div className="remote-pairing"><img src={state.qrDataUrl} alt="QR Code do Dama Remote" /><div><strong>Abrir no celular</strong><p>Leia este código com a câmera. O endereço e a chave de sessão entram no navegador sem passar pelo servidor da Dama.</p>{state.endpoint && <code>{state.endpoint}</code>}<small>A sessão expira quando você desligar o Remote ou fechar a Dama.</small></div></div>}
      {state?.error && <div className="settings-inline-warning"><AlertCircle size={14} /><span>{state.error}</span></div>}
      <div className="remote-actions">{state?.enabled ? <button className="secondary-button" disabled={busy} onClick={() => void onAction("stop")}>{busy ? <LoaderCircle className="spin" size={13} /> : <Square size={12} />} Desligar acesso</button> : <button className="primary-button" disabled={busy} onClick={() => void onAction("start")}>{busy ? <LoaderCircle className="spin" size={13} /> : <QrCode size={13} />} Gerar acesso seguro</button>}</div>
    </SettingsGroup>
    <SettingsGroup title="Endereço do aplicativo móvel" description="Use a implantação oficial ou uma cópia própria do Dama Remote."><Field label="URL do Dama Remote"><input value={appUrl} onChange={(event) => onAppUrlChange(event.target.value)} placeholder="https://dama-remote.vercel.app" /></Field></SettingsGroup>
    <SettingsGroup title="Segurança" description="A primeira versão usa um túnel HTTPS de saída e uma chave aleatória de 256 bits."><div className="remote-security"><span><ShieldCheck size={14} /><div><strong>Nenhuma porta do roteador é aberta</strong><small>A conexão sai deste computador e pode ser encerrada a qualquer momento.</small></div></span><span><Globe2 size={14} /><div><strong>Recurso beta</strong><small>O túnel gratuito pode mudar de endereço ou ficar temporariamente indisponível.</small></div></span></div></SettingsGroup>
  </>;
}

function ModelRoutingSettings({ modelsState, onUpdate, onSetActive }: { modelsState: ModelsState; onUpdate: (routing: ModelRouting) => Promise<void>; onSetActive: (id: string) => Promise<void> }) {
  const routing = modelsState.routing;
  const mode = routing.mode || "single";
  const primaryId = routing.primary || modelsState.activeModelId || modelsState.models[0]?.id || "";
  const roleFields: Array<{ key: "orchestrate" | "build" | "review"; label: string; detail: string }> = [
    { key: "orchestrate", label: "Orquestrador", detail: "Entende o pedido e prepara o plano" },
    { key: "build", label: "Programador", detail: "Usa ferramentas e altera o projeto" },
    { key: "review", label: "Revisor", detail: "Analisa o resultado e devolve correções" },
  ];
  async function chooseSingleModel(id: string) {
    await onSetActive(id);
    await onUpdate({ ...routing, mode: "single", primary: id });
  }
  return <>
    <SettingsGroup title="Como os modelos trabalham" description="Use apenas um modelo para tudo ou monte uma equipe com funções separadas.">
      <div className="model-mode-switch">
        <button className={mode === "single" ? "active" : ""} onClick={() => void onUpdate({ ...routing, mode: "single" })}><Cpu size={16} /><span><strong>Modelo único</strong><small>O mesmo modelo planeja, implementa e revisa</small></span><Check size={13} /></button>
        <button className={mode === "team" ? "active" : ""} onClick={() => void onUpdate({ ...routing, mode: "team" })}><Sparkles size={16} /><span><strong>Equipe de modelos</strong><small>Distribua cada etapa entre especialistas</small></span><Check size={13} /></button>
      </div>
      {mode === "single" ? <div className="routing-grid single-routing"><Field label="Modelo para tudo"><select value={primaryId} onChange={(event) => void chooseSingleModel(event.target.value)}>{modelsState.models.map((model) => <option key={model.id} value={model.id} disabled={model.available === false}>{model.name} · {model.model}</option>)}</select></Field><div className="routing-explainer"><Bot size={15} /><span>Esse modelo conversa, cria o plano, programa e faz até {routing.reviewPasses} {routing.reviewPasses === 1 ? "revisão" : "revisões"} antes da entrega.</span></div></div> : <div className="routing-grid team-routing">
        <Field label="Chat principal"><select value={routing.primary || ""} onChange={(event) => void onUpdate({ ...routing, primary: event.target.value || null })}><option value="">Usar modelo principal</option>{modelsState.models.map((model) => <option key={model.id} value={model.id} disabled={model.available === false}>{model.name} · {model.model}</option>)}</select></Field>
        {roleFields.map((role) => <label className="settings-field role-field" key={role.key}><span><strong>{role.label}</strong><small>{role.detail}</small></span><select value={routing[role.key] || ""} onChange={(event) => void onUpdate({ ...routing, [role.key]: event.target.value || null })}><option value="">Usar modelo principal</option>{modelsState.models.map((model) => <option key={model.id} value={model.id} disabled={model.available === false}>{model.name} · {model.model}</option>)}</select></label>)}
        <div className="routing-explainer"><Sparkles size={15} /><span>O revisor recebe os arquivos finais. Se encontrar problemas, as observações voltam ao Programador antes da entrega.</span></div>
      </div>}
      <RangeField label="Rodadas máximas de revisão" value={routing.reviewPasses} min={0} max={3} step={1} onChange={(value) => void onUpdate({ ...routing, reviewPasses: value })} />
    </SettingsGroup>
    <SettingsGroup title="Continuidade se um modelo falhar" description="A Dama tenta estes modelos na ordem abaixo quando o modelo escolhido não responder.">
      <div className="fallback-order">
        <span>Ordem de fallback</span>
        {routing.fallbackOrder.map((id, index) => { const model = modelsState.models.find((item) => item.id === id); return model ? <div key={id}><strong>{index + 1}</strong><span>{model.name}</span><button disabled={index === 0} title="Subir" onClick={() => { const order = [...routing.fallbackOrder]; [order[index - 1], order[index]] = [order[index], order[index - 1]]; void onUpdate({ ...routing, fallbackOrder: order }); }}><ArrowUp size={12} /></button><button title="Remover do fallback" onClick={() => void onUpdate({ ...routing, fallbackOrder: routing.fallbackOrder.filter((item) => item !== id) })}><X size={12} /></button></div> : null; })}
        {!routing.fallbackOrder.length && <p>Nenhum fallback configurado.</p>}
        <select value="" onChange={(event) => event.target.value && void onUpdate({ ...routing, fallbackOrder: [...routing.fallbackOrder, event.target.value] })}><option value="">Adicionar ao fallback…</option>{modelsState.models.filter((model) => !routing.fallbackOrder.includes(model.id)).map((model) => <option key={model.id} value={model.id} disabled={model.available === false}>{model.name}</option>)}</select>
      </div>
    </SettingsGroup>
  </>;
}

function SettingsGroup({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <section className="settings-group"><header><h3>{title}</h3><p>{description}</p></header><div>{children}</div></section>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="settings-field"><span>{label}</span>{children}</label>; }
function RangeField({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) { return <label className="range-field"><span>{label}<strong>{value}</strong></span><input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /></label>; }
function Toggle({ label, detail, checked, compact, disabled, onChange }: { label: string; detail?: string; checked: boolean; compact?: boolean; disabled?: boolean; onChange: (value: boolean) => void }) { return <label className={`toggle-row ${compact ? "compact" : ""} ${disabled ? "disabled" : ""}`}><span>{label && <strong>{label}</strong>}{detail && <small>{detail}</small>}</span><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /><i /></label>; }
function SettingsEmpty({ icon, text }: { icon: React.ReactNode; text: string }) { return <div className="settings-empty">{icon}<span>{text}</span></div>; }

function ApprovalDialog({ command, onCancel, onApprove }: { command: string; onCancel: () => void; onApprove: () => void }) {
  return (
    <div className="dialog-backdrop" onMouseDown={onCancel}>
      <section className="dialog approval-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <div className="approval-icon"><TerminalSquare size={19} /></div>
        <h2>Executar este comando?</h2>
        <p>Ele será executado na raiz do projeto atual e poderá modificar arquivos ou instalar pacotes.</p>
        <code>{command}</code>
        <footer><button className="quiet-button" onClick={onCancel}>Cancelar</button><button className="primary-button" onClick={onApprove}>Executar</button></footer>
      </section>
    </div>
  );
}

class ViewBoundary extends Component<{ resetKey: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("Dama view error", error, info.componentStack); }
  componentDidUpdate(previous: { resetKey: string }) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return <div className="view-crash"><DinoLogo /><span className="eyebrow">A Dama tropeçou</span><h2>Esta tela encontrou um problema.</h2><p>{this.state.error.message || "O estado recebido não pôde ser exibido."}</p><button className="secondary-button" onClick={() => window.location.reload()}>Reabrir a interface</button></div>;
  }
}

function formatUpdateBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 MB";
  return `${(value / 1024 / 1024).toFixed(value >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
}

function UpdateScreen({ state, onDownload, onInstall, onDismiss }: { state: UpdateState; onDownload: () => void; onInstall: () => void; onDismiss: () => void }) {
  const downloading = state.status === "downloading";
  const installing = state.status === "installing";
  const downloaded = state.status === "downloaded";
  const title = installing ? "Aplicando atualização" : downloading ? "Atualizando a Dama" : downloaded ? "Atualização pronta" : "Uma nova versão está disponível";
  const notes = String(state.releaseNotes || "Melhorias de estabilidade, segurança e experiência da Dama.").split(/\r?\n/).map((line) => line.replace(/^\s*[-#*]+\s*/, "").trim()).filter(Boolean);
  return <div className="update-screen"><div className="update-shell"><DinoLogo animated /><span className="eyebrow">Dama {state.version || ""}</span><h1>{title}</h1>{downloading || installing ? <><p>{installing ? "A Dama será reaberta assim que a instalação terminar." : "Baixando a nova versão com segurança. Você não precisa fazer nada."}</p><div className="update-progress"><span style={{ width: `${installing ? 100 : Math.max(2, state.percent)}%` }} /></div><div className="update-progress-meta"><span>{installing ? "Instalando…" : `${Math.round(state.percent)}%`}</span>{downloading && <small>{formatUpdateBytes(state.transferred)} de {formatUpdateBytes(state.total)}{state.bytesPerSecond ? ` · ${formatUpdateBytes(state.bytesPerSecond)}/s` : ""}</small>}</div></> : <><p>A versão {state.version} já pode ser instalada neste computador.</p><section className="update-notes"><strong>Notas da versão</strong>{notes.slice(0, 8).map((note, index) => <span key={`${index}-${note}`}><Check size={11} />{note}</span>)}</section><div className="update-actions">{!state.automatic && <button className="quiet-button" onClick={onDismiss}>Agora não</button>}{downloaded ? <button className="primary-button" onClick={onInstall}><RefreshCw size={13} /> Reiniciar e instalar</button> : <button className="primary-button" onClick={onDownload}><ArrowDownToLine size={13} /> Baixar atualização</button>}</div></>}</div></div>;
}

export default function App() {
  const [view, setView] = useState<View>("chat");
  const [project, setProject] = useState<OpenProject | null>(null);
  const [openFile, setOpenFile] = useState<OpenFile | null>(null);
  const [openFileLine, setOpenFileLine] = useState<number | null>(null);
  const [fileDraft, setFileDraft] = useState("");
  const [fileSaving, setFileSaving] = useState(false);
  const [connector, setConnector] = useState<ConnectorState>({ configured: false });
  const [modelsState, setModelsState] = useState<ModelsState>({ models: [], activeModelId: null, routing: { mode: "single", primary: null, build: null, review: null, orchestrate: null, reviewPasses: 1, fallbackOrder: [] } });
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [reasoning, setReasoning] = useState("medium");
  const [connectorDialog, setConnectorDialog] = useState(false);
  const [settings, setSettings] = useState<DamaSettings | null>(null);
  const [startupReady, setStartupReady] = useState(false);
  const [startupSplashVisible, setStartupSplashVisible] = useState(false);
  const [startupSplashDone, setStartupSplashDone] = useState(false);
  const [entryTransition, setEntryTransition] = useState(false);
  const [entryReady, setEntryReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(true);
  const [git, setGit] = useState<GitSummary>({ repository: false, branch: null, changes: [] });
  const [prompt, setPrompt] = useState("");
  const [activePrompt, setActivePrompt] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [phase, setPhase] = useState<TaskPhase>("idle");
  const [agentResult, setAgentResult] = useState<AgentResult | null>(null);
  const [changeSet, setChangeSet] = useState<ChangeSetSummary | null>(null);
  const [changeDiff, setChangeDiff] = useState<ChangeDiff | null>(null);
  const [changeResolving, setChangeResolving] = useState(false);
  const [agentEvents, setAgentEvents] = useState<AgentProgressEvent[]>([]);
  const [agentMessages, setAgentMessages] = useState<AgentThreadMessage[]>([]);
  const [agentPlans, setAgentPlans] = useState<AgentPlanRecord[]>([]);
  const [toolApprovals, setToolApprovals] = useState<ToolApprovalRequest[]>([]);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const activeRunId = useRef<string | null>(null);
  const activePlanId = useRef<string | null>(null);
  const [workspaceIndex, setWorkspaceIndex] = useState<WorkspaceIndex>({ projects: [], conversations: [], activeProjectPath: null });
  const [workspaceManagerOpen, setWorkspaceManagerOpen] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [conversationKind, setConversationKind] = useState<ConversationKind>("agent");
  const [conversationCreatedAt, setConversationCreatedAt] = useState<string>(new Date().toISOString());
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [terminalInput, setTerminalInput] = useState("");
  const [terminalEntries, setTerminalEntries] = useState<TerminalEntry[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);
  const pendingCommandOrigin = useRef<"agent" | "terminal" | null>(null);
  const agentCommandIds = useRef<Set<string>>(new Set());
  const [preview, setPreview] = useState<PreviewState>({ running: false, url: null, logs: [], command: null });
  const [previewUrlInput, setPreviewUrlInput] = useState("");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [agentReferences, setAgentReferences] = useState<PreviewElementReference[]>([]);
  const [updateState, setUpdateState] = useState<UpdateState | null>(null);
  const [dismissedUpdate, setDismissedUpdate] = useState<string | null>(null);
  const [interfaceLanguageOverride, setInterfaceLanguageOverride] = useState<string | null>(null);

  useInterfaceLanguage(interfaceLanguageOverride || settings?.agent.language);

  const isDirty = openFile ? fileDraft !== openFile.content : false;
  const projectName = project?.name || "Abrir projeto";
  const activeModel = modelsState.models.find((model) => model.id === (selectedModelId || modelsState.activeModelId)) || null;
  const agentModelId = modelsState.routing.mode === "team" ? null : selectedModelId;
  const technicalEvents = agentEvents.filter((item) => item.stage === "execution" && (item.type === "status" || item.type === "tool" || item.type === "error")).slice(-8).reverse();

  useEffect(() => {
    setChangeSet(agentResult?.changeSet || null);
    if (!agentResult?.changeSet || agentResult.changeSet.status !== "pending") setChangeDiff(null);
  }, [agentResult?.changeSet?.id, agentResult?.changeSet?.status]);

  useEffect(() => {
    let active = true;
    const splashTimer = window.setTimeout(() => {
      if (active) setStartupSplashVisible(true);
    }, 300);
    (async () => {
      const loaded = window.dama ? await window.dama.getSettings() : browserSettings;
      if (!active) return;
      setSettings(loaded);
      setInterfaceLanguageOverride(loaded.agent.language || "pt-BR");
      setContextOpen(loaded.appearance.contextPanel);
      if (window.dama) {
        const modelData = await window.dama.listModels();
        if (!active) return;
        setModelsState(modelData);
        setSelectedModelId(modelData.activeModelId);
        const selected = modelData.models.find((model) => model.id === modelData.activeModelId);
        if (selected) setConnector({ configured: true, model: selected.model, url: selected.url, kind: selected.kind });
        if (hasWorkspaceApi()) {
          const index = await window.dama.listWorkspace();
          if (!active) return;
          setWorkspaceIndex(index);
          const recentProject = index.projects[0];
          if (recentProject) {
            const opened = await window.dama.selectProject(recentProject.path);
            if (!active) return;
            setProject(opened);
            setGit(await window.dama.gitSummary());
            const recentConversation = index.conversations.find((item) => item.projectPath.toLowerCase() === recentProject.path.toLowerCase());
            if (recentConversation) await restoreConversation(recentConversation.id, false);
            else startNewConversation("agent");
          }
        } else if (window.dama.apiVersion !== 10) {
          setError("A interface foi atualizada, mas o processo desktop ainda é da versão anterior. Feche a Dama completamente e abra novamente para ativar projetos e conversas.");
        }
        if (window.dama.apiVersion !== 10) setError("A Dama foi atualizada. Feche o aplicativo completamente e abra novamente para carregar notificações, idiomas e atualizações automáticas.");
      }
    })().catch((cause) => setError(cause instanceof Error ? cause.message : String(cause))).finally(() => {
      window.clearTimeout(splashTimer);
      if (active) setStartupReady(true);
    });
    return () => { active = false; window.clearTimeout(splashTimer); };
  }, []);

  useEffect(() => {
    if (!window.dama?.getUpdateState) return;
    let active = true;
    window.dama.getUpdateState().then((state) => { if (active) setUpdateState(state); }).catch(() => {});
    const disposeUpdate = window.dama.onUpdateState((state) => { if (active) setUpdateState(state); });
    const disposeNotification = window.dama.onNotificationOpen(() => { if (active) setView("agent"); });
    return () => { active = false; disposeUpdate(); disposeNotification(); };
  }, []);

  function conversationTitle() {
    const firstAgentRequest = agentMessages.find((item) => item.role === "user")?.content;
    const firstChatRequest = chatMessages.find((item) => item.role === "user")?.content;
    return String(firstAgentRequest || firstChatRequest || "Nova conversa").replace(/^\/(planejar|implementar|revisar|corrigir)\s+/i, "").slice(0, 64);
  }

  async function refreshWorkspaceIndex() {
    if (!hasWorkspaceApi()) return;
    setWorkspaceIndex(await window.dama!.listWorkspace());
  }

  async function saveCurrentConversation() {
    if (!hasWorkspaceApi() || !settings?.privacy.localHistory || !activeConversationId) return;
    if (!agentMessages.length && !agentEvents.length && !agentPlans.length && !chatMessages.length) return;
    await window.dama!.saveConversation({
      id: activeConversationId,
      projectPath: project?.path || "__projectless__",
      projectName: project?.name || "Sem projeto",
      title: conversationTitle(),
      kind: conversationKind,
      createdAt: conversationCreatedAt,
      updatedAt: new Date().toISOString(),
      data: { agentMessages, agentEvents, agentPlans, toolApprovals, agentResult, chatMessages },
    });
    await refreshWorkspaceIndex();
  }

  function startNewConversation(kind: ConversationKind) {
    const now = new Date().toISOString();
    setActiveConversationId(crypto.randomUUID());
    setConversationCreatedAt(now);
    setConversationKind(kind);
    setAgentMessages([]);
    setAgentEvents([]);
    setAgentPlans([]);
    setToolApprovals([]);
    setChatMessages([]);
    setAgentReferences([]);
    setEditingPlanId(null);
    setPlan(null);
    setAgentResult(null);
    setChangeSet(null);
    setChangeDiff(null);
    setPhase("idle");
    activeRunId.current = null;
    activePlanId.current = null;
    setView(kind);
    setWorkspaceManagerOpen(false);
  }

  async function createConversation(kind: ConversationKind) {
    await saveCurrentConversation();
    startNewConversation(kind);
  }

  async function restoreConversation(id: string, saveBefore = true) {
    if (!hasWorkspaceApi()) return;
    if (saveBefore) await saveCurrentConversation();
    const saved = await window.dama!.loadConversation(id);
    if (!saved) return;
    if (saved.projectPath !== "__projectless__" && (!project || project.path.toLowerCase() !== saved.projectPath.toLowerCase())) {
      const opened = await window.dama!.selectProject(saved.projectPath);
      setProject(opened);
      setGit(await window.dama!.gitSummary());
    } else if (saved.projectPath === "__projectless__") {
      setProject(null);
      setGit({ repository: false, branch: null, changes: [] });
    }
    const data = saved.data || {};
    const restoredMessages = Array.isArray(data.agentMessages) ? data.agentMessages as AgentThreadMessage[] : [];
    const restoredEvents = Array.isArray(data.agentEvents) ? data.agentEvents as AgentProgressEvent[] : [];
    const restoredPlans = Array.isArray(data.agentPlans) ? data.agentPlans as AgentPlanRecord[] : [];
    const restoredApprovals = Array.isArray(data.toolApprovals) ? data.toolApprovals as ToolApprovalRequest[] : [];
    const latestPlan = [...restoredPlans].reverse().find((item) => !["superseded", "rejected"].includes(item.status));
    const restoredRunId = latestPlan?.runId || restoredMessages.at(-1)?.runId || null;
    const liveApprovals = await window.dama!.listPendingToolApprovals();
    const liveIds = new Set(liveApprovals.filter((item) => item.runId === restoredRunId).map((item) => item.id));
    const restoredChat = Array.isArray(data.chatMessages) ? data.chatMessages as ChatMessage[] : [];
    setAgentMessages(restoredMessages);
    setAgentEvents(restoredEvents);
    setAgentPlans(restoredPlans);
    setToolApprovals([...restoredApprovals.map((item) => item.status === "pending" && !liveIds.has(item.id) ? { ...item, status: "denied" as const, decision: "deny" as const } : item), ...liveApprovals.filter((item) => item.runId === restoredRunId && !restoredApprovals.some((savedApproval) => savedApproval.id === item.id)).map((item) => ({ ...item, status: "pending" as const }))]);
    setChatMessages(restoredChat);
    setActiveConversationId(saved.id);
    setConversationCreatedAt(saved.createdAt);
    setConversationKind(saved.kind);
    setView(saved.kind);
    setEditingPlanId(null);
    activePlanId.current = latestPlan?.id || null;
    activeRunId.current = restoredRunId;
    setPlan(latestPlan?.plan || null);
    const restoredResult = (data.agentResult && typeof data.agentResult === "object" ? data.agentResult : latestPlan?.result) as AgentResult | null;
    setAgentResult(restoredResult || null);
    setPhase(latestPlan?.status === "review" || latestPlan?.status === "editing" ? "review" : latestPlan?.status === "executing" ? "error" : latestPlan?.status === "done" ? "done" : "idle");
    setWorkspaceManagerOpen(false);
  }

  useEffect(() => {
    if (!window.dama?.onConversationChanged) return;
    const disposeConversation = window.dama.onConversationChanged(({ id }) => {
      void refreshWorkspaceIndex();
      if (id === activeConversationId) void restoreConversation(id, false);
    });
    const disposeAgentMessage = window.dama.onRemoteAgentMessage(({ conversationId, message }) => {
      if (conversationKind !== "agent" || conversationId !== activeConversationId) return;
      setAgentMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
    });
    return () => { disposeConversation(); disposeAgentMessage(); };
  }, [activeConversationId, conversationKind]);

  async function openChangeDiff(relativePath: string) {
    if (!window.dama || !changeSet) return;
    try {
      setError(null);
      setChangeDiff(await window.dama.getChangeDiff(changeSet.id, relativePath));
      setView("changes");
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }

  function updateResolvedChangeSet(next: ChangeSetSummary) {
    setChangeSet(next);
    setAgentResult((current) => current ? { ...current, changeSet: next } : current);
    setAgentPlans((current) => current.map((item) => item.result?.changeSet?.id === next.id ? { ...item, result: { ...item.result, changeSet: next } } : item));
  }

  async function acceptAgentChanges() {
    if (!window.dama || !changeSet || changeSet.status !== "pending") return;
    setChangeResolving(true);
    try {
      const resolved = await window.dama.acceptChangeSet(changeSet.id);
      updateResolvedChangeSet(resolved.changeSet);
      setProject(resolved.project);
      setGit(resolved.git);
      setAgentEvents((current) => [...current, { id: crypto.randomUUID(), runId: activeRunId.current || "resolved", at: new Date().toISOString(), stage: "execution", type: "commentary", title: "Dama", detail: "Alterações aceitas. O código atual foi mantido no projeto.", state: "done" }]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setChangeResolving(false); }
  }

  async function rejectAgentChanges() {
    if (!window.dama || !changeSet || changeSet.status !== "pending") return;
    setChangeResolving(true);
    try {
      const resolved = await window.dama.rejectChangeSet(changeSet.id);
      updateResolvedChangeSet(resolved.changeSet);
      setProject(resolved.project);
      setGit(resolved.git);
      setOpenFile(null);
      setChangeDiff(null);
      setView("agent");
      const now = new Date().toISOString();
      const runId = activeRunId.current || "resolved";
      setAgentMessages((current) => [...current,
        { id: crypto.randomUUID(), runId, role: "user", content: "Recusei as alterações desta execução e restaurei os arquivos anteriores.", at: now },
        { id: crypto.randomUUID(), runId, role: "assistant", content: "Tudo bem. Restaurei o código exatamente como estava antes desta execução. Se quiser, diga o que não funcionou ou qual direção devo seguir na próxima tentativa.", at: new Date(Date.now() + 1).toISOString() },
      ]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setChangeResolving(false); }
  }

  async function switchProject(projectPath: string) {
    if (!hasWorkspaceApi()) return;
    await saveCurrentConversation();
    const latestIndex = await window.dama!.listWorkspace();
    setWorkspaceIndex(latestIndex);
    const opened = await window.dama!.selectProject(projectPath);
    setProject(opened);
    setOpenFile(null);
    setGit(await window.dama!.gitSummary());
    const latest = latestIndex.conversations.find((item) => item.projectPath.toLowerCase() === projectPath.toLowerCase());
    if (latest) await restoreConversation(latest.id, false);
    else startNewConversation("agent");
    await refreshWorkspaceIndex();
  }

  async function removeConversation(id: string) {
    if (!hasWorkspaceApi()) return;
    await window.dama!.deleteConversation(id);
    if (id === activeConversationId) startNewConversation(conversationKind);
    await refreshWorkspaceIndex();
  }

  useEffect(() => {
    if (!settings?.privacy.localHistory || !activeConversationId) return;
    const timer = window.setTimeout(() => { void saveCurrentConversation(); }, 550);
    return () => window.clearTimeout(timer);
  }, [agentMessages, agentEvents, agentPlans, toolApprovals, agentResult, chatMessages, activeConversationId, project?.path, settings?.privacy.localHistory]);

  async function saveSettings(next: DamaSettings) {
    const saved = window.dama ? await window.dama.updateSettings(next) : next;
    setSettings(saved);
    setInterfaceLanguageOverride(saved.agent.language || "pt-BR");
    setContextOpen(saved.appearance.contextPanel);
  }

  async function activateModel(id: string) {
    setSelectedModelId(id);
    const selected = modelsState.models.find((model) => model.id === id);
    if (selected) setConnector({ configured: true, model: selected.model, url: selected.url, kind: selected.kind });
    const result = window.dama ? await window.dama.setActiveModel(id) : { activeModelId: id, routing: modelsState.routing.mode === "single" ? { ...modelsState.routing, primary: id } : modelsState.routing };
    setModelsState((current) => ({ ...current, activeModelId: result.activeModelId, routing: result.routing }));
  }

  async function finishOnboarding(next: DamaSettings) {
    setEntryTransition(true);
    setEntryReady(false);
    try {
      await saveSettings(next);
      setEntryReady(true);
    } catch (cause) {
      setEntryTransition(false);
      setError(cause instanceof Error ? cause.message : String(cause));
      throw cause;
    }
  }

  async function resetOnboarding() {
    const next = window.dama ? await window.dama.resetOnboarding() : { ...settings!, onboardingCompleted: false };
    setSettings(next);
    setSettingsOpen(false);
  }

  function addActivity(label: string, detail: string, status: ActivityEvent["status"] = "running") {
    const event = { id: Date.now() + Math.random(), label, detail, status };
    setActivity((current) => [event, ...current].slice(0, 12));
    return event.id;
  }

  function finishActivity(id: number, detail: string, status: "done" | "error" = "done") {
    setActivity((current) => current.map((item) => item.id === id ? { ...item, detail, status } : item));
  }

  async function refreshGit() {
    if (!window.dama || !project) return;
    setGit(await window.dama.gitSummary());
  }

  async function openProject() {
    try {
      setError(null);
      if (!window.dama) throw new Error("Abertura de pastas está disponível no aplicativo desktop.");
      await saveCurrentConversation();
      const selected = await window.dama.openProject();
      if (!selected) return;
      setProject(selected);
      setOpenFile(null);
      setOpenFileLine(null);
      const summary = await window.dama.gitSummary();
      setGit(summary);
      startNewConversation("agent");
      await refreshWorkspaceIndex();
      addActivity("Projeto aberto", selected.path, "done");
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }

  async function selectFile(path: string, line?: number) {
    try {
      if (!window.dama) throw new Error("O editor de arquivos exige o aplicativo desktop.");
      const file = await window.dama.readFile(path);
      setOpenFile(file);
      setOpenFileLine(line || null);
      setFileDraft(file.content);
      setView("editor");
      if (line) addActivity("Resultado aberto", `${path}:${line}`, "done");
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }

  async function selectNote(path: string) {
    try {
      if (!window.dama) throw new Error("As notas exigem o aplicativo desktop.");
      const file = await window.dama.readFile(path);
      setOpenFile(file);
      setOpenFileLine(null);
      setFileDraft(file.content);
      setView("notes");
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }

  async function createNote(title: string) {
    if (!window.dama || !project) return;
    try {
      const created = await window.dama.createNote(title);
      setProject(created.project);
      setOpenFile(created.file);
      setOpenFileLine(null);
      setFileDraft(created.file.content);
      setView("notes");
      addActivity("Nota criada", created.file.path, "done");
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }

  async function importNoteAsset(notePath: string, file: globalThis.File) {
    if (!window.dama || !project) throw new Error("Abra um projeto antes de adicionar imagens.");
    const asset = await window.dama.importNoteAsset({ notePath, name: file.name || "imagem", mime: file.type, data: new Uint8Array(await file.arrayBuffer()) });
    setProject(await window.dama.refreshProject());
    addActivity("Imagem anexada", asset.path, "done");
    return asset;
  }

  async function saveFile() {
    if (!window.dama || !openFile || !isDirty) return;
    try {
      setFileSaving(true);
      const result = await window.dama.writeFile(openFile.path, fileDraft);
      setOpenFile({ ...openFile, content: fileDraft, modifiedAt: result.modifiedAt });
      addActivity("Arquivo salvo", openFile.path, "done");
      await refreshGit();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setFileSaving(false); }
  }

  useEffect(() => {
    const listener = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void saveFile(); }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  });

  useEffect(() => {
    if (!window.dama) return;
    return window.dama.onPreviewUpdate((state) => {
      setPreview(state);
      if (state.url) setPreviewUrlInput(state.url);
    });
  }, []);

  useEffect(() => {
    if (!window.dama) return;
    return window.dama.onTerminalEvent((event) => {
      setTerminalEntries((current) => current.map((entry) => entry.id === event.id ? {
        ...entry,
        output: event.type === "output" && event.stream === "stdout" ? entry.output + (event.data || "") : entry.output,
        errorOutput: event.type === "output" && event.stream === "stderr" ? entry.errorOutput + (event.data || "") : event.type === "error" ? entry.errorOutput + (event.data || "") : entry.errorOutput,
        running: event.type === "exit" ? false : entry.running,
        code: event.type === "exit" ? event.code : entry.code,
      } : entry));
      if (agentCommandIds.current.has(event.id) && activeRunId.current) {
        setAgentEvents((current) => {
          const timelineId = `terminal-${event.id}`;
          const index = current.findIndex((item) => item.id === timelineId);
          const previous = index >= 0 ? current[index] : null;
          const output = event.data || "";
          const detail = event.type === "exit"
            ? `${previous?.detail || ""}${previous?.detail ? "\n" : ""}Processo finalizado com código ${event.code ?? "?"}.`
            : `${previous?.detail || ""}${output}`.slice(-8000);
          const next: AgentProgressEvent = {
            id: timelineId,
            runId: activeRunId.current!,
            at: new Date().toISOString(),
            stage: "execution",
            type: event.type === "error" ? "error" : "tool",
            title: `Terminal · ${event.command}`,
            detail,
            state: event.type === "exit" ? (event.code === 0 ? "done" : "error") : event.type === "error" ? "error" : "running",
          };
          if (event.type === "exit" || event.type === "error") agentCommandIds.current.delete(event.id);
          if (index < 0) return [...current, next];
          return current.map((item, itemIndex) => itemIndex === index ? next : item);
        });
      }
    });
  }, []);

  useEffect(() => {
    if (!window.dama) return;
    return window.dama.onAgentEvent((event) => {
      if (event.runId !== activeRunId.current) return;
      setAgentEvents((current) => {
        let pendingIndex = -1;
        for (let index = current.length - 1; index >= 0; index -= 1) {
          const item = current[index];
          if (item.stage === event.stage && item.title === event.title && item.state === "running") { pendingIndex = index; break; }
        }
        if (pendingIndex >= 0) return current.map((item, index) => index === pendingIndex ? { ...event, id: item.id } : item);
        return [...current, event];
      });
    });
  }, []);

  useEffect(() => {
    if (!window.dama) return;
    return window.dama.onToolApproval((request) => {
      if (request.runId !== activeRunId.current) return;
      setToolApprovals((current) => [...current.filter((item) => item.id !== request.id), { ...request, status: "pending" }]);
    });
  }, []);

  async function resolveToolApproval(id: string, decision: ToolApprovalDecision) {
    if (!window.dama) return;
    const status = decision === "deny" ? "denied" : "approved";
    setToolApprovals((current) => current.map((item) => item.id === id ? { ...item, status, decision } : item));
    try { await window.dama.resolveToolApproval(id, decision); }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setToolApprovals((current) => current.map((item) => item.id === id ? { ...item, status: "pending", decision: undefined } : item));
    }
  }

  function buildAgentHistory(extra: Array<{ role: "user" | "assistant"; content: string }> = []) {
    const history = [
      ...agentMessages.map((item) => ({ role: item.role, content: item.content, at: item.at })),
      ...agentEvents.filter((item) => item.type === "message" || item.type === "commentary").map((item) => ({ role: "assistant" as const, content: item.detail, at: item.at })),
      ...agentPlans.map((item) => ({ role: "assistant" as const, content: `Plano ${item.status}: ${item.plan.title}. ${item.plan.summary}`, at: item.at })),
    ].sort((a, b) => a.at.localeCompare(b.at)).slice(-36).map(({ role, content }) => ({ role, content }));
    return [...history, ...extra].slice(-40);
  }

  async function createPlan(event: FormEvent) {
    event.preventDefault();
    const visibleRequest = prompt.trim();
    if (!visibleRequest) return;
    const attachedReferences = agentReferences;
    const referenceContext = attachedReferences.length ? `\n\nREFERÊNCIAS VISUAIS SELECIONADAS NO PREVIEW (use os arquivos e faixas abaixo; não repita este bloco na resposta):\n${attachedReferences.map((reference, index) => `${index + 1}. ${reference.path || "origem não resolvida"}${reference.startLine ? `:${reference.startLine}${reference.endLine && reference.endLine !== reference.startLine ? `-${reference.endLine}` : ""}` : ""} · ${reference.selector} · ${reference.label}`).join("\n")}` : "";
    const request = `${visibleRequest}${referenceContext}`;
    if (!modelsState.models.length) { setConnectorDialog(true); return; }
    const baseChangeSetId = changeSet?.status === "pending" ? changeSet.id : null;
    const now = new Date().toISOString();
    const currentRunId = activeRunId.current;
    let messageAlreadyAdded = false;
    setPrompt("");
    setAgentReferences([]);

    if (!activeConversationId) {
      setActiveConversationId(crypto.randomUUID());
      setConversationCreatedAt(now);
      setConversationKind("agent");
    }

    if ((phase === "planning" || phase === "executing") && currentRunId && window.dama) {
      setAgentMessages((current) => [...current, { id: crypto.randomUUID(), runId: currentRunId, role: "user", content: visibleRequest, at: now }]);
      messageAlreadyAdded = true;
      const steered = await window.dama.steerAgent(currentRunId, request);
      if (steered.accepted) {
        addActivity("Orientação adicionada", visibleRequest, "done");
        return;
      }
    }

    if (editingPlanId) {
      const existing = agentPlans.find((item) => item.id === editingPlanId);
      if (!existing || !window.dama) return;
      if (typeof window.dama.revisePlan !== "function") {
        setError("Feche a Dama completamente e abra novamente para ativar a edição de planos desta versão.");
        setPrompt(request);
        return;
      }
      const runId = crypto.randomUUID();
      activeRunId.current = runId;
      setAgentMessages((current) => [...current, { id: crypto.randomUUID(), runId, role: "user", content: visibleRequest, at: now }]);
      setAgentPlans((current) => current.map((item) => item.id === existing.id ? { ...item, runId, status: "editing" } : item));
      setPhase("planning");
      const activityId = addActivity("Editando plano", visibleRequest);
      try {
        const revised = await window.dama.revisePlan({ originalPrompt: existing.prompt, instruction: request, plan: existing.plan, modelId: agentModelId, reasoning, runId, history: buildAgentHistory([{ role: "user", content: request }]) });
        const revisedPlanId = crypto.randomUUID();
        const revisedAt = new Date().toISOString();
        setAgentPlans((current) => [
          ...current.map((item) => item.id === existing.id ? { ...item, status: "superseded" as AgentPlanStatus } : item),
          { id: revisedPlanId, runId, prompt: existing.prompt, plan: revised, status: "review", result: null, baseChangeSetId: existing.baseChangeSetId || baseChangeSetId, at: revisedAt },
        ]);
        setPlan(revised);
        activePlanId.current = revisedPlanId;
        setEditingPlanId(null);
        setPhase("review");
        finishActivity(activityId, "Nova versão do plano pronta para aprovação");
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        setAgentPlans((current) => current.map((item) => item.id === existing.id ? { ...item, status: "review" } : item));
        setEditingPlanId(existing.id);
        setError(message);
        setPhase("review");
        finishActivity(activityId, message, "error");
      }
      return;
    }

    if (phase === "review" && activePlanId.current) {
      setAgentPlans((current) => current.map((item) => item.id === activePlanId.current ? { ...item, status: "superseded" } : item));
    }

    const activityId = addActivity("Analisando pedido", visibleRequest);
    const runId = crypto.randomUUID();
    activeRunId.current = runId;
    if (!messageAlreadyAdded) {
      setAgentMessages((current) => [...current, { id: crypto.randomUUID(), runId, role: "user", content: visibleRequest, at: now }]);
    }
    try {
      setError(null);
      if (!project && !isStandaloneResearchRequest(visibleRequest) && !isDirectConversationRequest(visibleRequest)) {
        if (!window.dama) throw new Error("A criação automática de projetos exige o aplicativo desktop.");
        const created = await window.dama.createProjectFromPrompt(request);
        setProject(created);
        setGit(await window.dama.gitSummary());
        await refreshWorkspaceIndex();
        addActivity("Workspace criado", created.path, "done");
        setAgentEvents((current) => [...current, { id: crypto.randomUUID(), runId, at: new Date().toISOString(), stage: "planning", type: "tool", title: "Workspace criado", detail: created.path, state: "done" }]);
      }
      setPlan(null);
      if (!baseChangeSetId) setAgentResult(null);
      setActivePrompt(request);
      setPhase("planning");
      const history = buildAgentHistory([{ role: "user", content: request }]);
      const forcePlan = /^\/planejar\b/i.test(request);
      const rawPreparation = await window.dama!.createPlan(request, agentModelId, reasoning, runId, history, forcePlan) as AgentPreparation | Plan;
      const preparation: AgentPreparation = "plan" in rawPreparation ? rawPreparation : { mode: "plan", intro: "", plan: rawPreparation };
      const nextPlan = preparation.plan;
      if (preparation.mode === "direct") {
        setPhase("executing");
        const result = await window.dama!.executePlan({ prompt: request, plan: nextPlan, modelId: agentModelId, reasoning, runId, conversationId: activeConversationId, history, direct: true, baseChangeSetId });
        setAgentResult(result);
        if (result.project) setProject(result.project);
        setGit(result.git);
        setPhase("done");
        activePlanId.current = null;
        finishActivity(activityId, result.changedFiles.length ? `${result.changedFiles.length} arquivo(s) alterado(s) diretamente` : "Concluído sem precisar de plano");
        await refreshWorkspaceIndex();
        return;
      }
      const planId = crypto.randomUUID();
      activePlanId.current = planId;
      setPlan(nextPlan);
      setAgentPlans((current) => [...current, { id: planId, runId, prompt: request, plan: nextPlan, status: "review", result: null, baseChangeSetId, at: new Date().toISOString() }]);
      setPhase("review");
      finishActivity(activityId, `${nextPlan.steps.length} etapas propostas`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      setPhase("error");
      finishActivity(activityId, message, "error");
    }
  }

  async function approvePlan(planId: string) {
    const record = agentPlans.find((item) => item.id === planId);
    if (!record) return;
    const activityId = addActivity("Executando plano aprovado", record.plan.title);
    activePlanId.current = planId;
    activeRunId.current = record.runId;
    setPlan(record.plan);
    setActivePrompt(record.prompt);
    setAgentPlans((current) => current.map((item) => item.id === planId ? { ...item, status: "executing" } : item));
    try {
      setError(null);
      setPhase("executing");
      const result = await window.dama!.executePlan({ prompt: record.prompt, plan: record.plan, modelId: agentModelId, reasoning, runId: record.runId, conversationId: activeConversationId, history: buildAgentHistory(), baseChangeSetId: record.baseChangeSetId || (changeSet?.status === "pending" ? changeSet.id : null) });
      setAgentResult(result);
      setAgentPlans((current) => current.map((item) => item.id === planId ? { ...item, status: "done", result } : item));
      if (result.project) setProject(result.project);
      setGit(result.git);
      setPhase("done");
      finishActivity(activityId, result.changedFiles.length ? `${result.changedFiles.length} arquivo(s) alterado(s)` : "Concluído sem alterações");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setAgentPlans((current) => current.map((item) => item.id === planId ? { ...item, status: "error" } : item));
      setError(message);
      setPhase("error");
      finishActivity(activityId, message, "error");
    }
  }

  function editPlan(planId: string) {
    const record = agentPlans.find((item) => item.id === planId);
    if (!record) return;
    setEditingPlanId(planId);
    setAgentPlans((current) => current.map((item) => item.id === planId ? { ...item, status: "editing" } : item));
    setPlan(record.plan);
    setPhase("review");
    setAgentMessages((current) => [...current, { id: crypto.randomUUID(), runId: record.runId, role: "assistant", content: "Claro. Diga somente o que você quer mudar. Vou editar este mesmo plano e preservar o restante.", at: new Date().toISOString() }]);
  }

  async function performSearch(event?: FormEvent) {
    event?.preventDefault();
    if (!window.dama || !project || searchQuery.trim().length < 2) return;
    setSearching(true);
    try { setSearchResults(await window.dama.searchProject(searchQuery)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setSearching(false); }
  }

  async function executeCommand(command: string) {
    if (!window.dama || !command.trim()) return;
    const fromAgent = pendingCommandOrigin.current === "agent";
    pendingCommandOrigin.current = null;
    setPendingCommand(null);
    setView(fromAgent ? "agent" : "terminal");
    const activityId = addActivity("Executando comando", command);
    try {
      const id = crypto.randomUUID();
      if (fromAgent) {
        agentCommandIds.current.add(id);
        const runId = activeRunId.current || crypto.randomUUID();
        activeRunId.current = runId;
        setAgentEvents((current) => [...current, { id: `terminal-${id}`, runId, at: new Date().toISOString(), stage: "execution", type: "tool", title: `Terminal · ${command}`, detail: "Comando aprovado. Aguardando a saída do processo…", state: "running" }]);
      }
      setTerminalEntries((current) => [...current, { id, command, output: "", errorOutput: "", running: true }]);
      await window.dama.startCommand(command, id);
      finishActivity(activityId, "Processo iniciado");
    } catch (cause) {
      finishActivity(activityId, cause instanceof Error ? cause.message : String(cause), "error");
    }
  }

  async function sendChat(event: FormEvent) {
    event.preventDefault();
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    if (!modelsState.models.length) { setConnectorDialog(true); return; }
    if (!activeConversationId) {
      setActiveConversationId(crypto.randomUUID());
      setConversationCreatedAt(new Date().toISOString());
      setConversationKind("chat");
    } else if (!agentMessages.length && !agentPlans.length) {
      setConversationKind("chat");
    }
    const nextMessages: ChatMessage[] = [...chatMessages, { role: "user", content: text }];
    setChatMessages(nextMessages);
    setChatInput("");
    setChatBusy(true);
    setError(null);
    try {
      const response = await window.dama!.chat({ messages: nextMessages.map(({ role, content }) => ({ role, content })), modelId: selectedModelId, reasoning });
      setChatMessages((current) => [...current, { role: "assistant", content: response.content, model: response.model }]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setChatBusy(false); }
  }

  async function startPreview() {
    if (!window.dama || !project) return;
    try {
      setPreviewError(null);
      setPreview(await window.dama.startPreview());
    } catch (cause) { setPreviewError(cause instanceof Error ? cause.message : String(cause)); }
  }

  async function stopPreview() {
    if (!window.dama) return;
    setPreview(await window.dama.stopPreview());
  }

  const sideTitle = view === "editor" ? "Explorador" : view === "notes" ? "Notas" : view === "search" ? "Busca" : view === "git" ? "Alterações" : "Projeto";

  const updateVisible = updateState && ["available", "downloading", "downloaded", "installing"].includes(updateState.status) && (updateState.automatic || dismissedUpdate !== updateState.version || updateState.status !== "available");
  if (startupReady && updateVisible) return <UpdateScreen state={updateState} onDismiss={() => setDismissedUpdate(updateState.version)} onDownload={() => void window.dama?.downloadUpdate()} onInstall={() => void window.dama?.installUpdate()} />;
  if (!startupReady || (startupSplashVisible && !startupSplashDone)) {
    if (!startupSplashVisible) return <div className="app-loading-blank" />;
    return <DamaSplash ready={startupReady} onExited={() => setStartupSplashDone(true)} />;
  }
  if (entryTransition) return <DamaSplash ready={entryReady} onExited={() => { setEntryTransition(false); setEntryReady(false); }} />;
  if (!settings) return <div className="app-loading-blank" />;
  if (!settings.onboardingCompleted) return <Onboarding initial={settings} onComplete={finishOnboarding} onLanguageChange={setInterfaceLanguageOverride} />;

  return (
    <div className={`app-shell ${contextOpen ? "context-visible" : ""} density-${settings.appearance.density} accent-${settings.appearance.accent} surface-${settings.appearance.surface} ${settings.appearance.motion ? "" : "motion-off"}`}>
      <header className="topbar">
        <div className="brand"><DinoLogo animated /><strong>DAMA</strong><span>desktop preview</span></div>
        <button className="project-switcher" onClick={() => setWorkspaceManagerOpen((value) => !value)} aria-expanded={workspaceManagerOpen}><FolderOpen className={project ? "project-status-icon live" : "project-status-icon"} size={14} /><span>{projectName}</span><ChevronDown size={13} /></button>
        <div className="workspace-tabs">
          {(["chat", "agent", "editor", "notes", "preview", "terminal"] as View[]).map((id) => {
            const item = viewItems.find((entry) => entry.id === id)!;
            return <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}>{item.label}</button>;
          })}
        </div>
        <div className="top-actions">
          <div className={`header-model-switcher ${activeModel ? "connected" : ""}`}><CircleDot size={13} /><select value={selectedModelId || ""} onChange={(event) => activateModel(event.target.value)} disabled={!modelsState.models.length}><option value="">{modelsState.models.length ? "Escolher modelo" : "Sem modelo"}</option>{modelsState.models.map((model) => <option key={model.id} value={model.id}>{model.model}</option>)}</select><button onClick={() => setConnectorDialog(true)} title="Adicionar modelo"><Plus size={13} /></button></div>
          <button className="icon-button" onClick={() => setContextOpen((value) => !value)}>{contextOpen ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}</button>
          <button className="avatar" onClick={() => setSettingsOpen(true)}>{settings.profile.name.slice(0, 1).toUpperCase() || "D"}</button>
        </div>
      </header>

      {workspaceManagerOpen && <WorkspaceManager index={workspaceIndex} activeProjectPath={project?.path || null} activeConversationId={activeConversationId} onClose={() => setWorkspaceManagerOpen(false)} onOpenFolder={openProject} onNewConversation={createConversation} onSelectProject={switchProject} onSelectConversation={restoreConversation} onDeleteConversation={removeConversation} />}

      <aside className="rail">
        <nav>{viewItems.map((item) => { const Icon = item.icon; return <button key={item.id} data-label={item.label} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><Icon size={18} /></button>; })}</nav>
        <button data-label="Configurações" onClick={() => setSettingsOpen(true)}><Settings2 size={18} /></button>
      </aside>

      <aside className="sidebar">
        <div className="sidebar-title"><span>{sideTitle}</span><div>{(view === "agent" || view === "chat") && <button className="icon-button" title="Nova conversa" onClick={() => void createConversation(view)}><Plus size={13} /></button>}{project && <button className="icon-button" title="Atualizar projeto" onClick={async () => { if (window.dama) setProject(await window.dama.refreshProject()); }}><RefreshCw size={13} /></button>}</div></div>
        {project ? (
          view === "search" ? (
            <div className="sidebar-search-summary"><span>{searchResults.length}</span><small>ocorrências</small></div>
          ) : view === "git" ? (
            <div className="change-list">
              {git.changes.length ? git.changes.map((change) => <button key={`${change.status}-${change.path}`} onClick={() => selectFile(change.path)}><span className={`git-status status-${change.status[0]}`}>{change.status}</span><span>{change.path}</span></button>) : <p>Nenhuma alteração local.</p>}
            </div>
          ) : view === "notes" ? <NotesSidebar nodes={project.files} selected={openFile?.path} onOpen={selectNote} onCreate={createNote} /> : <FileTree nodes={project.files} selected={openFile?.path} onOpen={selectFile} />
        ) : (
          <div className="honest-empty"><FolderOpen size={22} /><strong>Nenhum projeto aberto</strong><p>Escolha uma pasta local para ativar as ferramentas.</p><button onClick={openProject}>Abrir pasta</button></div>
        )}
        <div className="sidebar-footer">
          <span className="eyebrow">Workspace</span>
          <strong>{project?.name || "Sem projeto"}</strong>
          <small>{project?.path || "A Dama não acessou seus arquivos"}</small>
          {git.repository && <div className="branch"><GitBranch size={11} /> {git.branch}</div>}
        </div>
      </aside>

      <main className="workspace">
        {error && <div className="error-banner"><AlertCircle size={15} /><span>{error}</span><button onClick={() => setError(null)}><X size={14} /></button></div>}
        <ViewBoundary resetKey={`${view}-${phase}`}><div className="view-stage" key={view}>
          {view === "chat" && <ChatView messages={chatMessages} input={chatInput} setInput={setChatInput} busy={chatBusy} onSubmit={sendChat} models={modelsState.models} selectedModelId={selectedModelId} onModelChange={activateModel} reasoning={reasoning} onReasoningChange={setReasoning} project={project} onOpenFile={selectFile} />}
          {view === "agent" && (
            <AgentView
              project={project}
              connector={connector}
              prompt={prompt}
              setPrompt={setPrompt}
              phase={phase}
              events={agentEvents}
              approvals={toolApprovals}
              messages={agentMessages}
              plans={agentPlans}
              onSubmit={createPlan}
              onApprove={approvePlan}
              onReject={editPlan}
              onOpenProject={openProject}
              onConnect={() => setConnectorDialog(true)}
              onOpenFile={selectFile}
              onRunCommand={(command) => { pendingCommandOrigin.current = "agent"; setPendingCommand(command); }}
              onResolveApproval={resolveToolApproval}
              sendOnEnter={settings.agent.sendOnEnter}
              models={modelsState.models}
              selectedModelId={selectedModelId}
              onModelChange={activateModel}
              teamMode={modelsState.routing.mode === "team"}
              reasoning={reasoning}
              onReasoningChange={setReasoning}
              references={agentReferences}
              onRemoveReference={(key) => setAgentReferences((current) => current.filter((reference) => reference.key !== key))}
            />
          )}
          {view === "changes" && <ChangesView changeSet={changeSet} diff={changeDiff} onSelect={openChangeDiff} onBack={() => setView("agent")} />}
          {view === "editor" && <EditorView file={openFile} line={openFileLine} draft={fileDraft} setDraft={setFileDraft} dirty={isDirty} saving={fileSaving} onSave={saveFile} onOpenProject={openProject} />}
          {view === "notes" && <NotesView project={project} file={openFile?.path.toLowerCase().endsWith(".md") ? openFile : null} draft={fileDraft} setDraft={setFileDraft} dirty={isDirty} saving={fileSaving} onSave={saveFile} onOpenProject={openProject} onOpenNote={selectNote} onCreate={createNote} onImportAsset={importNoteAsset} />}
          {view === "search" && <SearchView project={project} query={searchQuery} setQuery={setSearchQuery} results={searchResults} searching={searching} onSearch={performSearch} onOpen={selectFile} />}
          {view === "git" && <GitView project={project} git={git} onRefresh={refreshGit} onInit={async () => { if (window.dama) setGit(await window.dama.gitInit()); }} onOperation={async (input) => { if (!window.dama) throw new Error("Git exige o aplicativo desktop."); const result = await window.dama.gitOperation(input); setGit(await window.dama.gitSummary()); return result; }} onOpen={selectFile} />}
          {view === "terminal" && <TerminalView project={project} input={terminalInput} setInput={setTerminalInput} entries={terminalEntries} onRequest={(command) => { pendingCommandOrigin.current = "terminal"; setPendingCommand(command); }} onStop={(id) => window.dama?.stopCommand(id)} onClear={() => setTerminalEntries([])} />}
          {view === "preview" && <PreviewView project={project} state={preview} url={previewUrlInput} setUrl={setPreviewUrlInput} error={previewError} onStart={startPreview} onStop={stopPreview} onSendToAgent={(references) => { setAgentReferences(references); setView("agent"); }} />}
        </div></ViewBoundary>
      </main>

      {contextOpen && (
        <aside className="context-panel">
          <section>
            <div className="context-heading"><span>Execução técnica</span><Activity size={14} /></div>
            {technicalEvents.length ? <div className="technical-feed">{technicalEvents.map((item) => { const delta = item.detail.match(/\+(\d+).*?[−-](\d+)/); return <div className={`technical-event ${item.state}`} key={item.id}><span>{item.state === "running" ? <LoaderCircle className="spin" size={11} /> : item.state === "error" ? <X size={11} /> : <Check size={11} />}</span><div><strong>{item.title}</strong><small>{item.detail}</small>{delta && <em><b>+{delta[1]}</b><i>−{delta[2]}</i></em>}</div></div>; })}</div> : <p className="empty-copy">Quando o agente trabalhar, leituras, buscas e edições aparecerão aqui em tempo real.</p>}
          </section>
          {changeSet && <section>
            <div className="context-heading"><span>Alterações do agente</span><Code2 size={14} /></div>
            <div className="change-totals"><strong>{changeSet.files.length} {changeSet.files.length === 1 ? "arquivo" : "arquivos"}</strong><span className="plus">+{changeSet.added}</span><span className="minus">−{changeSet.removed}</span></div>
            <div className="context-change-files">{changeSet.files.map((file) => <button key={file.path} onClick={() => openChangeDiff(file.path)}><FileCode2 size={12} /><span><strong>{file.path}</strong><small><b>+{file.added}</b><i>−{file.removed}</i></small></span><ChevronRight size={12} /></button>)}</div>
          </section>}
          <section>
            <div className="context-heading"><span>Sessão</span><Sparkles size={14} /></div>
            {activity.length ? <div className="activity-list compact">{activity.slice(0, 5).map((item) => <div className="activity-row" key={item.id}><span className={`activity-state ${item.status}`}>{item.status === "running" ? <LoaderCircle className="spin" size={11} /> : item.status === "done" ? <Check size={11} /> : <X size={11} />}</span><div><strong>{item.label}</strong><small>{item.detail}</small></div></div>)}</div> : <p className="empty-copy">Nenhuma operação executada nesta sessão.</p>}
          </section>
          <section>
            <div className="context-heading"><span>Projeto</span><Folder size={14} /></div>
            <dl>
              <div><dt>Branch</dt><dd>{git.branch || "—"}</dd></div>
              <div><dt>Alterações</dt><dd>{git.changes.length}</dd></div>
              <div><dt>Arquivo</dt><dd title={openFile?.path}>{openFile?.path || "—"}</dd></div>
              <div><dt>Preview</dt><dd>{preview.running ? "Rodando" : "Parado"}</dd></div>
            </dl>
          </section>
          <section>
            <div className="context-heading"><span>Segurança</span><ShieldCheck size={14} /></div>
            <p className="empty-copy">Comandos exigem confirmação. Arquivos só podem ser acessados dentro da pasta atual.</p>
          </section>
          <div className="context-spacer" />
          <button className="context-action" onClick={refreshGit}><RefreshCw size={13} /> Atualizar estado</button>
        </aside>
      )}

      {changeSet?.status === "pending" && <div className={`change-review-bar ${view === "agent" ? "above-composer" : ""}`}>
        <button className="change-review-summary" onClick={() => changeSet.files[0] && openChangeDiff(changeSet.files[0].path)}><Code2 size={15} /><span><strong>Revisar alterações</strong><small>{changeSet.files.length} {changeSet.files.length === 1 ? "arquivo" : "arquivos"}</small></span><b>+{changeSet.added}</b><i>−{changeSet.removed}</i></button>
        <span className="change-review-divider" />
        <button className="reject-change" disabled={changeResolving} onClick={rejectAgentChanges}><X size={14} /> Recusar</button>
        <button className="accept-change" disabled={changeResolving} onClick={acceptAgentChanges}>{changeResolving ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />} Aceitar</button>
      </div>}

      {connectorDialog && <ConnectorDialog onClose={() => setConnectorDialog(false)} onSaved={(state) => { setModelsState(state); setSelectedModelId(state.activeModelId); const selected = state.models.find((model) => model.id === state.activeModelId); if (selected) setConnector({ configured: true, model: selected.model, url: selected.url, kind: selected.kind }); }} />}
      {settingsOpen && <SettingsCenter initial={settings} modelsState={modelsState} onModelsChange={(state) => { setModelsState(state); setSelectedModelId(state.activeModelId); }} onClose={() => setSettingsOpen(false)} onSave={saveSettings} onConfigureModel={() => { setSettingsOpen(false); setConnectorDialog(true); }} onResetOnboarding={resetOnboarding} />}
      {pendingCommand && <ApprovalDialog command={pendingCommand} onCancel={() => { pendingCommandOrigin.current = null; setPendingCommand(null); }} onApprove={() => executeCommand(pendingCommand)} />}
    </div>
  );
}

function flattenFiles(nodes: ProjectNode[]): string[] { return nodes.flatMap((node) => node.kind === "file" ? [node.path] : flattenFiles(node.children || [])); }

function useConversationScroll(dependencies: readonly unknown[]) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);
  const initialized = useRef(false);
  useLayoutEffect(() => {
    const firstPositioning = !initialized.current;
    initialized.current = true;
    if (!firstPositioning && !pinnedToBottom.current) return;
    pinnedToBottom.current = true;
    const scroll = () => {
      const element = scrollRef.current;
      if (element) element.scrollTop = element.scrollHeight;
    };
    const frame = window.requestAnimationFrame(scroll);
    const timer = window.setTimeout(scroll, 80);
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(timer); };
  }, dependencies);
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const keepAtBottom = () => {
      if (pinnedToBottom.current) element.scrollTop = element.scrollHeight;
    };
    const observer = new MutationObserver(() => window.requestAnimationFrame(keepAtBottom));
    observer.observe(element, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);
  return {
    scrollRef,
    onScroll: () => {
      const element = scrollRef.current;
      if (element) pinnedToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 72;
    },
  };
}

type FileReference = { path: string; line?: number };

function resolveFileReference(reference: string, projectFiles: string[]): FileReference | null {
  let normalized = reference.trim().replace(/^@/, "");
  try { normalized = decodeURIComponent(normalized); } catch {}
  normalized = normalized.replace(/^file:\/\//i, "").replace(/^\.\//, "").replaceAll("\\", "/");
  let line: number | undefined;
  const lineMatch = normalized.match(/(?::(\d+)|#L(\d+))$/i);
  if (lineMatch) {
    line = Number(lineMatch[1] || lineMatch[2]);
    normalized = normalized.slice(0, lineMatch.index);
  }
  const lower = normalized.toLowerCase();
  const exact = projectFiles.find((file) => file.replaceAll("\\", "/").toLowerCase() === lower);
  if (exact) return { path: exact, line };
  if (!normalized.includes("/")) {
    const matches = projectFiles.filter((file) => file.replaceAll("\\", "/").split("/").at(-1)?.toLowerCase() === lower);
    if (matches.length === 1) return { path: matches[0], line };
  }
  return null;
}

function renderLinkedText(text: string, projectFiles: string[], onOpenFile?: (path: string, line?: number) => void): ReactNode[] {
  const pattern = /@?(?:(?:[\w.@+~-]+[\\/])+[\w.@+~-]+\.[a-z0-9]{1,12}|[\w.@+~-]+\.(?:html?|tsx?|jsx?|json|css|scss|md|py|go|rs|java|php|sql|ya?ml|sh|ps1))(?::\d+)?/gi;
  const output: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index || 0;
    if (index > cursor) output.push(text.slice(cursor, index));
    const reference = resolveFileReference(match[0], projectFiles);
    if (reference && onOpenFile) output.push(<button type="button" className="markdown-file-reference" key={`${index}-${match[0]}`} onClick={() => onOpenFile(reference.path, reference.line)} title={`Abrir ${reference.path}`}>{match[0]}</button>);
    else output.push(match[0]);
    cursor = index + match[0].length;
  }
  if (cursor < text.length) output.push(text.slice(cursor));
  return output;
}

type MarkdownRenderOptions = { imageUrls?: Record<string, string>; onNoteLink?: (target: string) => void };

function renderMarkdownTokens(tokens: Token[], projectFiles: string[], onOpenFile?: (path: string, line?: number) => void, prefix = "md", options: MarkdownRenderOptions = {}): ReactNode[] {
  return tokens.map((token, index) => {
    const key = `${prefix}-${index}-${token.type}`;
    switch (token.type) {
      case "space": return null;
      case "code": {
        const item = token as Tokens.Code;
        return <pre key={key}><code data-language={item.lang || undefined}>{item.text}</code></pre>;
      }
      case "heading": {
        const item = token as Tokens.Heading;
        return createElement(`h${Math.min(6, Math.max(1, item.depth))}`, { key }, renderMarkdownTokens(item.tokens, projectFiles, onOpenFile, key, options));
      }
      case "hr": return <hr key={key} />;
      case "blockquote": return <blockquote key={key}>{renderMarkdownTokens((token as Tokens.Blockquote).tokens, projectFiles, onOpenFile, key, options)}</blockquote>;
      case "list": {
        const item = token as Tokens.List;
        const Tag = item.ordered ? "ol" : "ul";
        return <Tag key={key} start={item.ordered && typeof item.start === "number" ? item.start : undefined}>{item.items.map((listItem, itemIndex) => <li key={`${key}-${itemIndex}`}>{listItem.task && <input type="checkbox" checked={Boolean(listItem.checked)} readOnly aria-label="Item da tarefa" />}{renderMarkdownTokens(listItem.tokens, projectFiles, onOpenFile, `${key}-${itemIndex}`, options)}</li>)}</Tag>;
      }
      case "table": {
        const item = token as Tokens.Table;
        return <div className="markdown-table-wrap" key={key}><table><thead><tr>{item.header.map((cell, cellIndex) => <th key={`${key}-h-${cellIndex}`} style={{ textAlign: cell.align || undefined }}>{renderMarkdownTokens(cell.tokens, projectFiles, onOpenFile, `${key}-h-${cellIndex}`, options)}</th>)}</tr></thead><tbody>{item.rows.map((row, rowIndex) => <tr key={`${key}-r-${rowIndex}`}>{row.map((cell, cellIndex) => <td key={`${key}-${rowIndex}-${cellIndex}`} style={{ textAlign: cell.align || undefined }}>{renderMarkdownTokens(cell.tokens, projectFiles, onOpenFile, `${key}-${rowIndex}-${cellIndex}`, options)}</td>)}</tr>)}</tbody></table></div>;
      }
      case "paragraph": return <p key={key}>{renderMarkdownTokens((token as Tokens.Paragraph).tokens, projectFiles, onOpenFile, key, options)}</p>;
      case "strong": return <strong key={key}>{renderMarkdownTokens((token as Tokens.Strong).tokens, projectFiles, onOpenFile, key, options)}</strong>;
      case "em": return <em key={key}>{renderMarkdownTokens((token as Tokens.Em).tokens, projectFiles, onOpenFile, key, options)}</em>;
      case "del": return <del key={key}>{renderMarkdownTokens((token as Tokens.Del).tokens, projectFiles, onOpenFile, key, options)}</del>;
      case "codespan": {
        const item = token as Tokens.Codespan;
        const reference = resolveFileReference(item.text, projectFiles);
        return reference && onOpenFile
          ? <button type="button" className="markdown-file-reference code" key={key} onClick={() => onOpenFile(reference.path, reference.line)} title={`Abrir ${reference.path}`}><code>{item.text}</code></button>
          : <code key={key}>{item.text}</code>;
      }
      case "link": {
        const item = token as Tokens.Link;
        if (item.href.startsWith("dama-note:") && options.onNoteLink) return <button type="button" className="markdown-note-link" key={key} onClick={() => options.onNoteLink!(decodeURIComponent(item.href.slice("dama-note:".length)))}><Link2 size={12} />{renderMarkdownTokens(item.tokens, projectFiles, onOpenFile, key, options)}</button>;
        const reference = resolveFileReference(item.href, projectFiles) || resolveFileReference(item.text, projectFiles);
        if (reference && onOpenFile) return <button type="button" className="markdown-file-reference link" key={key} onClick={() => onOpenFile(reference.path, reference.line)} title={`Abrir ${reference.path}`}>{renderMarkdownTokens(item.tokens, projectFiles, onOpenFile, key, options)}</button>;
        if (/^(https?:|mailto:)/i.test(item.href)) return <a key={key} href={item.href} target="_blank" rel="noreferrer">{renderMarkdownTokens(item.tokens, projectFiles, onOpenFile, key, options)}</a>;
        return <span key={key}>{renderMarkdownTokens(item.tokens, projectFiles, onOpenFile, key, options)}</span>;
      }
      case "image": {
        const item = token as Tokens.Image;
        const source = /^https:\/\//i.test(item.href) ? item.href : options.imageUrls?.[item.href];
        return source ? <img key={key} src={source} alt={item.text} title={item.title || undefined} loading="lazy" /> : <span className="markdown-image-loading" key={key}><ImagePlus size={14} />{item.text || "Carregando imagem…"}</span>;
      }
      case "br": return <br key={key} />;
      case "html": return <span key={key}>{(token as Tokens.HTML).text}</span>;
      case "escape": return <span key={key}>{(token as Tokens.Escape).text}</span>;
      case "text": {
        const item = token as Tokens.Text;
        return <span key={key}>{item.tokens?.length ? renderMarkdownTokens(item.tokens, projectFiles, onOpenFile, key, options) : renderLinkedText(item.text, projectFiles, onOpenFile)}</span>;
      }
      default: {
        const generic = token as Tokens.Generic;
        return generic.tokens?.length ? <span key={key}>{renderMarkdownTokens(generic.tokens, projectFiles, onOpenFile, key, options)}</span> : <span key={key}>{"text" in generic ? String(generic.text) : generic.raw}</span>;
      }
    }
  });
}

function MarkdownContent({ content, projectFiles, onOpenFile, className = "" }: { content: string; projectFiles: string[]; onOpenFile?: (path: string, line?: number) => void; className?: string }) {
  const tokens = useMemo(() => marked.lexer(content, { gfm: true, breaks: true }), [content]);
  return <div className={`markdown-body ${className}`.trim()}>{renderMarkdownTokens(tokens, projectFiles, onOpenFile)}</div>;
}

function WorkspaceManager({ index, activeProjectPath, activeConversationId, onClose, onOpenFolder, onNewConversation, onSelectProject, onSelectConversation, onDeleteConversation }: {
  index: WorkspaceIndex;
  activeProjectPath: string | null;
  activeConversationId: string | null;
  onClose: () => void;
  onOpenFolder: () => void;
  onNewConversation: (kind: ConversationKind) => Promise<void>;
  onSelectProject: (path: string) => Promise<void>;
  onSelectConversation: (id: string) => Promise<void>;
  onDeleteConversation: (id: string) => Promise<void>;
}) {
  const looseChats = index.conversations.filter((item) => item.projectPath === "__projectless__");
  return <>
    <button className="workspace-manager-backdrop" aria-label="Fechar projetos e conversas" onClick={onClose} />
    <section className="workspace-manager" aria-label="Projetos e conversas">
      <header><div><strong>Projetos e conversas</strong><small>Histórico salvo somente neste computador</small></div><button className="icon-button" onClick={onClose}><X size={14} /></button></header>
      <div className="workspace-manager-actions"><button onClick={() => void onNewConversation("agent")}><Sparkles size={14} /> Novo agente</button><button onClick={() => void onNewConversation("chat")}><MessageSquareText size={14} /> Novo chat</button><button onClick={onOpenFolder}><FolderOpen size={14} /> Abrir pasta</button></div>
      <div className="workspace-manager-list">
        {looseChats.length > 0 && <WorkspaceConversationGroup title="Sem projeto" conversations={looseChats} activeConversationId={activeConversationId} onSelectConversation={onSelectConversation} onDeleteConversation={onDeleteConversation} />}
        {index.projects.map((savedProject) => {
          const conversations = index.conversations.filter((item) => item.projectPath.toLowerCase() === savedProject.path.toLowerCase());
          return <div className={`workspace-project ${activeProjectPath?.toLowerCase() === savedProject.path.toLowerCase() ? "active" : ""}`} key={savedProject.id}>
            <button className="workspace-project-title" onClick={() => void onSelectProject(savedProject.path)}><Folder size={14} /><span><strong>{savedProject.name}</strong><small>{savedProject.path}</small></span><ChevronRight size={13} /></button>
            {conversations.length > 0 ? <WorkspaceConversationGroup conversations={conversations} activeConversationId={activeConversationId} onSelectConversation={onSelectConversation} onDeleteConversation={onDeleteConversation} /> : <p className="workspace-no-chats">Nenhuma conversa salva</p>}
          </div>;
        })}
        {!index.projects.length && !looseChats.length && <div className="workspace-manager-empty"><FolderOpen size={22} /><p>Seus projetos e chats salvos aparecerão aqui.</p></div>}
      </div>
    </section>
  </>;
}

function WorkspaceConversationGroup({ title, conversations, activeConversationId, onSelectConversation, onDeleteConversation }: {
  title?: string;
  conversations: ConversationMeta[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => Promise<void>;
  onDeleteConversation: (id: string) => Promise<void>;
}) {
  return <div className="workspace-conversations">{title && <span className="workspace-group-title">{title}</span>}{conversations.map((conversation) => <div className={activeConversationId === conversation.id ? "active" : ""} key={conversation.id}><button onClick={() => void onSelectConversation(conversation.id)}>{conversation.kind === "agent" ? <Sparkles size={12} /> : <MessageSquareText size={12} />}<span><strong>{conversation.title}</strong><small>{new Date(conversation.updatedAt).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</small></span></button><button className="delete-chat" title="Excluir conversa" onClick={() => void onDeleteConversation(conversation.id)}><Trash2 size={11} /></button></div>)}</div>;
}

function ChatView({ messages, input, setInput, busy, onSubmit, models, selectedModelId, onModelChange, reasoning, onReasoningChange, project, onOpenFile }: {
  messages: ChatMessage[]; input: string; setInput: (value: string) => void; busy: boolean; onSubmit: (event: FormEvent) => void;
  models: ModelProfile[]; selectedModelId: string | null; onModelChange: (id: string) => void; reasoning: string; onReasoningChange: (value: string) => void; project: OpenProject | null; onOpenFile: (path: string, line?: number) => void;
}) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const { scrollRef, onScroll } = useConversationScroll([messages.length, busy]);
  const projectFiles = useMemo(() => project ? flattenFiles(project.files) : [], [project]);
  const token = input.match(/(?:^|\s)([/@][^\s]*)$/)?.[1] || "";
  const commands = [
    { value: "/explicar ", label: "/explicar", detail: "Explicar um conceito ou trecho" },
    { value: "/revisar ", label: "/revisar", detail: "Revisar uma ideia ou código" },
    { value: "/resumir ", label: "/resumir", detail: "Gerar um resumo objetivo" },
    { value: "/planejar ", label: "/planejar", detail: "Organizar uma abordagem sem editar" },
  ];
  const files = project ? flattenFiles(project.files).filter((path) => path.toLowerCase().includes(token.slice(1).toLowerCase())).slice(0, 8) : [];
  function applySuggestion(value: string) { setInput(input.replace(/[/@][^\s]*$/, value)); }
  async function copyMessage(content: string, index: number) {
    if (window.dama) await window.dama.copyText(content);
    else await navigator.clipboard.writeText(content);
    setCopiedIndex(index);
    window.setTimeout(() => setCopiedIndex((current) => current === index ? null : current), 1400);
  }
  return <div className="chat-view"><div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
    {!messages.length ? <div className="chat-welcome"><DinoLogo animated /><span className="eyebrow">Chat</span><h1>Converse com a Dama.</h1><p>Sem projeto obrigatório, sem plano automático. Apenas uma conversa direta com o modelo escolhido.</p></div> : <div className="chat-thread">{messages.map((message, index) => <article key={index} className={`chat-message ${message.role}`}><div className="chat-author"><span>{message.role === "user" ? "Você" : "Dama"}</span>{message.role === "assistant" && <button className="copy-message" onClick={() => copyMessage(message.content, index)} title="Copiar resposta" aria-label="Copiar resposta">{copiedIndex === index ? <Check size={13} /> : <Copy size={13} />}</button>}</div><MarkdownContent content={message.content} projectFiles={projectFiles} onOpenFile={onOpenFile} />{message.model && <small>{message.model}</small>}</article>)}{busy && <div className="chat-thinking"><LoaderCircle className="spin" size={14} /> Pensando…</div>}</div>}
  </div><form className="composer chat-composer" onSubmit={onSubmit}>
    {(token.startsWith("/") || token.startsWith("@")) && <div className="composer-menu">{token.startsWith("/") ? commands.filter((item) => item.label.includes(token)).map((item) => <button type="button" key={item.label} onClick={() => applySuggestion(item.value)}><Command size={13} /><span><strong>{item.label}</strong><small>{item.detail}</small></span></button>) : files.length ? files.map((file) => <button type="button" key={file} onClick={() => applySuggestion(`@${file} `)}><File size={13} /><span><strong>{file}</strong><small>Adicionar como referência</small></span></button>) : <div className="menu-empty">{project ? "Nenhum arquivo encontrado" : "Abra um projeto para usar referências @"}</div>}</div>}
    <textarea value={input} onChange={(event) => setInput(event.target.value)} autoFocus placeholder="Pergunte qualquer coisa… Use / para comandos e @ para arquivos" disabled={busy} onKeyDown={(event) => { if (event.nativeEvent.isComposing) return; if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (input.trim()) event.currentTarget.form?.requestSubmit(); } }} />
    <div className="composer-footer"><ModelControls models={models} selectedModelId={selectedModelId} onModelChange={onModelChange} reasoning={reasoning} onReasoningChange={onReasoningChange} /><span className="composer-shortcut">Enter envia · Shift+Enter nova linha</span><button disabled={!input.trim() || busy}><ArrowUp size={15} /></button></div>
  </form></div>;
}

function ModelControls({ models, selectedModelId, onModelChange, reasoning, onReasoningChange, teamMode = false }: { models: ModelProfile[]; selectedModelId: string | null; onModelChange: (id: string) => void; reasoning: string; onReasoningChange: (value: string) => void; teamMode?: boolean }) {
  return <div className="composer-controls">
    {teamMode ? <span className="control-chip model-chip has-value team-chip" title="Equipe configurada nas preferências de Modelos"><Sparkles size={13} /><span>Equipe configurada</span></span> : <label className={`control-chip model-chip ${selectedModelId ? "has-value" : ""}`} title="Modelo"><Cpu size={13} /><select aria-label="Modelo da conversa" value={selectedModelId || ""} onChange={(event) => onModelChange(event.target.value)}><option value="">Modelo</option>{models.map((model) => <option key={model.id} value={model.id} disabled={model.available === false}>{model.model}</option>)}</select><ChevronDown className="control-chevron" size={11} /></label>}
    <label className="control-chip reasoning-chip" title="Nível de raciocínio"><Gauge size={13} /><select aria-label="Nível de raciocínio" value={reasoning} onChange={(event) => onReasoningChange(event.target.value)}><option value="low">Baixo</option><option value="medium">Médio</option><option value="high">Alto</option><option value="max">Máximo</option></select><ChevronDown className="control-chevron" size={11} /></label>
  </div>;
}

function AgentView(props: {
  project: OpenProject | null; connector: ConnectorState; prompt: string; setPrompt: (value: string) => void;
  phase: TaskPhase; events: AgentProgressEvent[]; approvals: ToolApprovalRequest[]; messages: AgentThreadMessage[]; plans: AgentPlanRecord[];
  onSubmit: (event: FormEvent) => void; onApprove: (planId: string) => void; onReject: (planId: string) => void; onOpenProject: () => void;
  onConnect: () => void; onOpenFile: (path: string) => void; onRunCommand: (command: string) => void; sendOnEnter: boolean;
  onResolveApproval: (id: string, decision: ToolApprovalDecision) => void;
  models: ModelProfile[]; selectedModelId: string | null; onModelChange: (id: string) => void; reasoning: string; onReasoningChange: (value: string) => void;
  teamMode: boolean;
  references: PreviewElementReference[]; onRemoveReference: (key: string) => void;
}) {
  const busy = props.phase === "planning" || props.phase === "executing";
  const { scrollRef, onScroll } = useConversationScroll([props.messages.length, props.plans.length, props.events.length, props.approvals.length, props.approvals.at(-1)?.status, props.events.at(-1)?.detail, props.phase]);
  const token = props.prompt.match(/(?:^|\s)([/@][^\s]*)$/)?.[1] || "";
  const commands = [
    { value: "/planejar ", label: "/planejar", detail: "Criar um plano sem implementar ainda" },
    { value: "/implementar ", label: "/implementar", detail: "Implementar direto quando for simples" },
    { value: "/revisar ", label: "/revisar", detail: "Revisar arquitetura, código ou ideia" },
    { value: "/corrigir ", label: "/corrigir", detail: "Diagnosticar e preparar uma correção" },
  ];
  const files = props.project ? flattenFiles(props.project.files).filter((path) => path.toLowerCase().includes(token.slice(1).toLowerCase())).slice(0, 8) : [];
  const projectFiles = useMemo(() => props.project ? flattenFiles(props.project.files) : [], [props.project]);
  const feed = useMemo(() => {
    const ordered: AgentFeedEntry[] = [
      ...props.messages.map((item) => ({ kind: "message" as const, id: item.id, at: item.at, item })),
      ...props.events.map((item) => ({ kind: "event" as const, id: item.id, at: item.at, item })),
      ...props.approvals.map((item) => ({ kind: "approval" as const, id: item.id, at: item.at, item })),
      ...props.plans.map((item) => ({ kind: "plan" as const, id: item.id, at: item.at, item })),
    ].sort((a, b) => a.at.localeCompare(b.at));
    const grouped: AgentFeedEntry[] = [];
    for (const entry of ordered) {
      if (entry.kind === "event" && entry.item.type !== "message" && entry.item.type !== "commentary" && entry.item.type !== "error") {
        const previous = grouped.at(-1);
        if (previous?.kind === "activity") previous.items.push(entry.item);
        else grouped.push({ kind: "activity", id: `activity-${entry.id}`, at: entry.at, items: [entry.item] });
      } else grouped.push(entry);
    }
    return grouped;
  }, [props.messages, props.events, props.plans, props.approvals]);
  const latestNarrativeId = [...feed].reverse().find((entry) => entry.kind === "message" && entry.item.role === "assistant" || entry.kind === "event" && (entry.item.type === "message" || entry.item.type === "commentary"))?.id;
  function applySuggestion(value: string) { props.setPrompt(props.prompt.replace(/[/@][^\s]*$/, value)); }
  return (
    <div className="agent-view">
      <div className="agent-content" ref={scrollRef} onScroll={onScroll}>
        {!feed.length ? (
          <div className="agent-welcome">
            <DinoLogo animated title="Dama" />
            <span className="eyebrow">Dama workspace</span>
            <h1>Pense no resultado.<br /><em>A Dama organiza o caminho.</em></h1>
            <p>Converse, ajuste o plano durante o trabalho e acompanhe cada leitura, edição e comando no contexto deste projeto.</p>
            <div className="start-actions">
              {!props.project && <button onClick={props.onOpenProject}><FolderOpen size={17} /><span><strong>Abrir um projeto</strong><small>Selecione uma pasta local</small></span><ChevronRight size={14} /></button>}
              {!props.connector.configured && <button onClick={props.onConnect}><Bot size={17} /><span><strong>Conectar um modelo</strong><small>API direta ou servidor local</small></span><ChevronRight size={14} /></button>}
            </div>
          </div>
        ) : (
          <div className="agent-thread" aria-live="polite">
            {feed.map((entry) => {
              if (entry.kind === "message") return entry.item.role === "user"
                ? <article className="agent-user-message" key={entry.id}><span>Você</span><MarkdownContent content={entry.item.content} projectFiles={projectFiles} onOpenFile={props.onOpenFile} /></article>
                : <AgentAssistantMessage key={entry.id} content={entry.item.content} typing={entry.id === latestNarrativeId} projectFiles={projectFiles} onOpenFile={props.onOpenFile} />;
              if (entry.kind === "plan") return <PlanReview key={entry.id} plan={entry.item.plan} phase={entry.item.status} result={entry.item.result} onApprove={() => props.onApprove(entry.item.id)} onReject={() => props.onReject(entry.item.id)} onOpenFile={props.onOpenFile} onRunCommand={props.onRunCommand} />;
              if (entry.kind === "approval") return <ToolApprovalCard key={entry.id} request={entry.item} onResolve={(decision) => props.onResolveApproval(entry.item.id, decision)} />;
              if (entry.kind === "activity") return <AgentActivitySummary key={entry.id} events={entry.items} />;
              if (entry.item.type === "message" || entry.item.type === "commentary" || entry.item.type === "error") return <AgentAssistantMessage key={entry.id} content={entry.item.detail} label={entry.item.type === "error" ? entry.item.title : "Dama"} error={entry.item.type === "error"} typing={entry.id === latestNarrativeId} projectFiles={projectFiles} onOpenFile={props.onOpenFile} />;
              return null;
            })}
          </div>
        )}
      </div>
      <form className="composer" onSubmit={props.onSubmit}>
        {(token.startsWith("/") || token.startsWith("@")) && <div className="composer-menu">{token.startsWith("/") ? commands.filter((item) => item.label.includes(token)).map((item) => <button type="button" key={item.label} onClick={() => applySuggestion(item.value)}><Command size={13} /><span><strong>{item.label}</strong><small>{item.detail}</small></span></button>) : files.length ? files.map((file) => <button type="button" key={file} onClick={() => applySuggestion(`@${file} `)}><File size={13} /><span><strong>{file}</strong><small>Incluir no pedido do agente</small></span></button>) : <div className="menu-empty">{props.project ? "Nenhum arquivo encontrado" : "O workspace será criado antes; use @ depois que ele existir"}</div>}</div>}
        {props.references.length > 0 && <div className="composer-references"><span><CircleDot size={12} /> Elementos do Preview</span><div>{props.references.map((reference) => <button type="button" key={reference.key} title={reference.path ? `${reference.path}:${reference.startLine || "?"}` : reference.selector} onClick={() => props.onRemoveReference(reference.key)}><FileCode2 size={12} /><span>{reference.path || reference.label}{reference.startLine ? ` · L${reference.startLine}${reference.endLine && reference.endLine !== reference.startLine ? `–${reference.endLine}` : ""}` : ""}</span><X size={11} /></button>)}</div></div>}
        <textarea value={props.prompt} onChange={(event) => props.setPrompt(event.target.value)} placeholder={busy ? "Envie uma orientação enquanto a Dama trabalha…" : props.project ? "Continue a conversa sobre este projeto…" : "Descreva o que você quer construir…"} onKeyDown={(event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Enter" && !event.shiftKey && props.sendOnEnter) {
            event.preventDefault();
            if (props.prompt.trim()) event.currentTarget.form?.requestSubmit();
          }
        }} />
        <div className="composer-footer"><ModelControls models={props.models} selectedModelId={props.selectedModelId} onModelChange={props.onModelChange} teamMode={props.teamMode} reasoning={props.reasoning} onReasoningChange={props.onReasoningChange} /><span className="composer-shortcut">{props.project ? props.project.name : "Pergunte ou descreva um novo projeto"}</span><span className="composer-mode"><Sparkles size={13} /> {busy ? "Orientar execução" : props.phase === "review" ? "Ajustar plano" : "Chat agente"}</span><button disabled={!props.prompt.trim()}><ArrowUp size={15} /></button></div>
      </form>
    </div>
  );
}

function AgentAssistantMessage({ content, label = "Dama", typing = false, error = false, projectFiles, onOpenFile }: { content: string; label?: string; typing?: boolean; error?: boolean; projectFiles: string[]; onOpenFile: (path: string, line?: number) => void }) {
  return <article className={`agent-assistant-message ${error ? "error" : ""}`}><DinoLogo animated /><div><span>{label}</span><TypingText text={content} enabled={typing} projectFiles={projectFiles} onOpenFile={onOpenFile} /></div></article>;
}

function ToolApprovalCard({ request, onResolve }: { request: ToolApprovalRequest; onResolve: (decision: ToolApprovalDecision) => void }) {
  const [scope, setScope] = useState<ToolApprovalDecision>("once");
  const pending = !request.status || request.status === "pending";
  const decisionLabels: Record<ToolApprovalDecision, string> = { deny: "Negado", once: "Permitido uma vez", chat: "Permitido sempre neste chat", project: "Permitido sempre neste projeto", global: "Este comando foi permitido em todos os chats" };
  return <section className={`tool-approval-card ${pending ? "pending" : request.status}`}>
    <header><span className="approval-icon"><ShieldCheck size={16} /></span><div><span className="eyebrow">Autorização necessária</span><strong>{request.title}</strong></div><em>{request.tool}</em></header>
    <pre>{request.detail}</pre>
    <p><AlertCircle size={13} />{request.risk}</p>
    {pending ? <footer>
      <button className="approval-deny" onClick={() => onResolve("deny")}><X size={13} /> Negar</button>
      <label><select aria-label="Escopo da autorização" value={scope} onChange={(event) => setScope(event.target.value as ToolApprovalDecision)}><option value="once">Permitir uma vez</option><option value="chat">Permitir sempre neste chat</option>{request.projectPath && <option value="project">Permitir sempre neste projeto</option>}<option value="global">Sempre permitir este comando</option></select><ChevronDown size={11} /></label>
      <button className="approval-allow" onClick={() => onResolve(scope)}><Check size={13} /> Permitir</button>
    </footer> : <footer className="approval-resolved"><span>{request.status === "denied" ? <X size={13} /> : <Check size={13} />}{decisionLabels[request.decision || (request.status === "denied" ? "deny" : "once")]}</span></footer>}
  </section>;
}

function TypingText({ text, enabled, projectFiles, onOpenFile }: { text: string; enabled: boolean; projectFiles: string[]; onOpenFile: (path: string, line?: number) => void }) {
  const [visible, setVisible] = useState(enabled ? "" : text);
  useEffect(() => {
    if (!enabled) { setVisible(text); return; }
    let position = 0;
    setVisible("");
    const step = Math.max(1, Math.ceil(text.length / 90));
    const timer = window.setInterval(() => {
      position = Math.min(text.length, position + step);
      setVisible(text.slice(0, position));
      if (position >= text.length) window.clearInterval(timer);
    }, 14);
    return () => window.clearInterval(timer);
  }, [text, enabled]);
  return <div className="typing-markdown"><MarkdownContent content={visible} projectFiles={projectFiles} onOpenFile={onOpenFile} />{visible.length < text.length && <span className="typing-cursor" aria-hidden="true" />}</div>;
}

function AgentActivitySummary({ events }: { events: AgentProgressEvent[] }) {
  const running = events.some((event) => event.state === "running");
  const tools = events.filter((event) => event.type === "tool");
  const edited = tools.some((event) => /^(Editando|Criando|Aplicando|Copiando|Movendo|Renomeando|Excluindo|Baixando)\b/i.test(event.title));
  const commands = tools.some((event) => /^(Terminal|Executando|Instalando|Usando|Iniciando)\b/i.test(event.title));
  const searched = tools.some((event) => /^(Buscando|Pesquisando|Recuperando)\b/i.test(event.title));
  const inspected = tools.some((event) => /^(Lendo|Listando|Consultando|Revisando|Mapeando|Detectando|Verificando|Analisando)\b/i.test(event.title));
  const parts = [edited && "Editou arquivos", commands && "executou comandos", searched && "pesquisou no projeto", inspected && !searched && "consultou o projeto"].filter(Boolean) as string[];
  let label = parts.length ? parts.join(parts.length > 1 ? " e " : "") : events.some((event) => event.stage === "planning") ? "Analisou o pedido e o projeto" : "Preparou a próxima etapa";
  if (running) label = tools.at(-1)?.title || events.at(-1)?.title || "Trabalhando";
  return <details className={`agent-activity-summary ${running ? "running" : ""}`} open={running || undefined}>
    <summary>{running ? <LoaderCircle className="spin" size={13} /> : <Check size={13} />}<span>{label}</span><ChevronRight size={13} /></summary>
    <div>{events.map((event) => <div className="agent-activity-detail" key={event.id}><span>{event.state === "running" ? <LoaderCircle className="spin" size={12} /> : <Check size={12} />}</span><p><strong>{event.title}</strong>{event.detail && <small>{event.detail}</small>}</p></div>)}</div>
  </details>;
}

function PlanReview({ plan, phase, result, onApprove, onReject, onOpenFile, onRunCommand }: { plan: Plan; phase: AgentPlanStatus; result: AgentResult | null; onApprove: () => void; onReject: () => void; onOpenFile: (path: string) => void; onRunCommand: (command: string) => void }) {
  const stateLabel = phase === "review" ? "Aguardando aprovação" : phase === "editing" ? "Editando este plano" : phase === "executing" ? "Executando" : phase === "done" ? "Concluído" : phase === "rejected" ? "Ajuste solicitado" : phase === "superseded" ? "Substituído" : phase === "error" ? "Interrompido" : phase;
  return (
    <section className="plan-card">
      <header><div><span className="eyebrow">Plano proposto</span><h2>{plan.title}</h2><p>{plan.summary}</p></div><span className={`plan-state ${phase}`}>{stateLabel}</span></header>
      <ol className="plan-steps">{plan.steps.map((step, index) => <li key={`${step.title}-${index}`}><span>{index + 1}</span><div><strong>{step.title}</strong><p>{step.detail}</p>{step.files?.length ? <div className="file-chips">{step.files.map((file) => <button key={file} onClick={() => onOpenFile(file)}>{file}</button>)}</div> : null}</div></li>)}</ol>
      {plan.risks?.length ? <div className="risk-box"><AlertCircle size={15} /><div><strong>Pontos de atenção</strong>{plan.risks.map((risk) => <p key={risk}>{risk}</p>)}</div></div> : null}
      {phase === "review" && <footer><button className="quiet-button" onClick={onReject}>Editar plano</button><button className="primary-button" onClick={onApprove}><Check size={14} /> Aprovar e implementar</button></footer>}
      {result && <div className="result-block"><div className="result-title"><CheckCircle2 size={17} /><strong>Implementação concluída</strong></div><p>{result.summary}</p>{result.changedFiles.length ? <div className="changed-files">{result.changedFiles.map((file) => <button key={file} onClick={() => onOpenFile(file)}><FileCode2 size={13} />{file}</button>)}</div> : null}</div>}
      {phase === "done" && plan.commands?.length ? <div className="command-proposals"><span className="eyebrow">Comandos sugeridos</span>{plan.commands.map((item) => <div key={item.command}><code>{item.command}</code><p>{item.reason}</p><button onClick={() => onRunCommand(item.command)}><Play size={12} /> Revisar e executar</button></div>)}</div> : null}
    </section>
  );
}

function ChangesView({ changeSet, diff, onSelect, onBack }: { changeSet: ChangeSetSummary | null; diff: ChangeDiff | null; onSelect: (path: string) => void; onBack: () => void }) {
  if (!changeSet) return <CenteredEmpty icon={<Code2 size={25} />} title="Nenhuma alteração para revisar" text="As alterações produzidas pelo agente aparecerão aqui depois de uma execução." />;
  return <div className="changes-view">
    <header className="changes-toolbar"><button onClick={onBack}><ArrowLeft size={14} /> Agente</button><div><Code2 size={14} /><span>{diff?.path || "Alterações do agente"}</span></div><p><b>+{changeSet.added}</b><i>−{changeSet.removed}</i></p></header>
    <div className="changes-layout">
      <aside><span className="eyebrow">Arquivos alterados</span>{changeSet.files.map((file) => <button className={diff?.path === file.path ? "active" : ""} key={file.path} onClick={() => onSelect(file.path)}><FileCode2 size={13} /><span><strong>{file.path}</strong><small>{file.created ? "novo · " : ""}<b>+{file.added}</b> <i>−{file.removed}</i></small></span></button>)}</aside>
      <main>{diff ? <div className="diff-viewer" role="table" aria-label={`Alterações em ${diff.path}`}>{diff.lines.map((line, index) => line.kind === "skip" ? <div className="diff-skip" key={`skip-${index}`}>⋯ linhas sem alteração ⋯</div> : <div className={`diff-line ${line.kind}`} role="row" key={`${line.kind}-${line.oldLine}-${line.newLine}-${index}`}><span className="old-line">{line.oldLine ?? ""}</span><span className="new-line">{line.newLine ?? ""}</span><span className="diff-marker">{line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "}</span><code>{line.content || " "}</code></div>)}</div> : <div className="diff-empty"><Code2 size={24} /><strong>Escolha um arquivo</strong><p>As linhas adicionadas ficarão verdes e as removidas, vermelhas.</p></div>}</main>
    </div>
  </div>;
}

function noteFilesFromTree(nodes: ProjectNode[]) {
  return flattenFiles(nodes).filter((file) => file.toLowerCase().endsWith(".md")).sort((a, b) => a.localeCompare(b));
}

function NotesSidebar({ nodes, selected, onOpen, onCreate }: { nodes: ProjectNode[]; selected?: string; onOpen: (path: string) => void; onCreate: (title: string) => Promise<void> }) {
  const notes = useMemo(() => noteFilesFromTree(nodes), [nodes]);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const visible = notes.filter((file) => file.toLowerCase().includes(query.trim().toLowerCase()));
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    await onCreate(title.trim());
    setTitle("");
    setCreating(false);
  }
  return <div className="notes-sidebar">
    <div className="notes-sidebar-actions"><label><Search size={12} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar notas" /></label><button title="Nova nota" onClick={() => setCreating(true)}><Plus size={13} /></button></div>
    {creating && <form className="new-note-form" onSubmit={submit}><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Título da nota" onKeyDown={(event) => { if (event.key === "Escape") setCreating(false); }} /><button disabled={!title.trim()}><ArrowRight size={13} /></button></form>}
    <div className="notes-list">{visible.map((file) => <button key={file} className={selected === file ? "active" : ""} onClick={() => onOpen(file)}><BookOpen size={13} /><span><strong>{file.split("/").at(-1)?.replace(/\.md$/i, "")}</strong><small>{file}</small></span></button>)}{!visible.length && <p>{query ? "Nenhuma nota encontrada." : "Nenhuma nota ainda."}</p>}</div>
  </div>;
}

function resolveNotePath(notePath: string, reference: string) {
  let decoded = reference.split(/[?#]/)[0];
  try { decoded = decodeURIComponent(decoded); } catch {}
  const parts = decoded.startsWith("/") ? [] : notePath.replaceAll("\\", "/").split("/").slice(0, -1);
  for (const segment of decoded.replaceAll("\\", "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  return parts.join("/");
}

function NoteMarkdownContent({ content, notePath, projectFiles, onOpenNote }: { content: string; notePath: string; projectFiles: string[]; onOpenNote: (target: string) => void }) {
  const wikiContent = useMemo(() => content.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target, label) => `[${String(label || target).trim()}](dama-note:${encodeURIComponent(String(target).trim())})`), [content]);
  const tokens = useMemo(() => marked.lexer(wikiContent, { gfm: true, breaks: true }), [wikiContent]);
  const localImages = useMemo(() => [...wikiContent.matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g)].map((match) => match[1]).filter((href) => !/^(?:https?:|data:)/i.test(href)), [wikiContent]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    setImageUrls({});
    if (!window.dama || !localImages.length) return () => { active = false; };
    void Promise.all([...new Set(localImages)].map(async (href) => {
      try {
        const asset = await window.dama!.readNoteAsset(resolveNotePath(notePath, href));
        return [href, asset.dataUrl] as const;
      } catch { return [href, ""] as const; }
    })).then((entries) => { if (active) setImageUrls(Object.fromEntries(entries)); });
    return () => { active = false; };
  }, [notePath, localImages.join("\n")]);
  return <div className="markdown-body note-markdown">{renderMarkdownTokens(tokens, projectFiles, (path) => onOpenNote(path), "note", { imageUrls, onNoteLink: onOpenNote })}</div>;
}

type NoteMode = "edit" | "split" | "preview";

function NotesView({ project, file, draft, setDraft, dirty, saving, onSave, onOpenProject, onOpenNote, onCreate, onImportAsset }: {
  project: OpenProject | null;
  file: OpenFile | null;
  draft: string;
  setDraft: (value: string) => void;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onOpenProject: () => void;
  onOpenNote: (path: string) => void;
  onCreate: (title: string) => Promise<void>;
  onImportAsset: (notePath: string, file: globalThis.File) => Promise<NoteAsset>;
}) {
  const [mode, setMode] = useState<NoteMode>("split");
  const [newTitle, setNewTitle] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const projectFiles = useMemo(() => project ? flattenFiles(project.files) : [], [project]);
  const notes = useMemo(() => project ? noteFilesFromTree(project.files) : [], [project]);
  const words = useMemo(() => draft.trim() ? draft.trim().split(/\s+/).length : 0, [draft]);
  const imageCount = useMemo(() => (draft.match(/!\[[^\]]*\]\([^)]+\)/g) || []).length, [draft]);

  function insertMarkdown(markdown: string) {
    const editor = editorRef.current;
    if (!editor) {
      setDraft(`${draft}${draft && !draft.endsWith("\n") ? "\n" : ""}${markdown}\n`);
      return;
    }
    const selection = editor.getSelection();
    if (!selection) return;
    editor.executeEdits("dama-note-image", [{ range: selection, text: markdown, forceMoveMarkers: true }]);
    editor.focus();
  }

  async function addImage(selected: globalThis.File) {
    if (!file || !selected.type.startsWith("image/")) return;
    setImporting(true);
    setNoteError(null);
    try {
      const asset = await onImportAsset(file.path, selected);
      const alt = selected.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ") || "Imagem";
      insertMarkdown(`![${alt}](${asset.markdownPath})`);
    } catch (cause) { setNoteError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setImporting(false); }
  }

  function pastedImage(event: ReactClipboardEvent<HTMLDivElement>) {
    const selected = [...event.clipboardData.files].find((item) => item.type.startsWith("image/"));
    if (!selected) return;
    event.preventDefault();
    void addImage(selected);
  }

  function droppedImage(event: ReactDragEvent<HTMLDivElement>) {
    setDragging(false);
    const selected = [...event.dataTransfer.files].find((item) => item.type.startsWith("image/"));
    if (!selected) return;
    event.preventDefault();
    void addImage(selected);
  }

  function openLinkedNote(target: string) {
    const clean = target.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\.md$/i, "").toLowerCase();
    const matches = notes.filter((path) => {
      const normalized = path.replace(/\.md$/i, "").toLowerCase();
      return normalized === clean || normalized.split("/").at(-1) === clean.split("/").at(-1);
    });
    if (matches.length === 1) onOpenNote(matches[0]);
    else setNoteError(matches.length ? `O link “${target}” corresponde a mais de uma nota.` : `A nota “${target}” ainda não existe.`);
  }

  if (!project) return <CenteredEmpty icon={<BookOpen size={25} />} title="Abra um projeto para criar notas" text="As notas e seus anexos ficam dentro da pasta escolhida, em formatos abertos e portáteis." action="Abrir projeto" onAction={onOpenProject} />;
  if (!file) return <div className="notes-welcome"><BookOpen size={29} /><span className="eyebrow">Notas da Dama</span><h2>Conhecimento junto do projeto.</h2><p>Escreva em Markdown, cole imagens diretamente e conecte ideias usando <code>[[nome da nota]]</code>.</p>{showCreate ? <form onSubmit={async (event) => { event.preventDefault(); if (newTitle.trim()) await onCreate(newTitle.trim()); }}><input autoFocus value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="Título da primeira nota" /><button className="primary-button" disabled={!newTitle.trim()}><Plus size={13} /> Criar nota</button></form> : <button className="primary-button" onClick={() => setShowCreate(true)}><Plus size={13} /> Nova nota</button>}<small>{notes.length ? `${notes.length} ${notes.length === 1 ? "nota encontrada" : "notas encontradas"} neste projeto` : "Será criada uma pasta notes/ automaticamente"}</small></div>;

  return <div className={`notes-view mode-${mode} ${dragging ? "dragging" : ""}`} onPasteCapture={pastedImage} onDragOver={(event) => { if ([...event.dataTransfer.items].some((item) => item.type.startsWith("image/"))) { event.preventDefault(); setDragging(true); } }} onDragLeave={() => setDragging(false)} onDrop={droppedImage}>
    <header className="notes-toolbar"><div className="note-file"><BookOpen size={14} /><span>{file.path}</span>{dirty && <span className="dirty-dot" />}</div><div className="note-mode-switch"><button className={mode === "edit" ? "active" : ""} onClick={() => setMode("edit")} title="Somente edição"><PanelLeft size={13} /></button><button className={mode === "split" ? "active" : ""} onClick={() => setMode("split")} title="Edição e preview"><Code2 size={13} /><Eye size={13} /></button><button className={mode === "preview" ? "active" : ""} onClick={() => setMode("preview")} title="Somente leitura"><Eye size={13} /></button></div><div className="note-actions"><input ref={imageInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(event) => { const selected = event.target.files?.[0]; if (selected) void addImage(selected); event.target.value = ""; }} /><button className="note-image-button" disabled={importing} onClick={() => imageInput.current?.click()}>{importing ? <LoaderCircle className="spin" size={13} /> : <ImagePlus size={13} />} Imagem</button><button className="save-button" onClick={onSave} disabled={!dirty || saving}>{saving ? <LoaderCircle className="spin" size={13} /> : <Save size={13} />} Salvar <kbd>Ctrl S</kbd></button></div></header>
    {noteError && <div className="note-error"><AlertCircle size={13} /><span>{noteError}</span><button onClick={() => setNoteError(null)}><X size={12} /></button></div>}
    <div className="notes-canvas">
      {mode !== "preview" && <div className="note-editor-pane"><MonacoEditor path={`note:${file.path}`} value={draft} language="markdown" theme="dama-dark" onMount={(editor) => { editorRef.current = editor; }} onChange={(value) => setDraft(value || "")} beforeMount={(monaco) => { monaco.editor.defineTheme("dama-dark", { base: "vs-dark", inherit: true, rules: [{ token: "markup.heading.markdown", foreground: "EFC99F", fontStyle: "bold" }, { token: "string.link.markdown", foreground: "9FBE91" }, { token: "keyword", foreground: "D8A26C" }], colors: { "editor.background": "#191916", "editor.foreground": "#D7D3CA", "editorLineNumber.foreground": "#54524D", "editorLineNumber.activeForeground": "#A7A39A", "editorCursor.foreground": "#EFC99F", "editor.selectionBackground": "#4B403260" } }); }} options={{ automaticLayout: true, minimap: { enabled: false }, fontFamily: "Consolas, 'Courier New', monospace", fontSize: 13, lineHeight: 22, lineNumbers: "off", folding: false, wordWrap: "on", scrollBeyondLastLine: false, smoothScrolling: true, padding: { top: 24, bottom: 24 } }} /></div>}
      {mode !== "edit" && <article className="note-preview"><NoteMarkdownContent content={draft} notePath={file.path} projectFiles={projectFiles} onOpenNote={openLinkedNote} /></article>}
    </div>
    {dragging && <div className="note-drop-overlay"><ImagePlus size={24} /><strong>Solte para anexar à nota</strong></div>}
    <footer className="note-status"><span>Markdown</span><span>{words} {words === 1 ? "palavra" : "palavras"}</span><span>{imageCount} {imageCount === 1 ? "imagem" : "imagens"}</span><span>{dirty ? "Alterações não salvas" : "Salvo"}</span></footer>
  </div>;
}

function EditorView({ file, line, draft, setDraft, dirty, saving, onSave, onOpenProject }: { file: OpenFile | null; line: number | null; draft: string; setDraft: (value: string) => void; dirty: boolean; saving: boolean; onSave: () => void; onOpenProject: () => void }) {
  const lineCount = useMemo(() => draft.split("\n").length, [draft]);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  useEffect(() => {
    if (!line || !editorRef.current) return;
    editorRef.current.setPosition({ lineNumber: line, column: 1 });
    editorRef.current.revealLineInCenter(line);
    editorRef.current.focus();
  }, [file?.path, line]);
  if (!file) return <CenteredEmpty icon={<FileCode2 size={25} />} title="Nenhum arquivo aberto" text="Escolha um arquivo no explorador para visualizar e editar." action="Abrir projeto" onAction={onOpenProject} />;
  const extension = file.path.split(".").pop()?.toLowerCase() || "";
  const languageMap: Record<string, string> = { ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", json: "json", css: "css", scss: "scss", html: "html", md: "markdown", py: "python", go: "go", rs: "rust", java: "java", php: "php", sql: "sql", yaml: "yaml", yml: "yaml", sh: "shell", ps1: "powershell" };
  return (
    <div className="editor-view">
      <header className="editor-toolbar"><div><FileCode2 size={14} /><span>{file.path}</span>{dirty && <span className="dirty-dot" />}</div><button className="save-button" onClick={onSave} disabled={!dirty || saving}>{saving ? <LoaderCircle className="spin" size={13} /> : <Save size={13} />} Salvar <kbd>Ctrl S</kbd></button></header>
      <div className="monaco-host"><MonacoEditor path={file.path} value={draft} language={languageMap[extension] || "plaintext"} theme="dama-dark" onMount={(editor) => {
        editorRef.current = editor;
        if (line) {
          editor.setPosition({ lineNumber: line, column: 1 });
          editor.revealLineInCenter(line);
        }
      }} onChange={(value) => setDraft(value || "")} beforeMount={(monaco) => {
        monaco.editor.defineTheme("dama-dark", { base: "vs-dark", inherit: true, rules: [{ token: "comment", foreground: "77746D", fontStyle: "italic" }, { token: "keyword", foreground: "D8A26C" }, { token: "string", foreground: "9FBE91" }, { token: "number", foreground: "C9A7D8" }], colors: { "editor.background": "#191916", "editor.foreground": "#D7D3CA", "editorLineNumber.foreground": "#54524D", "editorLineNumber.activeForeground": "#A7A39A", "editorCursor.foreground": "#EFC99F", "editor.selectionBackground": "#4B403260", "editor.inactiveSelectionBackground": "#38342E50", "editorIndentGuide.background1": "#2A2925", "editorIndentGuide.activeBackground1": "#4A4740" } });
        if (monaco.typescript?.typescriptDefaults) monaco.typescript.typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false });
      }} options={{ automaticLayout: true, minimap: { enabled: true }, fontFamily: "Consolas, 'Courier New', monospace", fontSize: 12, lineHeight: 20, lineNumbersMinChars: 3, scrollBeyondLastLine: false, smoothScrolling: true, wordWrap: "off", renderWhitespace: "selection", padding: { top: 10 }, bracketPairColorization: { enabled: true } }} /></div>
      <footer className="editor-status"><span>UTF-8</span><span>{lineCount} linhas</span><span>{dirty ? "Alterações não salvas" : "Salvo"}</span></footer>
    </div>
  );
}

function SearchView({ project, query, setQuery, results, searching, onSearch, onOpen }: { project: OpenProject | null; query: string; setQuery: (value: string) => void; results: SearchResult[]; searching: boolean; onSearch: (event: FormEvent) => void; onOpen: (path: string, line?: number) => void }) {
  if (!project) return <CenteredEmpty icon={<Search size={24} />} title="Abra um projeto para buscar" text="A busca lê somente arquivos de texto dentro da pasta escolhida." />;
  return <div className="search-view"><form onSubmit={onSearch}><Search size={17} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar texto no projeto" /><button disabled={query.trim().length < 2 || searching}>{searching ? <LoaderCircle className="spin" size={14} /> : "Buscar"}</button></form><div className="search-results">{results.map((result, index) => <button key={`${result.path}-${result.line}-${index}`} onClick={() => onOpen(result.path, result.line)}><div><strong>{result.path}</strong><span>linha {result.line}</span></div><code>{result.preview}</code></button>)}{query && !searching && !results.length && <p>Nenhuma ocorrência encontrada.</p>}</div></div>;
}

function GitView({ project, git, onRefresh, onInit, onOperation, onOpen }: { project: OpenProject | null; git: GitSummary; onRefresh: () => void; onInit: () => void; onOperation: (input: Record<string, unknown>) => Promise<GitOperationResult>; onOpen: (path: string) => void }) {
  const [action, setAction] = useState("status");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const actions = [
    ["status", "Atualizar status"], ["branches", "Listar branches"], ["create_branch", "Criar branch"], ["checkout", "Trocar branch"],
    ["stage", "Adicionar ao stage"], ["unstage", "Remover do stage"], ["commit", "Criar commit"], ["pull", "Pull"], ["push", "Push"],
    ["stash", "Guardar no stash"], ["stash_list", "Listar stash"], ["stash_pop", "Aplicar stash"], ["merge", "Merge"], ["abort_merge", "Abortar merge"],
    ["revert", "Reverter commit"], ["restore", "Restaurar arquivo"],
  ];
  const needsValue = !["status", "branches", "pull", "push", "stash", "stash_list", "stash_pop", "abort_merge"].includes(action);
  const placeholder = action === "commit" ? "Mensagem do commit" : action === "create_branch" || action === "checkout" || action === "merge" ? "Nome da branch" : action === "revert" ? "Hash do commit" : "Caminhos separados por vírgula";
  async function runOperation(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setOutput(null);
    try {
      const input: Record<string, unknown> = { action };
      if (["create_branch", "checkout", "merge"].includes(action)) input.name = value.trim();
      else if (action === "commit") input.message = value.trim();
      else if (action === "revert") input.ref = value.trim();
      else if (["stage", "unstage", "restore"].includes(action)) input.paths = value.split(",").map((item) => item.trim()).filter(Boolean);
      const result = await onOperation(input);
      setOutput([result.stdout, result.stderr, result.conflicts.length ? `Conflitos:\n${result.conflicts.join("\n")}` : ""].filter(Boolean).join("\n").trim() || "Operação concluída.");
      if (result.code === 0 && needsValue) setValue("");
    } catch (cause) { setOutput(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  if (!project) return <CenteredEmpty icon={<GitBranch size={24} />} title="Nenhum repositório aberto" text="Abra um projeto para visualizar o estado do Git." />;
  if (!git.repository) return <CenteredEmpty icon={<GitBranch size={24} />} title="Git ainda não iniciado" text="Você pode iniciar um repositório nesta pasta. Nenhum arquivo será commitado." action="Iniciar Git" onAction={onInit} />;
  return <div className="git-view"><header><div><span className="eyebrow">Branch atual</span><h2><GitBranch size={18} />{git.branch}</h2></div><button className="secondary-button" onClick={onRefresh}><RefreshCw size={13} /> Atualizar</button></header><form className="git-operations" onSubmit={runOperation}><select value={action} onChange={(event) => { setAction(event.target.value); setValue(""); setOutput(null); }}>{actions.map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select>{needsValue && <input value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} />}<button className="primary-button" disabled={busy || needsValue && !value.trim()}>{busy ? <LoaderCircle className="spin" size={13} /> : <Play size={13} />} Executar</button></form>{output && <pre className="git-operation-output">{output}</pre>}<section><div className="section-heading"><span>Alterações locais</span><small>{git.changes.length}</small></div>{git.changes.length ? git.changes.map((change) => <button className="git-file-row" key={`${change.status}-${change.path}`} onClick={() => onOpen(change.path)}><span className={`git-status status-${change.status[0]}`}>{change.status}</span><span>{change.path}</span><ChevronRight size={13} /></button>) : <div className="clean-state"><CheckCircle2 size={20} /><p>O diretório de trabalho está limpo.</p></div>}</section></div>;
}

function TerminalView({ project, input, setInput, entries, onRequest, onStop, onClear }: { project: OpenProject | null; input: string; setInput: (value: string) => void; entries: TerminalEntry[]; onRequest: (command: string) => void; onStop: (id: string) => void; onClear: () => void }) {
  function submit(event: FormEvent) { event.preventDefault(); if (input.trim()) { onRequest(input.trim()); setInput(""); } }
  return <div className="terminal-view"><header><div><TerminalSquare size={14} /><span>Terminal</span><small>{project?.path || "nenhum projeto"}</small></div><button className="icon-button" onClick={onClear}><Trash2 size={14} /></button></header><div className="terminal-output">{entries.length ? entries.map((entry) => <div className="terminal-entry" key={entry.id}><div className="terminal-command"><span>❯</span><strong>{entry.command}</strong>{entry.running && <button onClick={() => onStop(entry.id)}><Square size={11} /> Parar</button>}</div><pre>{entry.output}{entry.errorOutput && <span className="terminal-stderr">{entry.errorOutput}</span>}{!entry.output && !entry.errorOutput && entry.running ? "Aguardando saída…" : ""}</pre>{entry.running ? <div className="terminal-running"><LoaderCircle className="spin" size={13} /> processo em execução</div> : <span className={`exit-code ${entry.code === 0 ? "success" : "error"}`}>processo finalizado · código {entry.code}</span>}</div>) : <div className="terminal-placeholder"><span>Dama terminal</span><p>A saída aparece em tempo real. Processos longos podem ser interrompidos pelo botão Parar.</p></div>}</div><form onSubmit={submit}><span>❯</span><input value={input} onChange={(event) => setInput(event.target.value)} disabled={!project} placeholder={project ? "Digite um comando" : "Abra um projeto primeiro"} /><button disabled={!input.trim() || !project}><ArrowUp size={14} /></button></form></div>;
}

function PreviewView({ project, state, url, setUrl, error, onStart, onStop, onSendToAgent }: { project: OpenProject | null; state: PreviewState; url: string; setUrl: (value: string) => void; error: string | null; onStart: () => void; onStop: () => void; onSendToAgent: (references: PreviewElementReference[]) => void }) {
  const displayUrl = url && /^https?:\/\//.test(url) ? url : "";
  const [inspecting, setInspecting] = useState(false);
  const [selectedCount, setSelectedCount] = useState(0);
  const [resolving, setResolving] = useState(false);
  const [inspectorError, setInspectorError] = useState<string | null>(null);
  const inspectorSessionUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!inspecting || !displayUrl || !window.dama) return;
    let active = true;
    const poll = window.setInterval(() => {
      window.dama?.previewInspectorState(displayUrl).then((snapshot) => { if (active) { setSelectedCount(snapshot.selected.length); if (snapshot.active) inspectorSessionUrl.current = displayUrl; } }).catch((cause) => { if (active) setInspectorError(cause instanceof Error ? cause.message : String(cause)); });
    }, 500);
    return () => { active = false; window.clearInterval(poll); };
  }, [inspecting, displayUrl]);

  useEffect(() => () => {
    const activeUrl = inspectorSessionUrl.current;
    inspectorSessionUrl.current = null;
    if (activeUrl) void window.dama?.disablePreviewInspector(activeUrl).catch(() => undefined);
  }, []);

  async function disableInspector(showError = false) {
    if (!window.dama) return;
    const activeUrl = inspectorSessionUrl.current || displayUrl;
    inspectorSessionUrl.current = null;
    setInspecting(false);
    setSelectedCount(0);
    if (!activeUrl) return;
    try { await window.dama.disablePreviewInspector(activeUrl); }
    catch (cause) { if (showError) setInspectorError(cause instanceof Error ? cause.message : String(cause)); }
  }

  async function toggleInspector() {
    if (!window.dama || !displayUrl) return;
    setInspectorError(null);
    try {
      if (inspecting) {
        await disableInspector(true);
      } else {
        await window.dama.enablePreviewInspector(displayUrl);
        inspectorSessionUrl.current = displayUrl;
        setInspecting(true);
      }
    } catch (cause) { setInspectorError(cause instanceof Error ? cause.message : String(cause)); }
  }

  async function sendSelection() {
    if (!window.dama || !displayUrl) return;
    setResolving(true);
    setInspectorError(null);
    try {
      const references = await window.dama.getPreviewSelection(displayUrl);
      if (!references.length) throw new Error("Selecione pelo menos um elemento da página.");
      await disableInspector(false);
      onSendToAgent(references);
    } catch (cause) { setInspectorError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setResolving(false); }
  }

  return <div className={`preview-view ${inspecting ? "is-inspecting" : ""}`}><header><div className="preview-controls">{state.running ? <button className="icon-button stop" onClick={onStop}><Square size={13} /></button> : <button className="icon-button" onClick={onStart} disabled={!project}><Play size={14} /></button>}<button className="icon-button" onClick={async () => { if (inspecting) await disableInspector(false); if (displayUrl) setUrl(`${displayUrl}${displayUrl.includes("?") ? "&" : "?"}dama_reload=${Date.now()}`); }}><RefreshCw size={13} /></button></div><div className="url-bar"><span className={state.running ? "url-status live" : "url-status"} /><input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="http://127.0.0.1:5173" /></div>{displayUrl && <><button className={`icon-button preview-inspector-toggle ${inspecting ? "active" : ""}`} title={inspecting ? "Encerrar seleção" : "Selecionar elementos da página"} onClick={() => void toggleInspector()}><CircleDot size={14} /></button><button className="icon-button" title="Abrir no navegador padrão" onClick={() => window.dama?.openExternal(displayUrl)}><ExternalLink size={14} /></button></>}</header>{error && <div className="preview-notice"><AlertCircle size={15} /><div><strong>O preview não iniciou automaticamente</strong><p>{error}</p><p>Você pode iniciar o servidor pelo terminal e colar a URL acima.</p></div></div>}{inspectorError && <div className="preview-inspector-error"><AlertCircle size={13} />{inspectorError}<button onClick={() => setInspectorError(null)}><X size={12} /></button></div>}{displayUrl ? <iframe key={displayUrl} src={displayUrl} title="Preview do projeto" /> : <div className="preview-empty"><Globe2 size={27} /><h2>Preview local</h2><p>Inicie o script <code>dev</code> do projeto ou informe a URL de um servidor já aberto.</p><button onClick={onStart} disabled={!project}><Play size={13} /> Iniciar preview</button></div>}{inspecting && <div className="preview-selection-bar"><div><CircleDot size={14} /><span>{selectedCount ? `${selectedCount} ${selectedCount === 1 ? "elemento selecionado" : "elementos selecionados"}` : "Clique em um elemento · Shift para selecionar vários"}</span></div>{selectedCount > 0 && <><button className="quiet-button" onClick={async () => { try { await window.dama?.clearPreviewInspector(displayUrl); setSelectedCount(0); } catch (cause) { setInspectorError(cause instanceof Error ? cause.message : String(cause)); } }}>Limpar</button><button className="primary-button" disabled={resolving} onClick={() => void sendSelection()}>{resolving ? <LoaderCircle className="spin" size={13} /> : <MessageSquareText size={13} />} Levar ao agente</button></>}</div>}{state.logs.length > 0 && !displayUrl && <pre className="preview-logs">{state.logs.join("\n")}</pre>}</div>;
}

function CenteredEmpty({ icon, title, text, action, onAction }: { icon: React.ReactNode; title: string; text: string; action?: string; onAction?: () => void }) {
  return <div className="centered-empty">{icon}<h2>{title}</h2><p>{text}</p>{action && <button onClick={onAction}>{action}</button>}</div>;
}
