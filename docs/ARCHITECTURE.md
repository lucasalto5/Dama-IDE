# Arquitetura da Dama

## Processo desktop

O processo principal do Electron é a fronteira de segurança. Ele mantém a raiz do workspace e oferece operações pequenas por IPC. O renderer não recebe acesso a `fs`, `child_process` ou às credenciais do sistema.

## Workspace

Já implementado:

- seleção de uma pasta;
- validação contra fuga da raiz;
- árvore de arquivos com limites;
- leitura e salvamento de texto;
- busca limitada por tamanho e quantidade.

O editor usa Monaco e seus workers locais para sintaxe, linhas, rolagem e diagnósticos básicos. O agente também pode iniciar um LSP externo instalado para símbolos, definição, referências, hover, diagnósticos e renomeação semântica. Próximo passo: watchers de filesystem e abas múltiplas.

## Agent Runtime

O runtime escolhe entre dois caminhos:

1. Pedidos pequenos, claros e reversíveis — inclusive continuações e ajustes normais dentro do contexto atual — recebem um escopo interno e entram diretamente no loop de ferramentas. Uma regra determinística corrige respostas excessivamente cautelosas do orquestrador quando o pedido é curto, possui até três etapas compactas e não envolve risco elevado.
2. Pedidos amplos, ambíguos ou de maior risco devolvem um plano estruturado para aprovação antes do mesmo loop.

As gravações são restritas aos arquivos declarados no plano. Ferramentas elevadas entram no mesmo loop, mas pausam em um card explícito. A pessoa pode negar, permitir uma vez, permitir a categoria durante o chat ou projeto, ou persistir a operação exata globalmente. Todas as permissões persistidas podem ser revogadas nas configurações.

O roteamento pode operar em modo de modelo único ou equipe. No modo único, o perfil principal atende Chat, planejamento, execução e revisão. No modo equipe, as chamadas são distribuídas entre Orquestrador, Programador e Revisor, com retorno automático dos problemas concretos ao Programador. A pessoa pode limitar a revisão entre zero e três rodadas; os modelos de fallback continuam sendo tentados na ordem configurada se o responsável por uma função falhar.

O núcleo oferece exploração e busca do workspace, recuperação de contexto, stack, regras locais, ambiente, dependências, segurança, diagnósticos, Git completo, testes estruturados, DAP, criação e edição localizada, patch, cópia, movimentação, renomeação, Preview, Terminal/PTY, pacotes, downloads, exclusões, arquivos compactados, navegador automatizado, busca web com fontes, LSP, MCP, plugins e agentes de CLI. Caminhos são validados para impedir fuga do projeto. Leitura e navegação isoladas não pedem autorização; execução de código, mutações e envio de dados pedem.

Antes de entrar no renderer, todo plano é normalizado: título, resumo, etapas, arquivos, comandos e riscos recebem tipos e valores seguros. Uma barreira de erro no workspace impede que respostas inesperadas deixem a janela vazia.

O renderer mantém um feed conversacional por projeto e assina eventos progressivos do processo principal. Mensagens, revisões do mesmo plano e comentários contextuais aparecem na ordem cronológica. Eventos técnicos consecutivos são compactados em resumos expansíveis; a lateral mantém uma visão mais técnica do estado corrente. A espera pela API é separada das ferramentas reais e recebe heartbeats com tempo decorrido. Orientações enviadas durante planejamento ou execução entram na fila do run ativo e são incorporadas no próximo ciclo do modelo. Próximo passo: aplicação ou recusa por hunk, compactação de contexto e cancelamento.

Cada execução que grava arquivos cria um change set em `dama-change-sets`, no diretório privado do aplicativo. O registro guarda o conteúdo anterior e posterior somente no computador local, fornece diff por arquivo e permite aceitar sem nova gravação ou recusar restaurando o snapshot. Continuações executadas enquanto o change set ainda está pendente herdam o snapshot original e produzem um novo registro combinado, de modo que a recusa restaura o estado anterior à primeira alteração da sequência. Antes de restaurar, o processo principal confirma que o arquivo ainda corresponde à saída do agente; alterações posteriores causam conflito e nunca são sobrescritas silenciosamente.

## Projetos e conversas

Pastas abertas são registradas em `dama-workspace.json`, no diretório privado de dados do aplicativo. Quando o histórico local está ativo, cada conversa salva mensagens, planos, eventos e resultados vinculados ao projeto. O gerenciador permite retomar projetos, alternar entre chats, começar uma conversa limpa e excluir um histórico sem apagar os arquivos do projeto.

## Connectors

Ativos:

- API direta compatível com `/chat/completions`;
- NVIDIA NIM com normalização explícita do endpoint `/v1/chat/completions`;
- modelo local servido por Ollama, LM Studio ou equivalente.
- perfis múltiplos, teste obrigatório, modelo principal, funções, revisão iterativa e fallback.
- repetição configurável de chamadas temporariamente indisponíveis, com backoff, fallback a cada rodada e modo ilimitado opcional;
- classificação de falhas permanentes para não repetir token inválido, modelo inexistente ou cota esgotada, com mensagem específica para limite/créditos.

Pendente:

- Responses API;
- Anthropic Messages e Gemini sem camada de compatibilidade;

## Perfil e configurações

O onboarding grava somente preferências de experiência: nome local, finalidade, nível de detalhe e política de aprovação. A central de configurações usa o mesmo documento local para comportamento do agente, aparência, privacidade, MCPs e plugins.

Tokens de modelos são cifrados com `safeStorage` antes de entrar no documento. O renderer recebe apenas metadados e nunca recebe o token persistido. Se o cofre seguro não estiver disponível, modelos autenticados são testados, mas não são salvos.

Os registros de MCP representam configuração real. O processo inicia a conexão stdio ou HTTP somente quando uma ferramenta MCP é autorizada e fecha sessões stdio ao concluir. Plugins habilitados podem declarar ferramentas executáveis; cada chamada de código do plugin exige autorização e recebe argumentos por JSON no stdin.

## Terminal e preview

O terminal comum inicia um processo confirmado, transmite saída e erro, informa o código final e permite interrupção. O runtime agêntico usa `node-pty` para manter sessões PTY/ConPTY persistentes por projeto, com escrita e leitura progressiva. Comandos reconhecidos como servidores são promovidos automaticamente para uma sessão persistente, enquanto comandos finitos possuem encerramento forçado e retorno garantido quando excedem o timeout. O preview identifica um script `dev`, inicia o processo e captura a URL local anunciada. Sites estáticos recebem um servidor HTTP interno preso a `127.0.0.1`. Depois de uma execução que altera arquivos visuais de um projeto web, o runtime inicia o preview automaticamente; tarefas sem efeito visual não criam processos desnecessários.

Próximo passo: abas visuais para múltiplas sessões PTY, detecção de portas, healthcheck e gestão avançada de processos por projeto.

## Git

A aba Git e o agente suportam status, branches, criação e troca de branch, stage, unstage, commit, pull, push, stash, merge, conflito, abort, revert e restore. Operações com maior risco recebem confirmação adicional.

## Sequência recomendada

1. Abas e watcher de arquivos.
2. Aprovação ou recusa por hunk nas alterações do agente.
3. Streaming e cancelamento das chamadas do modelo.
4. Marketplace, isolamento por processo e assinatura de plugins.
5. Mais provedores nativos de busca e cache de fontes.
6. DAP para JavaScript, Rust e Go sem depender de plugins.
7. UI dedicada para suítes de teste e sessões de depuração simultâneas.
8. Assinatura de código do instalador.
