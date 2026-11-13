# NEXA Drive Connect — Windows (candidato em branch separada)
## Objetivo
Obsidian Desktop no Windows ↔ pasta `Obsidian` existente no Google Drive, por API do Google. **O aplicativo Google Drive para computador não é requisito.** Cada dispositivo usa o seu próprio cofre local e a mesma pasta remota.
## O que foi implementado
- Detecção do Windows com a API `Platform` do Obsidian, mantendo suporte móvel.
- Um diagnóstico **Verificar cofre** na aba de configurações do plugin em Windows, que apenas analisa indícios no caminho local sem guardar nem transmitir o caminho.
- Trava de sincronização automática antes de uma primeira aplicação manual bem-sucedida da prévia; além de trava por mudança da identidade da pasta remota.
- Testes unitários para Windows/desktop/mobile e CI separado em branch `feature/windows-desktop`.
## Limites e segurança
O diagnóstico de caminho é **heurístico**: uma unidade virtual montada, por exemplo `G:\`, pode não ser reconhecida como sincronizada. **Não use o mesmo cofre local simultaneamente com Google Drive Desktop, OneDrive, Dropbox, iCloud ou outro sincronizador.** Prefira um cofre local próprio para testes.
A API de sincronização Google continua usando o escopo `drive`, que tem acesso potencialmente amplo, e a sincronização real no Windows ainda não passou por teste dentro do aplicativo. OAuth depende da validação do provedor, inclusive troca de código sem Client Secret.
## Próximo teste no Windows
Em um cofre de laboratório **local**, não compartilhado e sem notas oficiais, instalar temporariamente o build candidato, abrir Configurações → NEXA Drive Connect → Verificar cofre, depois validar o login OAuth e testar arquivos artificiais. Não habilitar modo automático até conferir prévia, aplicação e readback. Este código está em branch de desenvolvimento e **não foi publicado como release oficial**.

O pipeline do GitHub gera um artefato **NEXA-Drive-Connect-Windows-Candidate** com `main.js` e `manifest.json` para a homologação em um cofre local de laboratório. Não é uma release do catálogo.
