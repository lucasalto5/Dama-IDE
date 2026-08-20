# Dama 0.12.4 — planos flexíveis

- O plano agora orienta a execução sem limitar rigidamente quais arquivos podem ser alterados.
- Se um arquivo necessário não estiver citado no plano, a Dama poderá incluí-lo e continuar o trabalho normalmente.
- A ampliação aparece no progresso como “Arquivo necessário incluído” e também entra no conjunto de mudanças para revisão.
- Criação, edição, patches, cópias, renomeações e alterações feitas por LSP seguem a mesma regra flexível.
- Os limites reais de segurança continuam ativos: a Dama não sai da pasta do projeto e mantém protegidos arquivos de credenciais, ambiente e diretórios internos.
- Exclusões, downloads e outras ações destrutivas ou externas continuam exigindo as autorizações configuradas.
