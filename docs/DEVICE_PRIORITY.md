# NEXA Drive Connect — Prioridade do dispositivo ativo (proposta V2, em design/QA)

> Estado: **PROPOSTA DE ARQUITETURA**. Não implementada nem homologada no runtime. Isolada na branch `feature/windows-desktop`. Não afeta a release móvel `1.0.1` em revisão.

## Intenção do usuário
Se apenas um dispositivo estiver utilizando o mesmo cofre sincronizado, ele deve trabalhar sem perguntas. Se houver dois ou mais dispositivos ativos, antes de publicar alterações potencialmente concorrentes o plugin pode pedir **prioridade temporária ao dispositivo que o usuário está manuseando**. O dispositivo prioritário pode concluir a sincronização enquanto os demais aguardam para publicar; depois todos reconciliam com a mesma origem no Google Drive.

## Semântica (terminologia obrigatória)
- **Cadastrado**: dispositivo já autorizou o Drive. Não prova conexão, atividade nem abertura do Obsidian.
- **Online**: capaz de comunicar-se com o Drive agora. Não é sinônimo de editor ativo.
- **Ativo**: sessão Obsidian em uso recente (foco/interação observados), quando o sistema operacional permite detectar.
- **Prioritário**: sessão com concessão temporária de oportunidade de publicar alterações.
- **Trava/lock**: somente deve ser chamada de trava *exclusiva* se a implementação conseguir verificar atomicidade e exclusão mútua de ponta a ponta; até lá é **coordenação cooperativa / prioridade consultiva**.

## Jornada desejada
1. Cada instalação tem identidade própria de dispositivo, criada localmente, e identidade de sessão efêmera.
2. O Google Drive mantém o registro compartilhado de presença/estado, com heartbeats esparsos, `last_seen`, `expires_at`, `device_id`, `session_id` e `generation`, sem conteúdo de notas ou tokens.
3. Um único dispositivo ativo => sincronização sem diálogo, sujeitos aos preflights e merge.
4. Múltiplos dispositivos ativos com risco de escrita => popup discreto: «Assumir prioridade neste dispositivo», «Aguardar», «Continuar editando offline».
5. Se concedida, prioridade tem vencimento curto (ex.: 120 s) e renova em atividade recente; perde-se ao fechar, desativar ou expirar. Expiração é aferida com tolerância para relógios, latência e suspensão do iOS.
6. Outros dispositivos podem continuar editando localmente e lendo atualizações seguras; suas publicações remotas são suspensas até reconciliar.
7. Depois de liberar, outro dispositivo baixa/mescla a versão atual; somente publica após checar versões e conflitos.
8. Se dois dispositivos solicitam simultaneamente, não há seleção silenciosa por horário local ou pela última gravação. Revalidação obrigatória e eventual arbitragem explícita.
9. Ausência de contato com o serviço de coordenação => **não publicar automaticamente** operações cuja segurança dependa da exclusividade. Permitir edição local e tentativa posterior.
10. Permitir «Liberar prioridade agora»; mostrar «Prioridade: Windows» e estado de espera, sem notificações repetidas.

## Prioridade NÃO substitui controle de versão
A prioridade estabelece uma **ordem preferencial de publicação**, não confere ao detentor o direito de sobrescrever conteúdo concorrente. Para cada arquivo:
- comparar baseline ancestral local, estado atual local, hash/versão do Drive;
- revalidar estado remoto imediatamente antes de cada escrita;
- executar merge de três vias somente para edições comprovadamente independentes;
- para sobreposições, versões inacessíveis, transações interrompidas e binários: guardar versões, bloquear escrita e solicitar decisão;
- nunca destruir edições anteriores por «prioridade mais alta».

## Restrições reais do Google Drive
A API do Drive suporta metadados de arquivos e mudanças, mas o projeto **ainda não demonstrou um mecanismo server-side de compare-and-swap/lock atômico** para controlar concorrência entre instâncias. Uma leitura seguida de escrita (read-check-write) não oferece, isoladamente, exclusão mútua. Não prometer «lock garantido» sem ensaio de duas sessões concorrentes, verificação da documentação oficial e implementação validada. Se a API direta não oferecer a garantia exigida, usar coordenação cooperativa com bloqueios conservadores; avaliar coordenador transacional apenas se autorizado e necessário.

Para reduzir escopo adicional de OAuth, um arquivo de coordenação sob a pasta remota selecionada (por exemplo, `.nexa-connect/coordination.json`) é alternativa **a validar**; o acervo deve continuar ignorando esta área na varredura de notas e ela não pode ser tratada como documento do usuário. `appDataFolder` exigiria checagem de escopo e de identidade do app/OAuth. Não armazenar secrets, conteúdos de notas, dados pessoais desnecessários.

## Testes de aceitação previstos
- 1 dispositivo online e ativo, 2 cadastrados offline: sem prompt e sem bloqueio indevido.
- Windows ativo, iPhone aberto inativo: não monopolizar prioridade.
- Windows e iPhone ativos: uma única sessão publica por vez; a outra aguarda/reconciliará.
- Pedidos simultâneos, atraso de API, alteração durante upload e retomada após perda de rede.
- iOS suspenso/crash, relógios divergentes, heartbeat perdido: prioridade expira; nunca fica travada permanentemente.
- Falhas de leitura do estado de coordenação: fail-closed para envios sob risco, preservando edição local.
- Merge independente e conflito na mesma linha; binários; exclusão; troca de pasta/cofre.
- Sem aviso recorrente durante trabalho normal, respeitando configurações manuais.

## Dependências
`docs/MERGE.md` e segurança de revalidação no motor `src/sync.js`. O modo de coordenação deve ser opcional/desabilitado por padrão até QA com **dispositivos reais**. 

**Estado de homologação:** não implementado; sem teste real Google Drive/Windows/iOS. Nunca habilitar no acervo oficial somente por causa deste documento.
