# Dama 0.12.3 — projetos sincronizados e sessões recuperáveis

- Quem não instalou o Dama AI durante a instalação inicial agora pode adicioná-lo em Configurações.
- O componente é baixado separadamente sem exigir a reinstalação da IDE.
- O download mostra progresso e valida tamanho, origem, SHA-256 e a integridade de cada arquivo.
- A ativação é atômica: uma falha não remove uma instalação anterior funcional.
- O instalador completo continua oferecendo o Dama AI como componente opcional.
- O explorador agora acompanha automaticamente arquivos criados, removidos e renomeados no projeto.
- É possível criar um projeto vazio diretamente na Dama; a pasta nasce em Documentos\Dama Projects.
- A nova área Projetos nas configurações permite desvincular workspaces sem apagar arquivos ou conversas.
- Arquivos JSON criados pelo agente são serializados e validados antes da gravação; `[object Object]` não chega mais ao projeto.
- O agente mostra edições com mais detalhe e mantém os grupos de arquivos alterados abertos no histórico.
- Arquivos auxiliares necessários podem ser incluídos quando a própria pasta já fazia parte do plano aprovado.
- Execuções interrompidas por crash ou desligamento ganham checkpoint local com conversa, progresso, arquivos e ponto de reversão; ao reabrir, é possível retomar ou encerrar.
- Configurações → Privacidade agora oferece “Acesso total ao computador”, desligado por padrão, para dispensar cards de autorização sem remover as proteções internas de caminho e credenciais.
