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
