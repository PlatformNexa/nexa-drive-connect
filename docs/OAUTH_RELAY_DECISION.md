# ADR — OAuth Relay para NEXA Drive Connect

**Estado: candidato LAB 1.1.3, implementação + testes automatizados; não mesclado à main.**

Em 16/11/2026, o retorno OAuth do Google chegou ao Obsidian, mas a troca do código foi rejeitada com `HTTP 400 invalid_request [CLIENT_SECRET_REQUERIDO]`. O cliente configurado é do tipo Aplicativo Web. PKCE não substitui o Client Secret nesse tipo de cliente.

## Decisão
Manter o callback HTTPS já funcional no GitHub Pages e validação local de state+PKCE. Criar serviço Cloud Run com Client Secret somente no Secret Manager. O plugin se autentica ao serviço com chave própria de laboratório guardada no SecretStorage. O Relay não recebe notas; apenas autentica a troca do código OAuth e a renovação de tokens.

## Restrições
- Nenhum segredo Google dentro do código distribuído, GitHub, data.json do Obsidian ou desta conversa.
- Relay publicamente acessível via HTTPS exige chave; comprometer a chave permite uso indevido do Relay. Rate limit simples não é proteção de produção.
- O plugin pode continuar tendo escopo Drive amplo. A restrição de pasta LAB depende do código do plugin; não é imposta pelo Google.
- Cloud Run não está criado automaticamente. Requer intervenção explícita da conta administradora e possível faturamento.
- Não declarar login ou sincronização homologados até teste real com Google e Obsidian.
- Nenhuma alteração na versão estável 1.0.1 enquanto a branch LAB está em avaliação.

Mais informações: oauth-relay/README.md.