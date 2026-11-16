# NEXA OAuth Relay — laboratório 1.1.3

**Situação:** código pronto para avaliação automatizada. Implantação no Cloud Run e login real ainda não confirmados.

## Por que existe
O cliente OAuth atual é do tipo Aplicativo Web. O Google exige um Client Secret para trocar o código de autorização por tokens. O segredo não deve ser incluído no plugin Obsidian. Por isso, o Relay faz apenas a troca e renovação dos tokens no serviço Cloud Run da própria conta NEXA.

**O Relay não recebe nem sincroniza notas, anexos ou arquivos do Drive.** O NEXA instalado no dispositivo continua acessando a API do Drive diretamente.

## Instalação uma única vez no Cloud Shell
1. Entre no https://console.cloud.google.com/?project=nexa-drive-connect com a conta administradora do projeto.
2. Abra o Cloud Shell pelo ícone de terminal na barra superior do Google Cloud.
3. Cole os comandos abaixo no terminal (nenhuma credencial no comando).
```bash
git clone --single-branch --branch feature/windows-desktop https://github.com/PlatformNexa/nexa-drive-connect.git
cd nexa-drive-connect/oauth-relay
bash setup-cloud-shell.sh
```
4. Leia o aviso sobre possíveis custos. Digite **INSTALAR** apenas se concordar em habilitar Cloud Run, Cloud Build, Artifact Registry e Secret Manager.
5. O script pede o Client ID (público) e o Client Secret (digitado sem aparecer na tela) do **mesmo cliente Web** que já usamos.
6. Ao finalizar, mostrará **Endereço do Relay** e **Chave privada do Relay**. Cole esses dois valores no plugin LAB 1.1.3. Não compartilhe a chave em mensagens nem capturas.
7. Autorize o Google novamente no Obsidian, abra **Verificar autenticação** e confirme o estado **AUTORIZADO**.

## Proteções
- O Client Secret e a chave de acesso ficam no Secret Manager; a chave também é armazenada localmente no SecretStorage do Obsidian.
- O Relay tem uma conta de serviço Cloud Run dedicada com acesso apenas aos segredos específicos.
- O endpoint de troca e renovação exige chave; o domínio, o cliente OAuth e o redirect URI são fixados.
- Apenas duas operações: código de autorização e renovação de token. Limites de tamanho, concorrência e taxa por instância.
- Respostas não-cacheáveis, erros sanitizados, sem gravar tokens ou arquivos no serviço.
- O endereço do serviço é público, protegido pela chave compartilhada. A chave deve ser preservada e rotacionada se exposta.
- Esta versão de laboratório aceita apenas domínios .run.app; não conecta a endpoints HTTPS arbitrários.

## Limitações e cautelas
- Cloud Run/Secret Manager/Cloud Build podem gerar cobranças; o script exige aprovação.
- O limite de taxa por processo não é distribuído entre instâncias e não substitui proteções adicionais para produção.
- A senha do Google e os tokens não devem aparecer no chat. Não enviar capturas contendo o segredo ou a chave do Relay.
- Em modo External Testing, o Google pode exigir reautorização periódica.
- Não ative a sincronização automática nem faça alterações no acervo oficial durante os testes.
- O script recusa sobrescrever um serviço já criado; atualizações e rotação de chave precisam de processo separado.

**Estado de QA: EXECUTADO / AGUARDANDO TESTE REAL GOOGLE E BACK-CHECK.**