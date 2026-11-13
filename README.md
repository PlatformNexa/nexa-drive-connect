# NEXA Drive Connect

Plugin autoral para **Obsidian no iPhone**: replica notas e anexos locais na **pasta `Obsidian` já existente no Google Drive**, usando a API Google Drive diretamente, sem Windows, sem servidor que armazene documentos e sem plugin de sincronização de terceiros.

## Recursos incluídos no código

- Login Google no próprio iPhone por OAuth Web + PKCE + callback estático em GitHub Pages.
- Leitura da árvore de uma pasta **selecionada por ID**, cuja identidade e nome `Obsidian` são verificados antes de sincronizar.
- Comparação em três vias (local, remoto, última versão sincronizada) com hash por arquivo.
- Sincronização de criação e edição nos dois sentidos; bloqueio de exclusões e conflitos, sem sobrescrita silenciosa.
- Prévia antes da primeira escrita, readback e backup local antes de substituir arquivos.
- Sincronização periódica opcional quando o Obsidian estiver ativo; consulta e edição offline em cópia local gerenciada.
- SecretStorage do Obsidian para credenciais, sem credenciais fixas no código; nenhum registro de conteúdo/segredos.

### O que não sincroniza

As pastas `.obsidian`, `.git`, `.trash`, `.nexa-connect-recovery`; arquivos Google Docs nativos; arquivos maiores que 20 MiB por operação. **O histórico/backup de alterações do Drive não é um backup integral do cofre.** Nenhuma exclusão é propagada automaticamente.

## Requisitos para o primeiro login

1. Ative a **Google Drive API** em um projeto próprio no [Google Cloud Console](https://console.cloud.google.com/).
2. Configure OAuth Consent Screen. Para testes, adicione sua conta como usuário de teste; para uso contínuo, observe a validade de tokens em modo Testing e eventuais exigências de verificação do Google.
3. Crie credenciais **OAuth Client ID / Web application**, com Authorized redirect URI exatamente:
   `https://platformnexa.github.io/nexa-drive-connect/callback.html`
4. Ative GitHub Pages neste repositório, publicando `main` a partir da pasta `/docs` (Settings → Pages → Deploy from a branch). Essa página apenas retorna o **código de autorização de uso único** ao esquema `obsidian://` e não armazena notas. É hospedada no GitHub (que pode ter registros de acesso); o código usa **PKCE**.
5. No Obsidian, instale o plugin por uma release aprovada no catálogo, abra Configurações → NEXA Drive Connect, informe `Client ID` e `Client Secret` no SecretStorage, faça o login e cole o link ou ID da pasta Google Drive chamada exatamente **Obsidian**.
6. Faça **prévia**, confira e aprove a sincronização inicial. Só depois habilite o modo automático.

**Importante:** o escopo OAuth `https://www.googleapis.com/auth/drive` concede à aplicação acesso potencial a toda a conta Google. O plugin restringe suas operações à pasta escolhida, mas o próprio Google **não restringe esse token à pasta**. Para primeira homologação, use uma conta de teste e uma pasta sem documentos sensíveis.

## Status de qualidade

O código compilou e passou testes **offline** de PKCE, árvore, sincronização e conflitos. **Ainda requer testes reais** de OAuth no iPhone e transferência contra pasta Google de laboratório. Não significa publicação no diretório do Obsidian nem certificação de segurança. Nunca ative no acervo oficial antes dessa homologação.

```bash
node build.js
node tests/core.test.js
node tests/oauth.test.js
node tests/integration.test.js
node tests/ios.test.js
```

## Política de desenvolvimento

- Sem segredos, tokens, arquivos pessoais ou dados do Drive no repositório.
- Patches com versão, evidências e testes.
- Operações de escrita passam por preflight, backup aplicável, validação e readback.
- Para interromper a autorização, use o painel do Obsidian ou [Google Account permissions](https://myaccount.google.com/permissions).

## Licença

Código-fonte disponibilizado para inspeção, com direitos reservados. Veja LICENSE. Nenhum conteúdo privado do NEXA integra esta distribuição.