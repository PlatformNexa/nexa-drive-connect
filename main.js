/* NEXA Drive Connect · source: PlatformNexa/nexa-drive-connect */

/* src/core.js */
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


/* src/audit.js */
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


/* src/auth.js */
/* NEXA OAuth public-client PKCE (no embedded secret). iOS: HTTPS callback -> obsidian://. */
const NEXA_AUTH = (() => {
  'use strict';
  const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
  const TOKEN_URL = 'https://oauth2.googleapis.com/token';
  const CALLBACK = 'https://platformnexa.github.io/nexa-drive-connect/callback.html';
  const SCOPE = 'https://www.googleapis.com/auth/drive';
  function randomUrlSafe(n) {
    const bytes = new Uint8Array(n); crypto.getRandomValues(bytes);
    return Array.from(bytes, b=>b.toString(16).padStart(2,'0')).join('');
  }
  async function challenge(verifier) {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));
    let s=''; for(const b of digest) s+=String.fromCharCode(b);
    return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
  }
  async function start(clientId) {
    if(!/^\d+-[a-z0-9-]+\.apps\.googleusercontent\.com$/.test(clientId||''))throw new Error('Client ID Google inválido.');
    const verifier=randomUrlSafe(32), state=randomUrlSafe(18);
    const q=new URLSearchParams({client_id:clientId,redirect_uri:CALLBACK,response_type:'code',scope:SCOPE,
      access_type:'offline',prompt:'consent',code_challenge_method:'S256',code_challenge:await challenge(verifier),state});
    return {verifier,state,expires:Date.now()+15*60*1000,url:AUTH_URL+'?'+q.toString()};
  }
  async function exchange(request, clientId, code, verifier) {
    if(!code || !verifier)throw new Error('Código/verificador ausente.');
    const body=new URLSearchParams({client_id:clientId,code,code_verifier:verifier,
      grant_type:'authorization_code',redirect_uri:CALLBACK}).toString();
    return tokenRequest(request,body);
  }
  async function refresh(request,clientId,refreshToken){
    const body=new URLSearchParams({client_id:clientId,refresh_token:refreshToken,grant_type:'refresh_token'}).toString();
    return tokenRequest(request,body);
  }
  async function tokenRequest(request,body){
    const r=await request({url:TOKEN_URL,method:'POST',contentType:'application/x-www-form-urlencoded',body,
      headers:{'Content-Type':'application/x-www-form-urlencoded'},throw:false});
    if(r.status!==200) throw new Error('OAuth Google: HTTP '+r.status+'. Revise cliente, redirecionamento e autorização.');
    const out=r.json||JSON.parse(r.text);
    if(!out.access_token || !out.expires_in)throw new Error('Resposta OAuth incompleta.');
    return out;
  }
  return {start,exchange,refresh,CALLBACK,SCOPE};
})();


/* src/drive.js */
// NEXA Drive REST adapter. Injects an authenticated request function; never stores credentials.
// Only HTTPS Google endpoints are generated. No arbitrary URL requests.
const NEXA_DRIVE = (() => {
  'use strict';
  const API = 'https://www.googleapis.com/drive/v3/files';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
  const META = 'id,name,mimeType,md5Checksum,size,version,modifiedTime,parents,trashed';
  class DriveError extends Error { constructor(message,status){super(message);this.name='DriveError';this.status=status;} }
  class DriveClient {
    constructor(request, tokenFn){ this.request=request; this.tokenFn=tokenFn; }
    async call(url, method='GET', body, contentType) {
      if (!(url===API || url.startsWith(API+'/') || url.startsWith(API+'?') || url===UPLOAD || url.startsWith(UPLOAD+'/') || url.startsWith(UPLOAD+'?'))) throw new DriveError('Endpoint não permitido.');
      const token = await this.tokenFn();
      if (!token) throw new DriveError('Conta Google não autenticada no dispositivo.');
      const headers = {Authorization:'Bearer '+token};
      if (contentType) headers['Content-Type']=contentType;
      const r=await this.request({url,method,headers,...(body===undefined?{}:{body}),throw:false});
      if(r.status<200 || r.status>=300) {
        const desc=String(r.text||'').slice(0,250).replace(/access_token|refresh_token/gi,'[redacted]');
        throw new DriveError('Google Drive retornou HTTP '+r.status+' ('+desc+').',r.status);
      }
      return r;
    }
    async metadata(id) { return (await this.call(API+'/'+encodeURIComponent(id)+'?fields='+encodeURIComponent(META)+'&supportsAllDrives=true')).json; }
    async listChildren(folderId) {
      const rows=[]; let pageToken=''; let rounds=0;
      do {
        if(++rounds>1000) throw new DriveError('Paginação excessiva; interrompida.');
        const query = `'${folderId.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}' in parents and trashed = false`;
        const q=new URLSearchParams({q:query,fields:'nextPageToken,files('+META+')',pageSize:'1000',supportsAllDrives:'true',includeItemsFromAllDrives:'true'});
        if(pageToken)q.set('pageToken',pageToken);
        const result=(await this.call(API+'?'+q.toString())).json;
        rows.push(...(result.files||[]));pageToken=result.nextPageToken||'';
      }while(pageToken);
      return rows;
    }
    async tree(rootId, opts={}) {
      if(!/^[a-zA-Z0-9_-]{8,}$/.test(rootId)) throw new DriveError('ID da pasta Google inválido.');
      const root=await this.metadata(rootId);
      if(root.mimeType!==NEXA_CORE.FOLDER_MIME || root.trashed) throw new DriveError('O ID não aponta para uma pasta disponível.');
      const dirs=new Map([['',rootId]]);const files=[];const skipped=[];const remotePaths=new Map();
      const stack=[{id:rootId,path:''}];const seen=new Set();let scanned=0;
      while(stack.length){
        const current=stack.shift();
        if(seen.has(current.id))throw new DriveError('Ciclo ou pasta duplicada na árvore do Drive.');
        seen.add(current.id);
        if(++scanned>(opts.maxFolders||1000))throw new DriveError('Limite de pastas atingido.');
        for(const child of await this.listChildren(current.id)){
          let path;
          try {path=NEXA_CORE.normalizePath(current.path?current.path+'/'+child.name:child.name);}catch(e){skipped.push({name:child.name,reason:'CAMINHO_INVALIDO'});continue;}
          if(!NEXA_CORE.allowedPath(path))continue;
          const pathKey=path.toLocaleLowerCase('en-US');
          if(remotePaths.has(pathKey))throw new DriveError('Dois objetos remotos possuem o mesmo caminho/nome incompatível: '+path);
          remotePaths.set(pathKey,child.id);
          if(child.mimeType===NEXA_CORE.FOLDER_MIME){dirs.set(path,child.id);stack.push({id:child.id,path});continue;}
          if(child.mimeType.startsWith('application/vnd.google-apps.')){skipped.push({path,reason:'NATIVO_GOOGLE_NAO_ESPELHAVEL'});continue;}
          if(!child.md5Checksum){skipped.push({path,reason:'SEM_MD5'});continue;}
          files.push({path,id:child.id,md5:child.md5Checksum,size:Number(child.size||0),version:child.version||'',parentId:current.id});
          if(files.length>(opts.maxFiles||10000))throw new DriveError('Limite de arquivos atingido.');
        }
      }
      return {rootId,rootName:root.name||'',files,dirs,skipped};
    }
    async download(fileId){ return (await this.call(API+'/'+encodeURIComponent(fileId)+'?alt=media&supportsAllDrives=true')).arrayBuffer; }
    async createFolder(name,parentId) {
      const obj={name,mimeType:NEXA_CORE.FOLDER_MIME,parents:[parentId]};
      return (await this.call(API+'?fields='+encodeURIComponent(META)+'&supportsAllDrives=true','POST',JSON.stringify(obj),'application/json; charset=UTF-8')).json;
    }
    async upload(name,parentId,bytes,id=null,mime='application/octet-stream'){
      const boundary='nexa_'+Array.from(crypto.getRandomValues(new Uint8Array(12))).map(x=>x.toString(16).padStart(2,'0')).join('');
      const meta=id?{}:{name,parents:[parentId],mimeType:mime};
      const pre=new TextEncoder().encode('--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(meta)+'\r\n--'+boundary+'\r\nContent-Type: '+mime+'\r\n\r\n');
      const post=new TextEncoder().encode('\r\n--'+boundary+'--\r\n');
      const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
      const buf=new Uint8Array(pre.byteLength+b.byteLength+post.byteLength);
      buf.set(pre);buf.set(b,pre.length);buf.set(post,pre.length+b.length);
      const url=(id?UPLOAD+'/'+encodeURIComponent(id):UPLOAD)+'?uploadType=multipart&fields='+encodeURIComponent(META)+'&supportsAllDrives=true';
      return (await this.call(url,id?'PATCH':'POST',buf.buffer,'multipart/related; boundary='+boundary)).json;
    }
  }
  return {DriveClient,DriveError};
})();


/* src/sync.js */
// NEXA conservative sync orchestrator: explicit preview/approval, checkpoints, recovery.
const NEXA_SYNC = (() => {
  'use strict';
  const LIMIT_BYTES = 20 * 1024 * 1024; // v1 candidate: block oversized; no truncated transfers.
  function bytes(buffer){return buffer instanceof Uint8Array?buffer:new Uint8Array(buffer);}
  function asArrayBuffer(buf){const b=bytes(buf);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}
  class SyncEngine {
    constructor(vault,drive,getData,setData,logger=()=>{}) {
      this.vault=vault;this.drive=drive;this.getData=getData;this.setData=setData;this.log=logger;this.busy=false;
    }
    async localInventory(){
      const files=[];const skipped=[];
      for(const file of this.vault.getFiles()){
        try {
          if(!NEXA_CORE.allowedPath(file.path))continue;
          if(file.stat.size>LIMIT_BYTES){skipped.push({path:file.path,reason:'ARQUIVO_ACIMA_DE_20_MB'});continue;}
          const content=await this.vault.readBinary(file);
          files.push({path:file.path,md5:NEXA_CORE.md5(bytes(content)),size:content.byteLength});
        }catch(e){skipped.push({path:file.path,reason:'LEITURA_LOCAL_FALHOU'});}
      }
      return {files,skipped};
    }
    async preview(rootId, internal=false){
      if(this.busy && !internal)throw new Error('Outra operação está ativa.');
      const remote=await this.drive.tree(rootId);
      const local=await this.localInventory();
      const state=(await this.getData())||{};
      if(state.remoteRootId && state.remoteRootId!==rootId)throw new Error('Pasta remota mudou. É necessário reconfigurar o histórico com aprovação explícita.');
      const tooBig=remote.files.filter(f=>f.size>LIMIT_BYTES).map(f=>({path:f.path,reason:'ARQUIVO_REMOTO_ACIMA_DE_20_MB'}));
      const eligibleRemote=remote.files.filter(f=>f.size<=LIMIT_BYTES);
      const plan=NEXA_CORE.planSync(local.files,eligibleRemote,state.baseline||{});
      const localInvalid=new Set(local.skipped.map(f=>f.path));const remoteInvalid=new Set([...tooBig,...remote.skipped].map(f=>f.path).filter(Boolean));
      plan.actions=plan.actions.filter(a=>{
        if(localInvalid.has(a.path)||remoteInvalid.has(a.path)) {plan.blocked.push({path:a.path,reason:'ARQUIVO_NAO_PROCESSAVEL'});return false;} return true;
      });
      plan.blocked.push(...local.skipped,...remote.skipped,...tooBig);
      return {rootId,plan,remote,local,baseline:state.baseline||{},createdAt:new Date().toISOString()};
    }
    async backup(path,data,operation){
      const root='.nexa-connect-recovery';
      const stamp=new Date().toISOString().replace(/[:.]/g,'-');
      const target=`${root}/${stamp}/${operation}/${path}`;
      const parts=target.split('/');
      let dir='';for(const part of parts.slice(0,-1)){
        dir=dir?dir+'/'+part:part;
        if(!(await this.vault.adapter.exists(dir)))await this.vault.adapter.mkdir(dir);
      }
      if(await this.vault.adapter.exists(target))throw new Error('Backup já existe; recusando sobrescrever.');
      await this.vault.adapter.writeBinary(target,asArrayBuffer(data));
      const read=await this.vault.adapter.readBinary(target);
      if(NEXA_CORE.md5(bytes(read))!==NEXA_CORE.md5(bytes(data)))throw new Error('Backup não validado; escrita bloqueada.');
      return target;
    }
    async ensureLocalParent(path){
      const bits=path.split('/');let d='';
      for(const part of bits.slice(0,-1)){
        d=d?d+'/'+part:part;
        if(!(await this.vault.adapter.exists(d)))await this.vault.createFolder(d);
      }
    }
    async checkLocal(path,expected){
      const f=this.vault.getAbstractFileByPath(path);
      if(!f || !('stat' in f))throw new Error('Arquivo local mudou ou está ausente: '+path);
      const contents=await this.vault.readBinary(f);
      if(NEXA_CORE.md5(bytes(contents))!==expected)throw new Error('Arquivo local alterado após prévia: '+path);
      return {f,contents};
    }
    async checkRemote(id,expected,expectedParentId){
      const meta=await this.drive.metadata(id);
      // Reject files moved outside the selected tree; caller also validates root id during preview.
      if(!meta || meta.trashed || meta.md5Checksum!==expected || !Array.isArray(meta.parents) || !meta.parents.includes(expectedParentId))throw new Error('Arquivo remoto alterado ou movido após prévia. Interrompido.');
      return meta;
    }
    async ensureRemoteParent(path,rootId,dirs){
      const pieces=path.split('/').slice(0,-1);let parent=rootId, prefix='';
      for(const p of pieces){
        prefix=prefix?prefix+'/'+p:p;
        if(!dirs.has(prefix)){
          const created=await this.drive.createFolder(p,parent);
          dirs.set(prefix,created.id);
        }
        parent=dirs.get(prefix);
      }
      return parent;
    }
    async apply(snapshot,approved){
      if(!approved)throw new Error('Execução requer confirmação explícita do usuário.');
      if(snapshot.plan.blocked.length)throw new Error('Plano possui conflitos ou arquivos bloqueados. Escrita recusada.');
      if(this.busy)throw new Error('Sincronização já em execução.');
      if(Date.now()-Date.parse(snapshot.createdAt)>60000)throw new Error('Prévia expirada. Execute nova consulta.');
      this.busy=true;
      const report={success:[],failed:[],blocked:snapshot.plan.blocked.slice(),status:'INCOMPLETO'};
      try{
        // Fresh metadata pass protects against changes since preview. It is not a distributed transaction.
        const fresh=await this.preview(snapshot.rootId,true);
        const signatures=rows=>rows.map(a=>[a.type,a.path,a.remoteId||'',a.remoteMd5||'',a.localMd5||''].join('|')).sort().join('\n');
        if(signatures(fresh.plan.actions)!==signatures(snapshot.plan.actions)||
          JSON.stringify(fresh.plan.blocked)!==JSON.stringify(snapshot.plan.blocked))throw new Error('O estado mudou depois da prévia; aprovação cancelada.');
        const state=(await this.getData())||{};
        const baseline={...(state.baseline||{})};
        const remoteMap=new Map(fresh.remote.files.map(f=>[f.path,f]));
        const dirs=new Map(fresh.remote.dirs);
        for(const path of fresh.plan.unchanged){
          const f=remoteMap.get(path); const l=fresh.local.files.find(x=>x.path===path);
          if(f&&l)baseline[path]={md5:l.md5,remoteId:f.id};
        }
        await this.setData({remoteRootId:snapshot.rootId,baseline});
        for(const action of fresh.plan.actions){
          try{
            const p=NEXA_CORE.normalizePath(action.path);
            if(!NEXA_CORE.allowedPath(p))throw new Error('Caminho fora do escopo.');
            if(action.type.startsWith('UPLOAD')){
              const {contents}=await this.checkLocal(p,action.localMd5);
              if(action.type==='UPLOAD_NEW'){
                const parent=await this.ensureRemoteParent(p,snapshot.rootId,dirs);
                const already=(await this.drive.listChildren(parent)).some(f=>f.name===p.split('/').pop());
                if(already)throw new Error('Arquivo apareceu no Drive antes da criação; impedindo duplicação.');
                const result=await this.drive.upload(p.split('/').pop(),parent,contents);
                const meta=await this.drive.metadata(result.id);
                if(meta.md5Checksum!==action.localMd5)throw new Error('Hash remoto após upload divergente!');
                baseline[p]={md5:action.localMd5,remoteId:result.id};
              }else{
                await this.checkRemote(action.remoteId,action.remoteMd5,remoteMap.get(p).parentId);
                const prev=await this.drive.download(action.remoteId);
                if(NEXA_CORE.md5(bytes(prev))!==action.remoteMd5)throw new Error('Falha de integridade da cópia remota.');
                await this.backup(p,prev,'REMOTO_ANTES_UPLOAD');
                await this.drive.upload(p.split('/').pop(),null,contents,action.remoteId);
                const meta=await this.drive.metadata(action.remoteId);
                if(meta.md5Checksum!==action.localMd5)throw new Error('Hash remoto após atualização divergente!');
                baseline[p]={md5:action.localMd5,remoteId:action.remoteId};
              }
            }else{
              await this.checkRemote(action.remoteId,action.remoteMd5,remoteMap.get(p).parentId);
              const data=await this.drive.download(action.remoteId);
              if(NEXA_CORE.md5(bytes(data))!==action.remoteMd5)throw new Error('Download não passou na verificação MD5.');
              if(action.type==='DOWNLOAD_NEW'){
                if(this.vault.getAbstractFileByPath(p))throw new Error('Arquivo local surgiu após prévia.');
                await this.ensureLocalParent(p);
                await this.vault.createBinary(p,asArrayBuffer(data));
              }else{
                const {f,contents}=await this.checkLocal(p,action.localMd5);
                await this.backup(p,contents,'LOCAL_ANTES_DOWNLOAD');
                await this.vault.modifyBinary(f,asArrayBuffer(data));
              }
              const final=await this.checkLocal(p,action.remoteMd5);
              if(!final)throw new Error('Readback local falhou.');
              baseline[p]={md5:action.remoteMd5,remoteId:action.remoteId};
            }
            await this.setData({remoteRootId:snapshot.rootId,baseline});
            report.success.push({type:action.type,path:p});
          }catch(e){
            report.failed.push({type:action.type,path:action.path,reason:String(e.message||e)});
            // Stop all writes if any operation fails: no hidden continuation after an incident.
            break;
          }
        }
        report.status=report.failed.length?'FALHOU':report.blocked.length?'PARCIAL':'CONCLUIDO_COM_READBACK';
        return report;
      }finally{this.busy=false;}
    }

  }
  return {SyncEngine,LIMIT_BYTES};
})();


/* src/plugin-ios.js */
/* NEXA Drive Connect — iPhone direct OAuth/Google Drive adapter, controlled synchronization. */
const { Plugin, PluginSettingTab, Setting, Modal, Notice, requestUrl } = require('obsidian');
const NEXA_SECRET_KEY = 'nexa-drive-connect-google-oauth-v1';
const DEFAULT_SETTINGS={clientId:'',remoteRootId:'',autoSync:false,intervalMinutes:10,
  lastStatus:'Ainda não sincronizado',remoteRootName:'',baseline:{}};
function errorMessage(e){return String(e && e.message || e).replace(/[\r\n]/g,' ').slice(0,220);}
class NexaPlanModal extends Modal {
  constructor(app, snapshot, execute) {super(app);this.snapshot=snapshot;this.execute=execute;}
  onOpen(){
    const el=this.contentEl;el.empty();const p=this.snapshot.plan;
    el.createEl('h2',{text:'NEXA — Prévia de sincronização'});
    el.createEl('p',{text:`Pasta remota: ${this.snapshot.remote.rootName} · Enviar/baixar: ${p.actions.length} · Conflitos/bloqueios: ${p.blocked.length} · Iguais: ${p.unchanged.length}`});
    el.createEl('p',{text:'Nenhuma exclusão é propagada. O primeiro espelhamento divergente é bloqueado. Backups locais são criados antes de substituições.'});
    const list=el.createEl('div');list.style.maxHeight='40vh';list.style.overflowY='auto';
    for(const a of p.actions.slice(0,75))list.createEl('p',{text:`${a.type}: ${a.path}`});
    for(const b of p.blocked.slice(0,75))list.createEl('p',{text:`BLOQUEADO: ${b.path||'(sem caminho)'} — ${b.reason}`});
    if(p.actions.length+p.blocked.length>150)list.createEl('p',{text:'Prévia resumida. Operações excedentes não são ocultadas na contagem.'});
    new Setting(el).addButton(b=>b.setButtonText('Fechar').onClick(()=>this.close()));
    if(!p.blocked.length && (p.actions.length || p.unchanged.length)){
      new Setting(el).setName(p.actions.length ? 'Aplicar alterações revisadas' : 'Registrar baseline confirmado').setDesc('Executa preflight novamente e valida cada escrita.').addButton(b=>b.setButtonText(p.actions.length ? 'Confirmar sincronização' : 'Confirmar estado inicial').setCta().onClick(async()=>{this.close();await this.execute();}));
    }
    if(p.blocked.length)el.createEl('p',{text:'Conflitos ou arquivos não processáveis: nenhuma escrita será executada neste lote. Resolva antes de sincronizar.'});
  }
}
class NexaSettingsTab extends PluginSettingTab{
  constructor(app,plugin){super(app,plugin);this.plugin=plugin;}
  display(){
    const p=this.plugin,e=this.containerEl;e.empty();
    e.createEl('h2',{text:'NEXA Drive Connect — Mobile'});
    e.createEl('p',{text:'Google Drive ↔ cofre local. Sem Windows ou servidor de arquivos. Uma página estática do próprio projeto devolve o código de login (OAuth PKCE).'});
    e.createEl('p',{text:'Atenção: permissão OAuth do Google abrange o Drive da conta. O NEXA limita suas operações à pasta verificada. Nunca use uma conta com documentos confidenciais sem revisar essa permissão.'});
    new Setting(e).setName('Client ID Google').setDesc('ID do cliente OAuth tipo Aplicação web criado no seu Google Cloud.').addText(t=>t.setPlaceholder('...apps.googleusercontent.com').setValue(p.settings.clientId).onChange(async v=>{p.settings.clientId=v.trim();await p.saveSettings();}));
    new Setting(e).setName('Login Google').setDesc('Prepara OAuth PKCE e apresenta um link para tocar e abrir o navegador do dispositivo.').addButton(b=>b.setButtonText('Autorizar Google').onClick(()=>p.authorize()));
    e.createEl('p',{text:'URI de retorno obrigatório no Google Cloud: '+NEXA_AUTH.CALLBACK});
    new Setting(e).setName('ID da pasta Obsidian').setDesc('Cole o ID da pasta Google Drive existente ou o URL completo dela. Não cria outra pasta.').addText(t=>t.setPlaceholder('ID ou link da pasta Obsidian').setValue(p.settings.remoteRootId).onChange(async v=>{
      p.settings.remoteRootId=p.extractId(v);await p.saveSettings();
    }));
    new Setting(e).setName('Prévia e sincronização').setDesc('Compara local e remoto. Só grava após confirmação, com backups e readback.').addButton(b=>b.setButtonText('Analisar alterações').setCta().onClick(()=>p.syncPreview()));
    new Setting(e).setName('Sincronização automática').setDesc('Habilitar somente depois da primeira sincronização conferida. Executa enquanto o Obsidian estiver ativo; pausa diante de conflitos.').addToggle(t=>t.setValue(p.settings.autoSync).onChange(async v=>{p.settings.autoSync=v;await p.saveSettings();}));
    new Setting(e).setName('Intervalo automático (minutos)').addDropdown(d=>{
      for(const n of [5,10,15,30])d.addOption(String(n),String(n));
      d.setValue(String(p.settings.intervalMinutes)).onChange(async v=>{p.settings.intervalMinutes=Number(v);await p.saveSettings();});
    });
    new Setting(e).setName('Desconectar Google').setDesc('Apaga os tokens locais salvos neste dispositivo; não altera o Drive.').addButton(b=>b.setWarning().setButtonText('Desconectar').onClick(async()=>{await p.dropCredentials();new Notice('Autorização local desconectada.');}));
    e.createEl('h3',{text:'Estado'});e.createEl('p',{text:p.settings.lastStatus});
    e.createEl('p',{text:'Excluídos da sincronização: .obsidian, .git, .nexa-connect-recovery, .trash. Arquivos individuais acima de 20 MiB são bloqueados. Google Docs nativos não são convertidos nem sobrescritos.'});
  }
}
module.exports=class NexaDriveConnect extends Plugin{
  async onload(){
    this.settings=Object.assign({},DEFAULT_SETTINGS,await this.loadData()||{});this.busy=false;this.oauthPending=null;this.nextTick=0;
    this.addSettingTab(new NexaSettingsTab(this.app,this));
    this.addCommand({id:'preview-sync',name:'Prévia da sincronização com Google Drive',callback:()=>this.syncPreview()});
    this.addCommand({id:'local-audit',name:'Auditar arquivos do cofre local',callback:()=>this.auditLocal()});
    this.registerObsidianProtocolHandler('nexa-drive-connect',(params)=>this.handleOAuth(params));
    this.registerInterval(window.setInterval(()=>this.maybeAutoSync(),60000));
  }
  async saveSettings(){await this.saveData(this.settings);}
  extractId(s){
    s=String(s||'').trim();const match=s.match(/\/folders\/([A-Za-z0-9_-]{8,})/);
    return match?match[1]:s;
  }
  readCredentials(){
    const raw=this.app.secretStorage?.getSecret(NEXA_SECRET_KEY);
    if(!raw)return {};try{return JSON.parse(raw);}catch{return {};}
  }
  async updateSecret(delta){
    if(!this.app.secretStorage?.setSecret)throw new Error('SecretStorage indisponível. Atualize o Obsidian.');
    this.app.secretStorage.setSecret(NEXA_SECRET_KEY,JSON.stringify({...this.readCredentials(),...delta}));
  }
  async dropCredentials(){
    if(this.app.secretStorage?.setSecret)this.app.secretStorage.setSecret(NEXA_SECRET_KEY,'');
    this.oauthPending=null;
  }
  async authorize(){
    try{
      this.oauthPending=await NEXA_AUTH.start(this.settings.clientId);
      await this.updateSecret({pendingOAuth:this.oauthPending});
      // Deliberately show a real link. iOS WKWebView can block window.open after await;
      // tapping the anchor is a separate user gesture, with a copy fallback.
      const login=new Modal(this.app); const e=login.contentEl;
      e.createEl('h2',{text:'Conectar conta Google ao NEXA'});
      e.createEl('p',{text:'Toque no link abaixo para abrir o navegador do dispositivo e autorizar este aparelho. Não compartilhe o link da autorização.'});
      const pendingUrl=this.oauthPending.url;
      const a=e.createEl('a',{text:'Abrir autorização Google',href:pendingUrl});
      a.setAttr('target','_blank'); a.setAttr('rel','noopener noreferrer');
      new Setting(e).setName('Se o navegador não abrir').setDesc('Copie o link e abra no Safari ou navegador principal do aparelho.').addButton(b=>b.setButtonText('Copiar link').onClick(async()=>{
        try{await navigator.clipboard.writeText(pendingUrl);new Notice('Link copiado. Abra no Safari.');}
        catch(err){new Notice('Falha ao copiar o link. Use Abrir autorização Google.');}
      }));
      new Setting(e).addButton(b=>b.setButtonText('Fechar').onClick(()=>login.close()));
      login.open();
    }catch(e){new Notice('NEXA: '+errorMessage(e),9000);}
  }
  async handleOAuth(params){
    try{
      const pending=this.oauthPending || this.readCredentials().pendingOAuth;
      if(params.error)throw new Error('Autorização negada pelo Google.');
      if(!pending || Date.now()>pending.expires || !params.code || params.state!==pending.state)throw new Error('Retorno OAuth expirado ou não corresponde à autorização iniciada.');
      this.oauthPending=null;
      const old=this.readCredentials();
      const received=await NEXA_AUTH.exchange(requestUrl,this.settings.clientId,params.code,pending.verifier);
      await this.updateSecret({pendingOAuth:null,accessToken:received.access_token,refreshToken:received.refresh_token||old.refreshToken,
        expiresAt:Date.now()+Number(received.expires_in)*1000});
      new Notice('NEXA: Google autorizado neste aparelho. Execute a prévia antes de sincronizar.');
    }catch(e){this.oauthPending=null;await this.updateSecret({pendingOAuth:null}).catch(()=>{});new Notice('NEXA OAuth: '+errorMessage(e),10000);}
  }
  async accessToken(){
    const c=this.readCredentials();
    if(c.accessToken && Date.now()<c.expiresAt-90000)return c.accessToken;
    if(!c.refreshToken || !this.settings.clientId)throw new Error('Faça login no Google nas configurações.');
    const t=await NEXA_AUTH.refresh(requestUrl,this.settings.clientId,c.refreshToken);
    await this.updateSecret({accessToken:t.access_token,expiresAt:Date.now()+Number(t.expires_in)*1000});
    return t.access_token;
  }
  engine(){return new NEXA_SYNC.SyncEngine(this.app.vault,
    new NEXA_DRIVE.DriveClient(requestUrl,()=>this.accessToken()),
    async()=>this.settings,
    async d=>{this.settings={...this.settings,...d};await this.saveSettings();});}
  async snapshot(){
    if(!/^[\w-]{8,}$/.test(this.settings.remoteRootId))throw new Error('Configure o ID da pasta Obsidian existente.');
    const preview=await this.engine().preview(this.settings.remoteRootId);
    if(preview.remote.rootName!=='Obsidian')throw new Error('A pasta remota precisa chamar-se exatamente Obsidian.');
    return preview;
  }
  async syncPreview(){
    if(this.busy){new Notice('NEXA: outra operação em andamento.');return;}
    this.busy=true;
    try{
      const snap=await this.snapshot();
      new NexaPlanModal(this.app,snap,()=>this.applySnapshot(snap)).open();
    }catch(e){new Notice('NEXA: '+errorMessage(e),12000);}
    finally{this.busy=false;}
  }
  async applySnapshot(snap){
    if(this.busy){new Notice('NEXA: outra operação ativa.');return;}
    if(snap.plan.blocked.length){new Notice('NEXA: há bloqueios; escrita não iniciada.');return;}
    this.busy=true;
    try{
      const report=await this.engine().apply(snap,true);
      this.settings.lastStatus=report.status+': '+report.success.length+' alterações; '+report.failed.length+' falhas';
      await this.saveSettings();new Notice('NEXA: '+this.settings.lastStatus,12000);
    }catch(e){this.settings.lastStatus='FALHOU: '+errorMessage(e);await this.saveSettings();new Notice('NEXA: '+this.settings.lastStatus,12000);}
    finally{this.busy=false;}
  }
  async maybeAutoSync(){
    if(!this.settings.autoSync || !this.settings.remoteRootId || this.busy || Date.now()<this.nextTick)return;
    this.nextTick=Date.now()+this.settings.intervalMinutes*60000;
    this.busy=true;
    try{
      const snap=await this.snapshot();
      if(snap.plan.blocked.length){this.settings.lastStatus='PAUSADO: '+snap.plan.blocked.length+' conflitos/bloqueios';await this.saveSettings();return;}
      if(snap.plan.actions.length){
        const r=await this.engine().apply(snap,true);
        this.settings.lastStatus=r.status+': '+r.success.length+' operações; '+r.failed.length+' falhas';
        await this.saveSettings();
        if(r.failed.length)new Notice('NEXA: sincronização pausada por falha.');
      }
    }catch(e){this.settings.lastStatus='AUTO PAUSADO: '+errorMessage(e);await this.saveSettings();}
    finally{this.busy=false;}
  }
  async auditLocal(){
    try{const r=await NEXA_AUDIT.inventory(this.app.vault);
      new Notice('NEXA: '+r.files.length+' arquivos válidos, '+r.collisions.length+' colisões, '+r.skipped.length+' ignorados.',10000);
    }catch(e){new Notice('NEXA auditoria: '+errorMessage(e));}
  }
};