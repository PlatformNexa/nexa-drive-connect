# NEXA — Merge de três vias (em QA)
## Regra
A referência é a última versão sincronizada e validada (ancestral), e não apenas a versão mais recente do Google Drive. O NEXA guarda uma cópia local verificável por MD5 em `.nexa-connect/merge-base/<md5>.txt` para arquivos Markdown com até 256 KiB. A pasta é excluída da sincronização.
## Quando unir
Somente se o mesmo arquivo `.md` foi alterado nos dois lados, o ancestral existe e passa no hash, ambas as versões são UTF-8 válidas, o texto cabe nos limites definidos, as edições afetam linhas/trechos independentes, e o resultado é determinístico. O plano exibe `MERGE_UPDATE` antes de aplicar.
## Quando bloquear
Edições sobrepostas ou adjacentes ambíguas, alterações sem ancestral, linhas enormes, Unicode inválido, anexos/binários, arquivo acima do limite e alterações após a prévia. Não inventa reconciliação por IA e não escolhe silenciosamente um dos lados.
## Proteção
Antes de aplicar merge, preserva backups locais e remotos, confere hash de ambas as fontes, grava no Drive e valida metadata MD5, grava localmente e valida leitura, então persiste a base para futuros merges.
**Aviso**: a API Drive + sistema de arquivos não oferecem transação distribuída atômica. Falhas entre escrita remota e local são bloqueadas e exigem inspeção das cópias e do histórico. Outro dispositivo pode atualizar o mesmo arquivo durante uma operação: precisa de testes reais de concorrência antes de homologação.
## QA
Testes automatizados abrangem conflitos sobrepostos/disjuntos, falta de ancestral, segurança de dados de origem e backups. Ainda precisa de homologação real Windows/iOS/Drive. Não mesclar à main durante revisão da 1.0.1.


### Retomada após falha parcial
O motor preserva o backup do primeiro envio interrompido e cria um nome distinto ao repetir a operação no mesmo milissegundo. O novo arquivo é verificado por leitura e hash; nenhum backup anterior é apagado nem sobrescrito. Em caso de alteração remota efetivada antes da falha, o NEXA deve reconsultar o Drive e bloquear/conciliar, nunca assumir que a primeira tentativa não gravou.


## Resolução manual por prévia — candidato LAB
Quando um Markdown ou outro arquivo apresentar `ALTERACAO_CONCORRENTE` ou `PRIMEIRA_SINC_DIVERGENTE`, a janela de prévia traz o botão **Comparar versões**. O painel apresenta o conteúdo **local** e o conteúdo **Google Drive** lado a lado, com hashes; documentos não textuais ou acima de 256 KiB mostram somente identificação/hash, não conteúdo. O usuário tem três escolhas, com confirmação separada:
1. **Usar versão local**: copiar a versão local para o Drive, sem apagar seu backup remoto.
2. **Usar versão do Drive**: substituir a cópia local, sem apagar seu backup local.
3. **Preservar ambas**: criar dois backups e deixar o conflito pendente, sem escolher versão oficial.

Antes de qualquer opção, o motor consulta novamente o Drive e o cofre local e compara hashes/ID, guarda cópias independentes das duas fontes em `.nexa-connect-recovery` e só então altera o destino. A nota aberta é bloqueada para evitar perda de buffers. A resolução não é atômica em nível de Google Drive. **Esta interface está em QA e ainda não foi validada em dispositivo físico.** Não ativar no acervo oficial.

### Preview com diferenças destacadas (LAB)
A interface apresenta duas colunas com número da linha e indicação textual +, − ou ≠, realçando os trechos alterados sem inserir HTML ou executar conteúdo das notas. A prévia visual limita-se a 350 linhas e 90.000 caracteres por versão; se ultrapassar os limites, o sistema informa a impossibilidade do preview detalhado e mantém ambas as versões protegidas. A escolha de versão e a verificação de concorrência continuam independentes do preview. Em QA físico.
