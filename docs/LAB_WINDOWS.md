# NEXA Drive Connect — Teste real no Windows (LAB 1.1.0)
**Este pacote é experimental.** Não instale no cofre oficial; não aponte para a pasta oficial `Obsidian` do Google Drive.
## 1. Baixe o pacote de teste
No GitHub, abra Actions → execução da branch `feature/windows-desktop`, procure Artifacts → **NEXA-Windows-Lab-Cofre**. O GitHub baixa um ZIP de artefato contendo `NEXA_WINDOWS_LAB.zip`; extraia o ZIP interno. A pasta resultante `NEXA_WINDOWS_LAB` já inclui `.obsidian/plugins/nexa-drive-connect/main.js`, `manifest.json` e uma nota de laboratório. No Windows, extraia dentro de uma pasta **local que não seja gerenciada pelo OneDrive nem pelo Google Drive para computador**.
## 2. Crie uma pasta de laboratório no Google Drive
Abra https://drive.google.com/ e crie uma pasta **NEXA_DRIVE_CONNECT_LAB** (nome exato). Ela deve ser uma pasta nova, separada da sua pasta oficial `Obsidian`. Você poderá excluir essa pasta de teste após homologação. Copie o link de compartilhamento/caminho dessa pasta ou o ID mostrado na URL. O candidato **recusa qualquer pasta cujo nome não seja exatamente `NEXA_DRIVE_CONNECT_LAB`**.
## 3. Abra o cofre no Obsidian Windows
No Obsidian → Gerenciar cofres → **Abrir pasta como cofre** → selecione `NEXA_WINDOWS_LAB` extraída. Vá em Configurações → Plugins da comunidade, habilite os plugins de terceiros e ative **NEXA Drive Connect** já presente no diretório local. A versão exibida deve ser **1.1.0**. O plugin funciona dentro do Obsidian; não instala executável nem serviço em segundo plano.
## 4. Login controlado
Em Configurações → NEXA Drive Connect LAB, informe o **OAuth Client ID** do projeto Google Cloud já configurado. Não informe Client Secret. Clique em **Autorizar Google** e faça login com uma conta adicionada à lista de usuários de teste do Google Cloud. A API solicita escopo `drive`, com acesso potencial ao Drive inteiro, embora o candidato bloqueie operações de sincronização em pastas que não tenham o nome de laboratório. Teste somente com dados fictícios. **Se o Google rejeitar a troca de código**, interrompa o teste e envie o erro; não coloque Client Secret no repositório nem no plugin.
## 5. Primeira sincronização
Cole o ID da pasta `NEXA_DRIVE_CONNECT_LAB`. Mantenha **Sincronização automática desabilitada**. Execute **Analisar alterações**, revise a lista e confirme somente se houver **apenas arquivos de laboratório**. Confira no Drive que `INICIO_NEXA_WINDOWS_LAB.md` surgiu e que o conteúdo corresponde ao local. Crie outra nota de teste no Drive ou em um segundo cofre de laboratório e confira o download. Então poderá habilitar sincronização automática para verificar os eventos de retomada.
## 6. Pare nos seguintes casos
Conflitos ou erros na prévia; arquivos reais no plano; falha de login; alteração no Drive que não foi solicitada; discrepância de hashes; arquivos de laboratório faltando; nota aberta não atualizada; qualquer confusão de pastas. **Não tente consertar ativando Drive Sync**.
## Limitações conhecidas
- Testes automatizados não substituem homologação com Google/Obsidian.
- O login OAuth de cliente Web com PKCE sem client_secret ainda não foi comprovado em dispositivo real.
- Quando a nota Markdown estiver aberta, a atualização automática é adiada por segurança para evitar sobrescrever o buffer do editor.
- Sem atualização em background com Obsidian fechado.
- O GitHub Actions gera o pacote temporário por 14 dias, sem publicar outra release ou interferir na revisão do iPhone 1.0.1.

## Comparação de versões (experimental)
Se uma mesma nota for alterada nas duas pontas, abra **Analisar alterações → Comparar versões**. A janela mostra o texto do aparelho e o texto do Drive; depois você escolhe qual preservar como principal ou mantém ambas em backups para decidir depois. Para resolução, feche a nota Markdown no editor; o plugin não substitui uma nota aberta. **Teste somente com arquivos fictícios.**

### Linhas modificadas
O botão **Comparar versões** agora exibe as linhas da cópia local e as do Drive lado a lado, com os símbolos +, − e ≠ e cor de fundo quando aplicável. Se o arquivo for grande, a interface não simula uma comparação parcial como se fosse integral: informa o limite e permite preservar as duas versões.
