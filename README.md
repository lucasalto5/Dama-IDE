# Dama

Dama é uma IDE agêntica desktop e independente de modelo. Ela conecta APIs diretas e modelos locais a um workspace que entende projetos, propõe planos, edita arquivos e executa ferramentas com aprovação explícita.

[Baixar a versão mais recente](https://github.com/lucasalto5/Dama-IDE/releases/latest) · [Discord](https://discord.gg/3cV3BwyNAE) · Licença PolyForm Perimeter 1.0.1

## Código público com proteção contra cópias concorrentes

Este repositório contém a IDE desktop, interface, runtime agêntico, ferramentas locais, instalador, testes e atualizador. Servidores hospedados, credenciais, pesos de modelos e o payload proprietário opcional da Dama AI são distribuídos separadamente e não fazem parte do código público. A IDE continua funcional com APIs compatíveis, NVIDIA NIM, Ollama e LM Studio sem esse componente.

O Dama AI pode ser escolhido no instalador ou adicionado mais tarde em **Configurações → Dama AI**. Nesse segundo fluxo, a IDE baixa o pacote publicado separadamente na release oficial e confere origem, tamanho, SHA-256 e integridade dos arquivos antes de ativá-lo.

O código é **source available**, não open source segundo a definição da OSI. A licença PolyForm Perimeter 1.0.1 permite estudar, modificar e contribuir, mas proíbe oferecer a terceiros um produto que concorra com a Dama, inclusive gratuito. O nome e a identidade visual da Dama também continuam protegidos pelo projeto.

Imagens 
<a href="https://ibb.co/dwkZ9yJj"><img src="https://i.ibb.co/ycg2TJBd/Captura-de-tela-2026-08-12-161524.png" alt="Captura-de-tela-2026-08-12-161524" border="0" /></a> 
<a href="https://ibb.co/j9GSVzdQ"><img src="https://i.ibb.co/35Wnfvwj/Captura-de-tela-2026-08-13-195353.png" alt="Captura-de-tela-2026-08-13-195353" border="0" /></a>
<a href="https://ibb.co/4ZjKGbz2"><img src="https://i.ibb.co/xSMX0nWY/Captura-de-tela-2026-08-13-194614.png" alt="Captura-de-tela-2026-08-13-194614" border="0" /></a>
<a href="https://ibb.co/dwkZ9yJj"><img src="https://i.ibb.co/ycg2TJBd/Captura-de-tela-2026-08-12-161524.png" alt="Captura-de-tela-2026-08-12-161524" border="0" /></a>


## Marco atual — 0.12.3

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
- núcleo agêntico com ferramentas reais para navegar, mapear, recuperar contexto, pesquisar a web com fontes, testar, depurar, operar Git, usar LSP/MCP/plugins/agentes de CLI/navegador/Terminal e editar arquivos;
- Terminal/PTY persistente com ConPTY no Windows, saída progressiva, escrita, leitura e encerramento de sessões;
- comandos de servidor como `node server.js`, `npm run dev` e `python -m http.server` migram automaticamente para PTY e não bloqueiam o chat esperando uma saída que nunca termina;
- downloads limitados, instalação validada de pacotes e exclusões reversíveis de arquivos ou pastas;
- navegador Electron isolado para navegar, clicar, preencher, capturar screenshots e ler texto, console, rede e erros sem acesso ao Node ou aos arquivos;
- pesquisas informativas seguem direto, inclusive sem workspace aberto, e não exibem plano de implementação;
- cumprimentos e dúvidas gerais na aba Agente respondem sem ler o workspace nem mostrar etapas técnicas;
- executor estruturado de Jest, Vitest, Pytest, Mocha, Cargo e Go com falhas clicáveis no editor;
- Git completo no agente e na aba Git: branch, stage, commit, pull, push, stash, merge, conflitos, revert e restore;
- debugger DAP para Python com breakpoints, pilha, escopos, variáveis, avaliação e execução passo a passo;
- arquivos ZIP/TAR, runtime de ferramentas de plugins e adaptadores para Codex CLI, Claude Code, Gemini CLI e OpenCode;
- memória automática opcional por workspace em `notes/memoria-do-projeto.md`;
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
- notificações nativas para autorizações pendentes e execuções longas concluídas;
- interface em português, inglês e espanhol;
- atualização automática pelo GitHub, com notas da versão, progresso e instalação ao iniciar.

## Segurança do MVP

- O renderer não possui acesso direto ao Node.js.
- Caminhos são resolvidos e validados dentro da raiz do projeto.
- O agente só grava nos arquivos listados no plano aprovado.
- Antes da primeira gravação em cada arquivo, a execução salva um snapshot local para permitir a recusa posterior sem exigir Git.
- A restauração é bloqueada se o arquivo tiver sido alterado novamente depois da execução, evitando sobrescrever trabalho mais recente.
- Operações que executam código, alteram estado ou enviam dados passam pelo card de autorização. Pesquisa, navegação e leitura no navegador isolado não interrompem o chat.
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

Executar os testes principais:

```bash
npm run test:syntax
npm run test:notes
npm run test:engine
npm run test:models
npm run test:preview
npm run test:json
npm run test:updates
npm run test:professional
```

## Atualizações

A versão instalada consulta `https://github.com/lucasalto5/Dama-IDE/releases/latest/download` ao iniciar. Uma release precisa conter o instalador, seu `.blockmap` e o `latest.yml`. Consulte [docs/PUBLICAR_ATUALIZACAO.md](docs/PUBLICAR_ATUALIZACAO.md).

## Limitações assumidas

- O preview automático usa o script `dev` quando ele existe; sites estáticos com `index.html` usam o servidor HTTP interno da Dama.
- O loop agêntico atual requer uma API compatível com Chat Completions e tool calls.
- Adaptadores de CLI dependem do respectivo executável já instalado e autenticado no computador.
- Plugins precisam declarar ferramentas em `dama-plugin.json`, `.dama/plugin.json`, `.codex-plugin/plugin.json` ou no campo `dama.tools` do `package.json`.
- A Dama pode oferecer a instalação do LSP detectado; Rust e Go ainda dependem dos toolchains `rustup` e `go`.
- O debugger DAP integrado nesta versão usa `debugpy`; outros adaptadores podem ser fornecidos por plugins.
- Ainda não há instalador assinado.

Veja [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) para as próximas camadas.
