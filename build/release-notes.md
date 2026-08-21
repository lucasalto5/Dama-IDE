# Dama 0.13.0 — contexto leve e ferramentas profissionais

- Conversas e execuções longas agora compactam o histórico técnico automaticamente, mantendo as etapas recentes completas e evitando que o agente fique pesado com o tempo.
- O editor libera da memória os arquivos e notas que já foram fechados, corrigindo o acúmulo causado pelo Monaco ao navegar por muitos arquivos.
- Servidores LSP permanecem ativos por projeto e recebem `didOpen`, `didChange`, `didSave` e `didClose`, deixando consultas e diagnósticos muito mais rápidos.
- Novas ferramentas estruturadas para busca semântica local, requisições HTTP, comparação de screenshots, substituição em vários arquivos e comparação entre branches.
- Auditoria de dependências, lint, formatação, type-check, coverage, código morto, build, CI, deploy e integrações com GitHub/GitLab passam a ter operações próprias no agente.
- Variáveis de ambiente podem ser administradas com autorização sem revelar os valores no histórico do chat.
- A aba Git agora permite comparar branches e criar, restaurar ou remover checkpoints manuais.
- O comando `/comparar-planos` permite analisar abordagens alternativas antes de escolher uma execução.
- Corrigida a identificação da ponte interna após atualizar o aplicativo.
