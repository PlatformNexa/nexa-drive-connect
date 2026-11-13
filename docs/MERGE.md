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
