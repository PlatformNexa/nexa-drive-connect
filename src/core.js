// NEXA Obsidian Connect — deterministic, dependency-free synchronization decisions.
// Source is also runnable under Node for offline tests.
const NEXA_CORE = (() => {
  'use strict';
  const FOLDER_MIME = 'application/vnd.google-apps.folder';
  const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
  const EXCLUDED = [
    '.obsidian/', '.obsidian', '.git/', '.git', '.trash/', '.trash',
    '.nexa-connect/', '.nexa-connect', '.nexa-connect-recovery/', '.nexa-connect-recovery',
    '.DS_Store', 'Thumbs.db'
  ];
  function normalizePath(input) {
    if (typeof input !== 'string') throw new Error('Caminho não textual.');
    const p = input.normalize('NFC').replace(/\\/g, '/');
    if (!p || p.startsWith('/') || p.endsWith('/') || /[\x00-\x1f\x7f]/.test(p)) throw new Error('Caminho inválido.');
    const parts = p.split('/');
    if (parts.some(x => x === '' || x === '.' || x === '..' || x.length > 220 || /[<>:"|?*]/.test(x) || RESERVED.test(x) || /[ .]$/.test(x))) throw new Error('Caminho inseguro: ' + p);
    if (p.length > 900) throw new Error('Caminho longo demais.');
    return p;
  }
  function allowedPath(path) {
    const p = normalizePath(path);
    return !EXCLUDED.some(x => p.toLowerCase() === x.toLowerCase() || p.toLowerCase().startsWith(x.toLowerCase()));
  }
  function hex(n) { return (n >>> 0).toString(16).padStart(8, '0'); }
  // RFC 1321 MD5 (byte-oriented). Google Drive uses md5Checksum for ordinary uploaded files.
  function md5(input) {
    const data = input instanceof Uint8Array ? input : new Uint8Array(input);
    const length = data.length;
    const padded = new Uint8Array(Math.ceil((length + 9) / 64) * 64);
    padded.set(data); padded[length] = 0x80;
    const bitLenLo = (length * 8) >>> 0;
    const bitLenHi = Math.floor(length / 0x20000000) >>> 0;
    const dv = new DataView(padded.buffer);
    dv.setUint32(padded.length - 8, bitLenLo, true);
    dv.setUint32(padded.length - 4, bitLenHi, true);
    const s = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,
      5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,
      4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,
      6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
    const K = Array.from({length:64}, (_,i) => Math.floor(Math.abs(Math.sin(i+1)) * 0x100000000) >>> 0);
    let a0=0x67452301,b0=0xefcdab89,c0=0x98badcfe,d0=0x10325476;
    for (let offset=0; offset<padded.length; offset+=64) {
      let A=a0,B=b0,C=c0,D=d0;
      for (let i=0;i<64;i++) {
        let F,g;
        if (i<16) {F=(B&C)|((~B)&D);g=i;}
        else if(i<32){F=(D&B)|((~D)&C);g=(5*i+1)%16;}
        else if(i<48){F=B^C^D;g=(3*i+5)%16;}
        else{F=C^(B|(~D));g=(7*i)%16;}
        const tmp=D;
        D=C; C=B;
        const sum=(A+F+K[i]+dv.getUint32(offset+4*g,true))>>>0;
        B=(B+((sum<<s[i])|(sum>>>(32-s[i]))))>>>0;
        A=tmp;
      }
      a0=(a0+A)>>>0;b0=(b0+B)>>>0;c0=(c0+C)>>>0;d0=(d0+D)>>>0;
    }
    return [a0,b0,c0,d0].map(v => [0,8,16,24].map(k => ((v>>>k)&255).toString(16).padStart(2,'0')).join('')).join('');
  }
  function detectCollisions(files) {
    const seen = new Map(); const errors=[];
    for (const file of files) {
      const p=normalizePath(file.path); const k=p.toLocaleLowerCase('en-US');
      if (seen.has(k)) errors.push([seen.get(k),p]); else seen.set(k,p);
    }
    return errors;
  }
  // Deterministic three-way decision. No unsafe implicit deletion or conflict overwrite.
  function planSync(localList, remoteList, baseline={}) {
    const local = new Map(localList.map(f => [normalizePath(f.path), f]));
    const remote = new Map(remoteList.map(f => [normalizePath(f.path), f]));
    if(local.size!==localList.length || remote.size!==remoteList.length)
      return {actions:[],blocked:[{reason:'COLISAO_DE_NOMES'}],unchanged:[]};
    const conflicts = [...detectCollisions(localList), ...detectCollisions(remoteList)];
    const across=new Map();
    for (const file of [...localList,...remoteList]) {
      const p=normalizePath(file.path), k=p.toLocaleLowerCase('en-US');
      if(across.has(k) && across.get(k)!==p) conflicts.push([across.get(k),p]);
      else across.set(k,p);
    }
    if (conflicts.length) return {actions:[], blocked:[{reason:'COLISAO_DE_NOMES',paths:conflicts}], unchanged:[]};
    const actions=[];const blocked=[];const unchanged=[];
    const paths=new Set([...local.keys(),...remote.keys(),...Object.keys(baseline)]);
    for (const p of [...paths].sort()) {
      if (!allowedPath(p)) continue;
      const l=local.get(p), r=remote.get(p), b=baseline[p];
      const lm=l?.md5, rm=r?.md5;
      if(b && r && b.remoteId && b.remoteId!==r.id){blocked.push({path:p,reason:'IDENTIDADE_REMOTA_MUDOU'});continue;}
      if (l && r && (!lm || !rm)) {blocked.push({path:p,reason:'HASH_INDISPONIVEL'});continue;}
      if (l && r && lm===rm) {unchanged.push(p);continue;}
      if (!b) {
        if (l && !r) actions.push({type:'UPLOAD_NEW',path:p,localMd5:lm});
        else if (!l && r) actions.push({type:'DOWNLOAD_NEW',path:p,remoteId:r.id,remoteMd5:rm});
        else if(l && r) blocked.push({path:p,reason:'PRIMEIRA_SINC_DIVERGENTE'});
        continue;
      }
      if (l && r) {
        const localChanged=lm!==b.md5, remoteChanged=rm!==b.md5;
        if (localChanged && remoteChanged) blocked.push({path:p,reason:'ALTERACAO_CONCORRENTE'});
        else if (localChanged) actions.push({type:'UPLOAD_UPDATE',path:p,remoteId:r.id,remoteMd5:rm,localMd5:lm});
        else if (remoteChanged) actions.push({type:'DOWNLOAD_UPDATE',path:p,remoteId:r.id,remoteMd5:rm,localMd5:lm});
        else blocked.push({path:p,reason:'ESTADO_INCONSISTENTE'});
      } else if (l && !r) {
        // A missing remote after baseline may be intentional deletion; never silently restore.
        blocked.push({path:p,reason:'REMOTO_AUSENTE_OU_EXCLUIDO'});
      } else if (!l && r) {
        blocked.push({path:p,reason:'LOCAL_AUSENTE_OU_EXCLUIDO'});
      } else {
        blocked.push({path:p,reason:'EXCLUIDO_EM_AMBOS_OS_LADOS'});
      }
    }
    return {actions,blocked,unchanged};
  }
  return {FOLDER_MIME,md5,normalizePath,allowedPath,detectCollisions,planSync};
})();