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