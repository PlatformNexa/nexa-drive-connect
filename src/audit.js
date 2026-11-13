/* NEXA Drive Connect / Auditoria local sem rede, sem escrita, sem OAuth. */
const NEXA_AUDIT = (() => {
  'use strict';
  const MAX_FILE_SIZE = 5 * 1024 * 1024;
  async function inventory(vault) {
    const list = []; const skipped = [];
    const files = vault.getFiles();
    for (const file of files) {
      let path;
      try {
        path = NEXA_CORE.normalizePath(file.path);
        if (!NEXA_CORE.allowedPath(path)) { skipped.push({path, reason:'EXCLUIDO_POR_POLITICA'}); continue; }
      } catch (e) { skipped.push({path:String(file.path), reason:'CAMINHO_INVALIDO'}); continue; }
      const size = Number(file.stat?.size ?? 0);
      if (!Number.isFinite(size) || size > MAX_FILE_SIZE || size < 0) {
        skipped.push({path, reason:'LIMITE_TAMANHO_5_MIB'}); continue;
      }
      try {
        const data = new Uint8Array(await vault.readBinary(file));
        if (data.byteLength > MAX_FILE_SIZE) {
          skipped.push({path, reason:'LIMITE_TAMANHO_5_MIB'}); continue;
        }
        list.push({path, size:data.byteLength, md5:NEXA_CORE.md5(data)});
      } catch (e) {
        skipped.push({path, reason:'ERRO_LEITURA'});
      }
    }
    const collisions = NEXA_CORE.detectCollisions(list);
    return {files:list, skipped, collisions, scanned:files.length};
  }
  return {inventory, MAX_FILE_SIZE};
})();