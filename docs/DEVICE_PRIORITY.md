# NEXA Drive Connect — Ativação automática do dispositivo (proposta V2)
> Estado: **ESPECIFICAÇÃO DE ARQUITETURA; NÃO IMPLEMENTADA NEM VALIDADA EM DISPOSITIVOS REAIS.**
> Atualiza/sobrepõe a proposta anterior de prioridade solicitada manualmente. A release iOS 1.0.1 em `main` não foi alterada.

## Decisão alinhada (2026-11-13)
- O usuário alterna entre Windows, iPhone e iPad e **não pretende editar ativamente os mesmos documentos em dois dispositivos ao mesmo tempo**.
- A mera presença de dois ou mais dispositivos conectados **não** gera um alerta nem um diálogo de solicitação de prioridade.
- Ao **retomar** um dispositivo, o NEXA compara seu cofre com a última versão confirmada do Google Drive e **atualiza automaticamente os arquivos que possam ser atualizados com segurança**.
- Alterações feitas localmente são enviadas ao Drive automaticamente quando o Obsidian está ativo e a sincronização está habilitada, respeitando debounce, verificação de versão e conflitos.
- O Google Drive continua sendo o ponto de coordenação; não há programa independente na bandeja do Windows.
- Se um dispositivo estava offline e tem alterações locais, **nunca baixar a versão remota por cima dessas alterações**. Executar reconciliação/merge de três vias se demonstravelmente seguro; senão bloquear, preservar ambas as versões e alertar objetivamente.

## Definições
- **Conectado/cadastrado**: credenciais e configuração presentes em uma instalação, mesmo que o Obsidian esteja fechado.
- **Ativo**: o usuário passou a interagir com o Obsidian naquele dispositivo (foco, retorno ao app, abertura de nota). Não implica que outros aparelhos estejam offline.
- **Prioridade automática**: *preferência operacional* pelo aparelho em uso; **não** é um lock exclusivo e não concede direito de sobrescrever conteúdo remoto.
- **Atualizado**: as alterações do Drive foram conferidas e aplicadas no cofre local, com readback/hash; *não* é suficiente obter uma resposta de API sem validar arquivos.
- **Sincronizado**: operações pendentes de download/upload concluídas e novas bases registradas; não confundir com “verificou atualizações”.

## Fluxo principal esperado
1. Windows está ativo: após alterações locais, NEXA sincroniza com Google Drive (depois de uma janela curta de inatividade; não uma solicitação por tecla).
2. iPhone fica aberto porém em segundo plano/inativo: não solicita prioridade, não altera arquivos desnecessariamente.
3. Usuário retoma o iPhone: NEXA detecta foco/retorno ao aplicativo (quando permitido pelo sistema), inicia **checagem remota imediatamente**, com debounce e limites de requisições.
4. Enquanto consulta, apresentar estado claro ("Verificando atualizações"), sem prometer que a leitura do editor já está atualizada. Se houver nota ativa modificada/dirty, evitar sobrescrever conteúdo não persistido.
5. Se a cópia local do iPhone não tem alterações próprias, baixar a versão atual e validar. Se tiver alterações locais, usar versão ancestral e merge conservador ou solicitar revisão.
6. Após a reconciliação, o iPhone pode começar a enviar suas próprias alterações. Quando o Windows retomar, repetirá a mesma sequência.
7. Sem rede: continuar editando localmente e indicar "Offline, alterações pendentes". Na reconexão, não assumir que o Drive ainda contém o antigo baseline.

## Gatilhos recomendados no Obsidian (todos a validar)
- `workspace.on('file-open')`: ao abrir/trocar nota;
- retorno a foco via `window focus`, `document visibilitychange` e eventos de retomada efetivamente suportados;
- `vault.on('modify')`: upload com debounce após escrita local, nunca chamada de API por tecla;
- temporizador de fallback enquanto o Obsidian estiver ativo, com intervalo ajustável;
- após reconexão à internet, revalidar o estado remoto;
- opcional: API Google Drive v3 `changes.getStartPageToken`/`changes.list` para consultas incrementais, filtradas à pasta selecionada e com cursor persistente por conta/cofre. Ver https://developers.google.com/workspace/drive/api/guides/manage-changes

## Guarda contra perda de dados
- Nenhum novo dispositivo sobrescreve o conteúdo local do editor apenas por ter ficado ativo.
- Não atualizar automaticamente uma nota com edições locais pendentes ou com buffer do editor não comprovadamente persistido.
- Merge de três vias apenas quando ancestral válido, integridade, limites e edições disjuntas comprovados; backups e readback obrigatórios.
- Se arquivo remoto mudar durante a operação, bloquear e replanejar. Não afirmar atomicidade no Drive sem mecanismo verificado; conflitos de rede e concorrência continuam possíveis.
- O dispositivo pode ter mais de um cofre; a instalação do plugin é configurada por cofre. Um cofre não sincroniza outro por acidente.
- Inicialização ou reabertura não autoriza primeira sincronização destrutiva: exigir o primeiro vínculo e a conferência explícita já prevista.

## UX esperada
- Uso normal: sem popup de "assumir prioridade".
- Indicador discreto: **Atualizado**, **Verificando**, **Sincronizando**, **Offline**, **Aguardando resolução de conflito**.
- Se um outro dispositivo alterou o acervo, baixar automaticamente as mudanças seguras e notificar com discrição apenas se relevante.
- Se o usuário tentar editar antes de acabar a verificação, não afirmar que o arquivo está atualizado. Para garantia rigorosa “antes de editar”, implementar barreira de edição/abertura suportada ou aviso aguardando atualização; eventos de foco sozinhos não garantem bloqueio da edição.
- Falhas: distinguir "atualização remota pendente", "alteração local pendente", "conflito" e "erro de rede".

## Testes mínimos
1. Somente Windows ativo; iPhone e iPad cadastrados mas fechados.
2. Editar no Windows, sincronizar; abrir iPhone após 1 hora e confirmar download validado.
3. Alternar iPhone → Windows após edição e upload.
4. Windows e iPhone abertos; apenas um efetivamente manuseado; nenhuma pergunta sobre prioridade.
5. Foco e abertura de arquivo em sucessão rápida, com deduplicação/redução de consultas.
6. Em outro aparelho, começar a editar antes do fim da consulta de atualização: nunca sobrescrever buffer.
7. Offline no iPhone com alterações locais + edição remota no Windows: merge seguro ou bloqueio.
8. Mesma linha alterada, anexos binários, exclusões, arquivos grandes, expiração de token.
9. iOS suspenso e retomado; Windows minimizado ou fechado: distinguir atividade de disponibilidade.
10. Falhas de escrita entre remoto e local; backups e readback após recuperação.

## Estado de implementação
- **Disponível hoje na branch**: sync conservadora, verificação de hash, baseline, merge experimental Markdown, cronômetro periódico configurável, trava de primeira aprovação.
- **Pendente**: gatilhos de atividade, indicador de verificação, checagem antes de editar, incremental changes API, demonstração real entre dispositivos, garantia de preservação de buffers não salvos.
- **Não ativar no acervo oficial** antes de testes reais de OAuth, subida/descida e recuperação.

## Cancelamento da proposta anterior
A especificação anterior de pedir manualmente a prioridade quando mais de um dispositivo está presente **não é o comportamento padrão desejado**. Manter arbitragem manual apenas para verdadeiros conflitos ou situações não reconciliáveis.


## Implementação experimental dos gatilhos (QA)
A branch registra `file-open`, `vault.modify`, `window focus` e `visibilitychange`, com debounce e limite de consultas. Só funciona após a aprovação inicial, com a mesma pasta remota. Antes de publicar ou baixar, verifica buffers Markdown abertos contra arquivos em disco. **Não substitui automaticamente uma nota Markdown aberta**: adia a atualização e informa `AGUARDANDO: NOTA_ABERTA_AGUARDA_FECHAMENTO`. Protege dados, mas ainda não garante edição imediata da nota recém-atualizada; esse requisito necessita teste real com editor. Não prometer atualização antes de digitar até haver barreira suportada.
