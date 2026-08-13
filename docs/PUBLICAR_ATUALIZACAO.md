# Publicar uma atualização da Dama

A Dama consulta este canal estável:

`https://github.com/lucasalto5/Dama-IDE/releases/latest/download`

Para que computadores já instalados recebam a atualização, a release e seus artefatos precisam estar públicos. O repositório `Dama-IDE` contém o cliente source available sob PolyForm Perimeter 1.0.1; servidores, pesos, credenciais e o payload privado da Dama AI não fazem parte dele.

## Processo

1. Atualize a versão em `package.json` e as notas em `build/release-notes.md`.
2. Execute `npm run package:win`.
3. Execute `npm run verify:update`.
4. Crie uma nova GitHub Release com a mesma versão, por exemplo `v0.10.2`.
5. Anexe, sem renomear:
   - `release/Dama-Setup-0.10.2.exe`
   - `release/Dama-Setup-0.10.2.exe.blockmap`
   - `release/latest.yml`
6. Publique a release como `Latest`.

Ao enviar uma tag `v*`, o workflow `.github/workflows/release.yml` executa estas etapas e publica os três artefatos automaticamente.

O `latest.yml` contém o tamanho e o SHA-512 do instalador. O atualizador verifica esses dados antes de aplicar a versão baixada.

## Comportamento nos computadores

- Atualização automática ativada: ao abrir a Dama, aparece uma tela limpa com notas e progresso. Ao terminar, a Dama reinicia e instala silenciosamente.
- Atualização automática desativada: aparece o aviso com notas da versão e as opções para baixar ou deixar para depois.
- Se o servidor estiver fora do ar, a IDE continua abrindo normalmente e mostra o erro apenas em Configurações → Atualizações.

Antes de uma distribuição pública, assine digitalmente o instalador do Windows. A assinatura evita alertas do SmartScreen e garante a identidade do publicador.
