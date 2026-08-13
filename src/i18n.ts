import { useEffect } from "react";

export type InterfaceLanguage = "pt-BR" | "en-US" | "es-ES";

const en: Record<string, string> = {
  "Abrir projeto": "Open project", "Chat": "Chat", "Agente": "Agent", "Código": "Code", "Notas": "Notes", "Buscar": "Search", "Terminal": "Terminal", "Configurações": "Settings",
  "Projeto": "Project", "Nova conversa": "New conversation", "Nenhum projeto aberto": "No project open", "Escolha uma pasta local para ativar as ferramentas.": "Choose a local folder to enable the tools.", "Abrir pasta": "Open folder", "Workspace": "Workspace", "Sem projeto": "No project", "A Dama não acessou seus arquivos": "Dama has not accessed your files",
  "Converse com a Dama.": "Talk to Dama.", "Sem projeto obrigatório, sem plano automático. Apenas uma conversa direta com o modelo escolhido.": "No project required and no automatic plan. Just a direct conversation with the selected model.", "Modelo": "Model", "Médio": "Medium", "Baixo": "Low", "Alto": "High", "Máximo": "Maximum", "Enter envia · Shift+Enter nova linha": "Enter sends · Shift+Enter adds a new line",
  "Execução técnica": "Technical execution", "Sessão": "Session", "Segurança": "Security", "Nenhuma operação executada nesta sessão.": "No operation was run in this session.", "Alterações": "Changes", "Arquivo": "File", "Parado": "Stopped", "Rodando": "Running", "Atualizar estado": "Refresh status",
  "Quando o agente trabalhar, leituras, buscas e edições aparecerão aqui em tempo real.": "When the agent works, reads, searches, and edits appear here in real time.", "Comandos exigem confirmação. Arquivos só podem ser acessados dentro da pasta atual.": "Commands require confirmation. Files can only be accessed inside the current folder.", "Pergunte qualquer coisa… Use / para comandos e @ para arquivos": "Ask anything… Use / for commands and @ for files", "Modelo da conversa": "Conversation model", "Nível de raciocínio": "Reasoning level", "Sem modelo": "No model", "Adicionar modelo": "Add model",
  "Perfil": "Profile", "Modelos": "Models", "Aparência": "Appearance", "Privacidade": "Privacy", "Preferências": "Preferences", "Salvar alterações": "Save changes", "Alterações ficam locais": "Changes stay local",
  "Seu perfil": "Your profile", "Personaliza como a Dama conversa com você.": "Customizes how Dama talks to you.", "Como devemos chamar você?": "What should we call you?", "Finalidade principal": "Main purpose", "Nível de detalhe": "Detail level", "Trabalho": "Work", "Criar produtos": "Build products", "Aprender": "Learn", "Projetos pessoais": "Personal projects", "Explicativo": "Explanatory", "Equilibrado": "Balanced", "Objetivo e técnico": "Concise and technical",
  "Primeira execução": "First run", "Revise novamente as perguntas de personalização.": "Review the personalization questions again.", "Refazer onboarding": "Restart onboarding", "Suas integrações e projetos não serão removidos.": "Your integrations and projects will not be removed.", "Começar novamente": "Start again",
  "Modelos conectados": "Connected models", "Testar e adicionar modelo": "Test and add model", "Nenhum modelo testado e salvo.": "No tested model has been saved.", "Geração": "Generation", "Temperatura": "Temperature", "Janela de contexto": "Context window", "Falhas e reconexão": "Failures and reconnection", "Tentativas de reconexão": "Reconnection attempts", "Correções de resposta inválida": "Invalid response corrections",
  "Comportamento": "Behavior", "Modo padrão": "Default mode", "Planejar antes de agir": "Plan before acting", "Agente direto": "Direct agent", "Somente responder": "Only answer", "Política de aprovação": "Approval policy", "Cautelosa": "Careful", "Equilibrada": "Balanced", "Mais autônoma": "More autonomous", "Limitar ciclos do agente": "Limit agent cycles", "Enter envia a mensagem": "Enter sends the message", "Uso do computador": "Computer use", "Permitir controle assistido": "Allow assisted control", "Instruções pessoais": "Personal instructions",
  "Servidores MCP": "MCP servers", "Nome do servidor": "Server name", "Comando local": "Local command", "Adicionar": "Add", "Nenhum servidor MCP configurado.": "No MCP server configured.", "Plugins locais": "Local plugins", "Adicionar pasta de plugin": "Add plugin folder", "Nenhum plugin local adicionado.": "No local plugin added.",
  "Interface": "Interface", "Densidade": "Density", "Compacta": "Compact", "Confortável": "Comfortable", "Espaçosa": "Spacious", "Cor de destaque": "Accent color", "Âmbar": "Amber", "Verde": "Green", "Azul": "Blue", "Violeta": "Violet", "Neutra": "Neutral", "Superfície": "Surface", "Grafite quente": "Warm graphite", "Preto profundo": "Deep black", "Azul ardósia": "Slate blue", "Animações da interface": "Interface animations", "Painel de contexto aberto": "Open context panel",
  "Dados e privacidade": "Data and privacy", "Histórico local": "Local history", "Telemetria anônima": "Anonymous telemetry", "Relatórios de diagnóstico": "Diagnostic reports", "Permissões de ferramentas": "Tool permissions", "Revogar permissões persistentes": "Revoke persistent permissions", "Revogar todas": "Revoke all",
  "Bem-vindo à Dama": "Welcome to Dama", "Seu ambiente, do seu jeito.": "Your environment, your way.", "Antes de abrir o primeiro projeto, vamos ajustar a Dama ao modo como você trabalha. Leva menos de um minuto.": "Before opening your first project, let's adjust Dama to the way you work. It takes less than a minute.", "Personalizar": "Customize", "Sobre você": "About you", "Como devo chamar você?": "What should I call you?", "Usaremos seu nome apenas na experiência local da Dama.": "Your name is used only in your local Dama experience.", "Seu nome": "Your name", "Continuar": "Continue", "Voltar": "Back", "Finalidade": "Purpose", "Para que você vai usar a Dama?": "What will you use Dama for?", "Isso ajuda a calibrar sugestões, linguagem e nível de explicação.": "This helps tune suggestions, language, and explanation level.", "Projetos profissionais e equipes": "Professional projects and teams", "Apps, sites e novas ideias": "Apps, websites, and new ideas", "Estudo, prática e exploração": "Study, practice, and exploration", "Experimentação e ferramentas": "Experiments and tools", "Experiência": "Experience", "Quanto detalhe você prefere?": "How much detail do you prefer?", "A Dama pode explicar cada decisão ou conversar de forma mais direta.": "Dama can explain each decision or speak more directly.", "Estou começando": "I'm getting started", "Explique conceitos e apresente os próximos passos": "Explain concepts and show the next steps", "Já desenvolvo": "I already develop", "Equilibre explicação e velocidade": "Balance explanation and speed", "Quero objetividade": "I want concise answers", "Seja técnica, curta e assuma familiaridade": "Be technical and concise, and assume familiarity", "Autonomia": "Autonomy", "Como a Dama deve agir?": "How should Dama work?", "Comandos perigosos sempre terão proteção, independentemente desta escolha.": "Dangerous commands are always protected, regardless of this choice.", "Pergunte com frequência": "Ask frequently", "Aprove cada grupo de alterações e cada comando": "Approve every group of changes and every command", "Equilíbrio recomendado": "Recommended balance", "Aprove o plano e confirme somente ações sensíveis": "Approve the plan and confirm only sensitive actions", "Mais autonomia": "More autonomy", "Trabalhe dentro do plano e interrompa apenas diante de risco": "Work within the plan and pause only when there is risk", "Recomendado": "Recommended", "Etapa opcional": "Optional step", "Verificar desempenho": "Check performance", "Faça um teste rápido para ver o consumo esperado no editor, no preview e durante builds.": "Run a quick test to estimate usage in the editor, preview, and during builds.", "Executado localmente": "Runs locally", "Os dados não são enviados": "No data is sent", "Leva poucos segundos": "Takes a few seconds", "Não instala nem baixa arquivos": "Does not install or download files", "Relatório de uso": "Usage report", "Memória e CPU por cenário": "Memory and CPU by scenario", "Agora não": "Not now", "Iniciar teste": "Start test", "Entrar na Dama": "Enter Dama", "Essas preferências ficam neste dispositivo.": "These preferences stay on this device.", "Idioma da interface": "Interface language", "Animação do Dino da Dama": "Dama Dino animation",
  "Atualizações": "Updates", "Notificações": "Notifications", "Ativar notificações": "Enable notifications", "Permite que a Dama envie avisos do sistema": "Allow Dama to send system notifications", "Avisa quando uma ferramenta precisa da sua decisão": "Notify when a tool needs your decision", "Avisa quando o agente termina um trabalho demorado": "Notify when the agent finishes a long task", "Evita avisos duplicados enquanto você já está olhando a execução": "Avoid duplicate alerts while you are already viewing the run", "Procurar atualização": "Check for updates", "Atualização automática": "Automatic updates", "Baixa e instala a versão mais recente ao abrir a Dama": "Download and install the latest version when Dama opens", "Procurar ao iniciar": "Check at startup", "Consulta o canal estável sempre que a Dama for aberta": "Check the stable channel whenever Dama opens", "Autorizações pendentes": "Pending approvals", "Execuções longas concluídas": "Completed long runs", "Somente quando a Dama não estiver em foco": "Only when Dama is not focused", "Tempo mínimo para considerar uma execução longa": "Minimum time for a long run", "Versão instalada": "Installed version", "Estado": "Status", "Pronta para verificar": "Ready to check", "Procurando…": "Checking…", "Pronta para instalar": "Ready to install", "Atualizada": "Up to date", "Falha na verificação": "Check failed", "Disponível no aplicativo instalado": "Available in the installed app",
  "Uma nova versão está disponível": "A new version is available", "Baixar atualização": "Download update", "Atualizando a Dama": "Updating Dama", "Preparando a atualização": "Preparing the update", "Baixando atualização": "Downloading update", "Aplicando atualização": "Applying update", "Reiniciar e instalar": "Restart and install", "Notas da versão": "Release notes", "Você já está na versão mais recente.": "You are already on the latest version.", "Não foi possível procurar atualizações.": "Could not check for updates.",
};

const es: Record<string, string> = {
  ...en,
  "Abrir projeto": "Abrir proyecto", "Agente": "Agente", "Código": "Código", "Notas": "Notas", "Buscar": "Buscar", "Configuraciones": "Configuración", "Configurações": "Configuración",
  "Projeto": "Proyecto", "Nova conversa": "Nueva conversación", "Nenhum projeto aberto": "Ningún proyecto abierto", "Escolha uma pasta local para ativar as ferramentas.": "Elige una carpeta local para activar las herramientas.", "Abrir pasta": "Abrir carpeta", "Sem projeto": "Sin proyecto", "A Dama não acessou seus arquivos": "Dama no ha accedido a tus archivos",
  "Converse com a Dama.": "Habla con Dama.", "Sem projeto obrigatório, sem plano automático. Apenas uma conversa direta com o modelo escolhido.": "Sin proyecto obligatorio ni plan automático. Solo una conversación directa con el modelo elegido.", "Modelo": "Modelo", "Médio": "Medio", "Baixo": "Bajo", "Alto": "Alto", "Máximo": "Máximo",
  "Execução técnica": "Ejecución técnica", "Sessão": "Sesión", "Segurança": "Seguridad", "Nenhuma operação executada nesta sessão.": "No se ejecutó ninguna operación en esta sesión.", "Alterações": "Cambios", "Arquivo": "Archivo", "Parado": "Detenido", "Rodando": "En ejecución", "Atualizar estado": "Actualizar estado",
  "Quando o agente trabalhar, leituras, buscas e edições aparecerão aqui em tempo real.": "Cuando el agente trabaje, las lecturas, búsquedas y ediciones aparecerán aquí en tiempo real.", "Comandos exigem confirmação. Arquivos só podem ser acessados dentro da pasta atual.": "Los comandos requieren confirmación. Solo se puede acceder a archivos dentro de la carpeta actual.", "Pergunte qualquer coisa… Use / para comandos e @ para arquivos": "Pregunta lo que quieras… Usa / para comandos y @ para archivos", "Modelo da conversa": "Modelo de la conversación", "Nível de raciocínio": "Nivel de razonamiento", "Sem modelo": "Sin modelo", "Adicionar modelo": "Añadir modelo",
  "Perfil": "Perfil", "Modelos": "Modelos", "Aparência": "Apariencia", "Privacidade": "Privacidad", "Preferências": "Preferencias", "Salvar alterações": "Guardar cambios", "Alterações ficam locais": "Los cambios permanecen locales",
  "Seu perfil": "Tu perfil", "Como devemos chamar você?": "¿Cómo debemos llamarte?", "Finalidade principal": "Finalidad principal", "Nível de detalhe": "Nivel de detalle", "Trabalho": "Trabajo", "Criar produtos": "Crear productos", "Aprender": "Aprender", "Projetos pessoais": "Proyectos personales", "Explicativo": "Explicativo", "Equilibrado": "Equilibrado", "Objetivo e técnico": "Directo y técnico",
  "Primeira execução": "Primera ejecución", "Refazer onboarding": "Repetir introducción", "Começar novamente": "Empezar de nuevo", "Modelos conectados": "Modelos conectados", "Testar e adicionar modelo": "Probar y añadir modelo", "Nenhum modelo testado e salvo.": "No hay modelos probados y guardados.",
  "Comportamento": "Comportamiento", "Modo padrão": "Modo predeterminado", "Planejar antes de agir": "Planificar antes de actuar", "Agente direto": "Agente directo", "Somente responder": "Solo responder", "Política de aprovação": "Política de aprobación", "Cautelosa": "Cautelosa", "Equilibrada": "Equilibrada", "Mais autônoma": "Más autónoma", "Uso do computador": "Uso del ordenador", "Permitir controle assistido": "Permitir control asistido", "Instruções pessoais": "Instrucciones personales",
  "Interface": "Interfaz", "Densidade": "Densidad", "Compacta": "Compacta", "Confortável": "Cómoda", "Espaçosa": "Espaciosa", "Cor de destaque": "Color de acento", "Âmbar": "Ámbar", "Verde": "Verde", "Azul": "Azul", "Violeta": "Violeta", "Neutra": "Neutra", "Superfície": "Superficie", "Animações da interface": "Animaciones de la interfaz",
  "Bem-vindo à Dama": "Bienvenido a Dama", "Seu ambiente, do seu jeito.": "Tu entorno, a tu manera.", "Antes de abrir o primeiro projeto, vamos ajustar a Dama ao modo como você trabalha. Leva menos de um minuto.": "Antes de abrir el primer proyecto, ajustaremos Dama a tu forma de trabajar. Tarda menos de un minuto.", "Personalizar": "Personalizar", "Sobre você": "Sobre ti", "Como devo chamar você?": "¿Cómo debo llamarte?", "Usaremos seu nome apenas na experiência local da Dama.": "Usaremos tu nombre solo en la experiencia local de Dama.", "Seu nome": "Tu nombre", "Continuar": "Continuar", "Voltar": "Volver", "Finalidade": "Finalidad", "Para que você vai usar a Dama?": "¿Para qué vas a usar Dama?", "Isso ajuda a calibrar sugestões, linguagem e nível de explicação.": "Esto ayuda a ajustar las sugerencias, el idioma y el nivel de explicación.", "Projetos profissionais e equipes": "Proyectos profesionales y equipos", "Apps, sites e novas ideias": "Aplicaciones, sitios web y nuevas ideas", "Estudo, prática e exploração": "Estudio, práctica y exploración", "Experimentação e ferramentas": "Experimentación y herramientas", "Experiência": "Experiencia", "Quanto detalhe você prefere?": "¿Cuánto detalle prefieres?", "A Dama pode explicar cada decisão ou conversar de forma mais direta.": "Dama puede explicar cada decisión o hablar de forma más directa.", "Estou começando": "Estoy empezando", "Explique conceitos e apresente os próximos passos": "Explica los conceptos y muestra los próximos pasos", "Já desenvolvo": "Ya desarrollo", "Equilibre explicação e velocidade": "Equilibra explicación y velocidad", "Quero objetividade": "Quiero respuestas directas", "Seja técnica, curta e assuma familiaridade": "Sé técnica y breve, y asume familiaridad", "Autonomia": "Autonomía", "Como a Dama deve agir?": "¿Cómo debe actuar Dama?", "Comandos perigosos sempre terão proteção, independentemente desta escolha.": "Los comandos peligrosos siempre estarán protegidos, independientemente de esta opción.", "Pergunte com frequência": "Preguntar con frecuencia", "Aprove cada grupo de alterações e cada comando": "Aprobar cada grupo de cambios y cada comando", "Equilíbrio recomendado": "Equilibrio recomendado", "Aprove o plano e confirme somente ações sensíveis": "Aprobar el plan y confirmar solo las acciones sensibles", "Mais autonomia": "Más autonomía", "Trabalhe dentro do plano e interrompa apenas diante de risco": "Trabajar dentro del plan e interrumpir solo ante un riesgo", "Recomendado": "Recomendado", "Etapa opcional": "Paso opcional", "Verificar desempenho": "Comprobar rendimiento", "Faça um teste rápido para ver o consumo esperado no editor, no preview e durante builds.": "Haz una prueba rápida para estimar el consumo en el editor, la vista previa y durante las compilaciones.", "Executado localmente": "Se ejecuta localmente", "Os dados não são enviados": "Los datos no se envían", "Leva poucos segundos": "Tarda pocos segundos", "Não instala nem baixa arquivos": "No instala ni descarga archivos", "Relatório de uso": "Informe de uso", "Memória e CPU por cenário": "Memoria y CPU por escenario", "Agora não": "Ahora no", "Iniciar teste": "Iniciar prueba", "Entrar na Dama": "Entrar en Dama", "Essas preferências ficam neste dispositivo.": "Estas preferencias permanecen en este dispositivo.", "Idioma da interface": "Idioma de la interfaz", "Animação do Dino da Dama": "Animación del Dino de Dama",
  "Atualizações": "Actualizaciones", "Notificações": "Notificaciones", "Ativar notificações": "Activar notificaciones", "Permite que a Dama envie avisos do sistema": "Permite que Dama envíe avisos del sistema", "Avisa quando uma ferramenta precisa da sua decisão": "Avisa cuando una herramienta necesita tu decisión", "Avisa quando o agente termina um trabalho demorado": "Avisa cuando el agente termina una tarea larga", "Evita avisos duplicados enquanto você já está olhando a execução": "Evita avisos duplicados mientras ya estás viendo la ejecución", "Procurar atualização": "Buscar actualizaciones", "Atualização automática": "Actualización automática", "Baixa e instala a versão mais recente ao abrir a Dama": "Descarga e instala la versión más reciente al abrir Dama", "Procurar ao iniciar": "Buscar al iniciar", "Consulta o canal estável sempre que a Dama for aberta": "Consulta el canal estable cada vez que se abre Dama", "Autorizações pendentes": "Autorizaciones pendientes", "Execuções longas concluídas": "Ejecuciones largas finalizadas", "Somente quando a Dama não estiver em foco": "Solo cuando Dama no esté enfocada", "Tempo mínimo para considerar uma execução longa": "Tiempo mínimo para considerar una ejecución larga", "Versão instalada": "Versión instalada", "Estado": "Estado", "Pronta para verificar": "Lista para comprobar", "Procurando…": "Buscando…", "Pronta para instalar": "Lista para instalar", "Atualizada": "Actualizada", "Falha na verificação": "Error de comprobación", "Disponível no aplicativo instalado": "Disponible en la aplicación instalada", "Uma nova versão está disponível": "Hay una nueva versión disponible", "Baixar atualização": "Descargar actualización", "Atualizando a Dama": "Actualizando Dama", "Preparando a atualização": "Preparando la actualización", "Baixando atualização": "Descargando actualización", "Aplicando atualização": "Aplicando actualización", "Reiniciar e instalar": "Reiniciar e instalar", "Notas da versão": "Notas de la versión",
};

const dictionaries: Record<InterfaceLanguage, Record<string, string>> = { "pt-BR": {}, "en-US": en, "es-ES": es };
const originalText = new WeakMap<Text, string>();
const lastText = new WeakMap<Text, string>();
const originalAttributes = new WeakMap<Element, Record<string, string>>();
const lastAttributes = new WeakMap<Element, Record<string, string>>();

export function normalizeLanguage(value?: string | null): InterfaceLanguage {
  const locale = String(value || "pt-BR").toLowerCase();
  if (locale.startsWith("en")) return "en-US";
  if (locale.startsWith("es")) return "es-ES";
  return "pt-BR";
}

export function translateInterfaceText(value: string, language: InterfaceLanguage): string {
  if (language === "pt-BR" || !value) return value;
  const direct = dictionaries[language][value];
  if (direct) return direct;
  if (language === "en-US") {
    return value
      .replace(/^(\d+) arquivos?$/, "$1 files")
      .replace(/^linha (\d+)$/, "line $1")
      .replace(/^(\d+) ocorrências?$/, "$1 matches")
      .replace(/^Versão (.+)$/, "Version $1");
  }
  return value
    .replace(/^(\d+) arquivos?$/, "$1 archivos")
    .replace(/^linha (\d+)$/, "línea $1")
    .replace(/^(\d+) ocorrências?$/, "$1 coincidencias")
    .replace(/^Versão (.+)$/, "Versión $1");
}

function ignored(node: Node) {
  const parent = node.parentElement;
  return Boolean(parent?.closest("script,style,pre,code,textarea,[data-no-translate]"));
}

function translateTextNode(node: Text, language: InterfaceLanguage) {
  if (ignored(node)) return;
  const current = node.nodeValue || "";
  if (!current.trim()) return;
  if (!originalText.has(node) || (lastText.has(node) && current !== lastText.get(node))) originalText.set(node, current);
  const source = originalText.get(node) || current;
  const trimmed = source.trim();
  const translated = translateInterfaceText(trimmed, language);
  const next = `${source.match(/^\s*/)?.[0] || ""}${translated}${source.match(/\s*$/)?.[0] || ""}`;
  lastText.set(node, next);
  if (node.nodeValue !== next) node.nodeValue = next;
}

function translateElementAttributes(element: Element, language: InterfaceLanguage) {
  const names = ["placeholder", "title", "aria-label", "data-label"];
  const originals = originalAttributes.get(element) || {};
  const lasts = lastAttributes.get(element) || {};
  for (const name of names) {
    const current = element.getAttribute(name);
    if (!current) continue;
    if (!originals[name] || (lasts[name] && current !== lasts[name])) originals[name] = current;
    const next = translateInterfaceText(originals[name], language);
    lasts[name] = next;
    if (current !== next) element.setAttribute(name, next);
  }
  originalAttributes.set(element, originals);
  lastAttributes.set(element, lasts);
}

function applyLanguage(root: ParentNode, language: InterfaceLanguage) {
  document.documentElement.lang = language;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) translateTextNode(node as Text, language);
  if (root instanceof Element) translateElementAttributes(root, language);
  root.querySelectorAll?.("[placeholder],[title],[aria-label],[data-label]").forEach((element) => translateElementAttributes(element, language));
}

export function useInterfaceLanguage(input?: string | null) {
  const language = normalizeLanguage(input);
  useEffect(() => {
    let queued = false;
    const run = () => { queued = false; applyLanguage(document.body, language); };
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(run);
    });
    run();
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["placeholder", "title", "aria-label", "data-label"] });
    return () => observer.disconnect();
  }, [language]);
}
