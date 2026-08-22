# Dama 0.14.0 — catálogo NVIDIA e seleção automática

- Nova aba NVIDIA em Modelos, com catálogo carregado diretamente dos modelos disponíveis para a sua chave.
- O token NVIDIA agora é validado e protegido uma única vez pelo Windows; todos os modelos NVIDIA reutilizam a mesma credencial.
- Filtros por programação, agente, raciocínio, chat e velocidade, além de busca pelo nome ou identificador.
- Cada modelo recebe tags e uma nota de afinidade com a Dama baseada nas capacidades publicadas; não é apresentada como benchmark oficial.
- Seleção múltipla permite testar e adicionar vários modelos de uma vez para formar uma equipe ou cadeia de fallback.
- Novo modo Automático escolhe o modelo por função, capacidade, latência medida neste computador e histórico real de sucessos e falhas.
- Modelos lentos ou com falhas recentes são temporariamente rebaixados, mantendo os demais disponíveis como fallback.
- A configuração manual da NVIDIA também reutiliza o token central salvo quando o campo da chave fica vazio.
