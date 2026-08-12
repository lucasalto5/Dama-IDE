# Dama

Dama é uma IDE agêntica desktop e independente de modelo. Ela conecta APIs diretas e modelos locais a um workspace que entende projetos, propõe planos, edita arquivos e executa ferramentas com aprovação explícita.

## Marco atual — 0.8.0

Esta versão já possui uma primeira fatia funcional:

- aplicativo Electron com renderer React + TypeScript isolado;
- abertura de pastas locais e árvore de arquivos real;
- editor Monaco com sintaxe, diagnósticos, numeração e rolagem sincronizada;
- busca textual no projeto;
- leitura do branch e das alterações do Git;
- inicialização opcional de um repositório Git;
- terminal por comando com saída `stdout`/`stderr` em tempo real, código final, interrupção e confirmação antes de executar;
- detecção e inicialização do script `dev` para preview, com servidor estático interno como fallback para projetos com `index.html`;
- preview incorporado por URL local;
- conectores OpenAI-compatible, NVIDIA NIM e Ollama/LM Studio;
- resolução correta de `https://integrate.api.nvidia.com/v1/chat/completions`;
- reconexão configurável para falhas temporárias, com zero a cinco novas tentativas ou modo ilimitado;
- distinção entre timeout/erro de rede, limite temporário, token inválido, endpoint ausente e cota ou créditos esgotados;
- teste real obrigatório antes de salvar um modelo;
- múltiplos modelos persistentes, principal, roteamento por função e fallback ordenado;
- modo de modelo único ou equipe com Orquestrador, Programador e Revisor independentes;
- revisão real em até três rodadas: os problemas encontrados voltam ao Programador antes da resposta final;
- tokens protegidos com o cofre seguro do sistema operacional;
- Chat normal sem projeto, separado do Agente;
- seletores de modelo e profundidade de raciocínio nos compositores;
- seletores compactos com ícones e o identificador real do modelo;
- cópia de respostas do Chat pelo botão de copiar;
- comandos `/` e referências `@` no Chat e no Agente;
- criação automática de workspace em `Documentos/Dama Projects` quando o Agente começa sem pasta;
- roteamento automático determinístico: pedidos curtos, ajustes normais e continuações executam direto mesmo quando o modelo tenta propor um plano; somente trabalhos amplos ou arriscados pedem aprovação;
- preview local iniciado automaticamente ao final de alterações visuais em projetos web, sem interromper tarefas que não precisam de localhost;
- execução sem limite de ciclos por padrão, com limite opcional configurável entre 4 e 100 ciclos;
- criação de plano baseada nos arquivos do projeto e edição real do mesmo plano;
- progresso narrativo com mensagens da Dama e atividades técnicas resumidas/expansíveis;
- espera do modelo identificada separadamente das ferramentas, com tempo decorrido e atualizações honestas da chamada de API;
- painel técnico lateral com leituras, buscas, arquivos editados e contagem de linhas adicionadas/removidas;
- revisão visual das alterações por arquivo, com linhas adicionadas em verde e removidas em vermelho;
- change sets locais por execução, com barra flutuante para aceitar ou restaurar com segurança o estado anterior;
- continuações feitas antes de aceitar as mudanças preservam um único ponto de restauração para toda a sequência;
- planos editados reaparecem como uma nova versão aprovável, preservando a versão anterior como substituída;
- chat agêntico contínuo por projeto, com ajustes de plano e novas orientações durante a execução;
- comentários contextuais da Dama intercalados com ferramentas, planos e resultados;
- Markdown seguro no Chat e no Agente, com títulos, listas, tabelas, citações, tarefas, links e blocos de código;
- referências a arquivos nas mensagens abrem o editor e posicionam a linha quando ela é informada;
- histórico ancora no conteúdo mais recente ao abrir ou retomar Chat e Agente, preservando a rolagem manual quando a pessoa sobe para ler;
- núcleo agêntico com 34 ferramentas reais para navegar, mapear, recuperar contexto, ler regras, pesquisar texto ou regex, detectar stack, verificar ambiente e dependências, analisar segurança, diagnosticar, consultar Git, iniciar Preview, usar LSP/MCP/navegador/Terminal e editar arquivos;
- Terminal/PTY persistente com ConPTY no Windows, saída progressiva, escrita, leitura e encerramento de sessões;
- comandos de servidor como `node server.js`, `npm run dev` e `python -m http.server` migram automaticamente para PTY e não bloqueiam o chat esperando uma saída que nunca termina;
- downloads limitados, instalação validada de pacotes e exclusões reversíveis de arquivos ou pastas;
- navegador Electron isolado para inspecionar texto, links, títulos e controles visíveis sem acesso ao Node ou aos arquivos;
- LSP externo para símbolos, definições, referências, hover, diagnósticos e renomeação semântica reversível;
- runtime MCP por stdio ou HTTP, com JSON-RPC e chamadas explícitas de ferramentas configuradas;
- cards de autorização no feed com negar, permitir uma vez, permitir neste chat, neste projeto ou sempre para a operação específica;
- patch unificado, cópia, movimentação e renomeação de arquivos integrados aos mesmos snapshots reversíveis das edições comuns;
- leitura paginada com números de linha e edição localizada, sem reescrever o arquivo inteiro quando não é necessário;
- comandos propostos pelo modelo separados da aprovação de arquivos;
- painel de atividade preenchido somente por operações executadas.
- identidade oficial com PNG transparente fornecido pelo projeto;
- onboarding de primeira execução com nome, finalidade, experiência e autonomia;
- preferências persistidas no diretório local do aplicativo;
- central de configurações com Perfil, Modelos, Agente, MCP, Plugins, Aparência e Privacidade;
- densidade, animações, painel de contexto, cinco destaques de cor e três superfícies;
- PNGs oficiais do Dino da Dama para os temas âmbar, azul, verde e violeta, com animação sutil;
- rolagem automática nos chats comum e agêntico;
- gerenciador local de projetos e conversas, com retomada e exclusão de chats salvos;
- paletas que tingem fundo, painéis, composer e marca — não apenas botões;
- validação defensiva de planos e tela de recuperação para impedir crashes visuais;
- cadastro persistente de servidores MCP por comando ou HTTP;
- descoberta e cadastro de plugins por pasta local;
- configuração de temperatura, contexto, modo do agente e instruções pessoais;
- opção para refazer o onboarding sem apagar integrações;
- `Enter` para enviar e `Shift+Enter` para criar uma nova linha.

## Segurança do MVP

- O renderer não possui acesso direto ao Node.js.
- Caminhos são resolvidos e validados dentro da raiz do projeto.
- O agente só grava nos arquivos listados no plano aprovado.
- Antes da primeira gravação em cada arquivo, a execução salva um snapshot local para permitir a recusa posterior sem exigir Git.
- A restauração é bloqueada se o arquivo tiver sido alterado novamente depois da execução, evitando sobrescrever trabalho mais recente.
- Terminal, PTY, instalações, downloads, exclusões, navegador, LSP e MCP passam por um card de autorização separado no próprio feed do agente.
- Permissões persistentes podem ser revogadas em Configurações → Privacidade.
- Tokens de modelos são criptografados por `safeStorage`; se a proteção do sistema não estiver disponível, a Dama se recusa a persistir o token.
- Perfil, preferências, MCPs e plugins são salvos em `dama-settings.json` no diretório de dados do aplicativo.
- Pastas pesadas e internas como `node_modules`, `.git`, `dist` e `.next` não entram no contexto.

## Executar

Requer Node.js 20 ou superior.

```bash
npm install
npm run dev
```

Somente a interface web, sem acesso ao sistema:

```bash
npm run dev:web
```

Validar a compilação:

```bash
npm run build
```

## Limitações assumidas

- O preview automático usa o script `dev` quando ele existe; sites estáticos com `index.html` usam o servidor HTTP interno da Dama.
- O loop agêntico atual requer uma API compatível com Chat Completions e tool calls.
- O adaptador para agentes de CLI ainda está visível como indisponível, sem comportamento simulado.
- Plugins locais podem ser cadastrados e habilitados, mas a execução de seus pontos de extensão ainda não está ativa.
- LSP depende de um servidor compatível instalado: `typescript-language-server`, `pyright-langserver`, `rust-analyzer` ou `gopls`.
- O navegador atual inspeciona páginas; automação interativa completa e busca web com fontes ainda não fazem parte deste runtime.
- Git mutável, execução de plugins, extração de arquivos compactados e adaptadores de CLI ainda não fazem parte do loop.
- Ainda não há instalador assinado.

Veja [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) para as próximas camadas.
