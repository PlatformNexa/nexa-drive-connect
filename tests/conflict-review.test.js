'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={TextEncoder,TextDecoder,Uint8Array,Uint16Array,ArrayBuffer,DataView,Map,Set,Date,URLSearchParams,console};
vm.createContext(ctx);for(const n of ['core','merge','sync'])vm.runInContext(fs.readFileSync('src/'+n+'.js','utf8')+';this.'+n+'=NEXA_'+n.toUpperCase(),ctx);
const encode=s=>new TextEncoder().encode(s),decode=b=>new TextDecoder().decode(b);
const ROOT='root-123456789',FILE='conflito.md',base='Title\nOriginal\nFooter\n';
class Vault{
 constructor(){this.files=new Map([[FILE,encode(base)]]);
 this.adapter={exists:async p=>this.files.has(p),mkdir:async()=>{},writeBinary:async(p,d)=>{if(this.files.has(p))throw Error('overwrite backup');this.files.set(p,new Uint8Array(d).slice());},readBinary:async p=>this.files.get(p).slice().buffer};}
 getFiles(){return [...this.files].filter(([p])=>!p.startsWith('.nexa-connect/')&&!p.startsWith('.nexa-connect-recovery/')).map(([path,b])=>({path,stat:{size:b.byteLength}}));}
 getAbstractFileByPath(path){return this.files.has(path)?{path,stat:{size:this.files.get(path).byteLength}}:null;}
 async readBinary(f){return this.files.get(f.path).slice().buffer;}
 async modifyBinary(f,data){this.files.set(f.path,new Uint8Array(data).slice());}
}
class Drive{
 constructor(){this.b=encode(base);this.uploadCount=0;}
 async tree(){return{rootId:ROOT,rootName:'NEXA_DRIVE_CONNECT_LAB',dirs:new Map([['',ROOT]]),skipped:[],
 files:[{path:FILE,id:'remote-1',md5:ctx.core.md5(this.b),size:this.b.length,parentId:ROOT}]};}
 async metadata(){return{trashed:false,parents:[ROOT],md5Checksum:ctx.core.md5(this.b)};}
 async download(){return this.b.slice().buffer;}
 async upload(n,p,d,id){assert.equal(id,'remote-1');this.uploadCount++;this.b=new Uint8Array(d).slice();return{id};}
}
(async()=>{
 const v=new Vault(),r=new Drive();let state={remoteRootId:ROOT,baseline:{}};
 const engine=new ctx.sync.SyncEngine(v,r,async()=>state,async delta=>{state={...state,...delta}});
 // Start from same ancestral state, then both edit the very same line.
 const first=await engine.preview(ROOT);await engine.apply(first,true);
 v.files.set(FILE,encode('Title\nWindows edition\nFooter\n'));
 r.b=encode('Title\niPhone edition\nFooter\n');
 let versions=await engine.conflictVersions(ROOT,FILE);
 assert.equal(versions.reason,'ALTERACAO_CONCORRENTE');
 assert.equal(decode(versions.localData),'Title\nWindows edition\nFooter\n');
 assert.equal(decode(versions.remoteData),'Title\niPhone edition\nFooter\n');
 // Both: preserve both, no overwrite of either canonical version.
 let result=await engine.resolveConflict(versions,'AMBAS');
 assert.equal(result.status,'VERSOES_PRESERVADAS_SEM_SINCRONIZAR');
 assert.equal(decode(v.files.get(FILE)),'Title\nWindows edition\nFooter\n');
 assert.equal(decode(r.b),'Title\niPhone edition\nFooter\n');
 assert.equal(r.uploadCount,0);
 assert.ok([...v.files.keys()].some(x=>x.includes('CONFLITO_LOCAL/')));
 assert.ok([...v.files.keys()].some(x=>x.includes('CONFLITO_DRIVE/')));
 // Stale decision: do not resolve if cloud changed since preview.
 versions=await engine.conflictVersions(ROOT,FILE);
 r.b=encode('Title\niPhone edition later\nFooter\n');
 await assert.rejects(()=>engine.resolveConflict(versions,'LOCAL'),/versões mudaram/i);
 assert.equal(r.uploadCount,0);
 versions=await engine.conflictVersions(ROOT,FILE);
 result=await engine.resolveConflict(versions,'LOCAL');
 assert.equal(result.status,'RESOLVIDO_COM_BACKUPS');
 assert.equal(decode(r.b),'Title\nWindows edition\nFooter\n');
 assert.equal(state.baseline[FILE].md5,ctx.core.md5(v.files.get(FILE)));
 // New conflict, choose Drive as canonical; local copy stays in backup.
 v.files.set(FILE,encode('Title\nWindows second edition\nFooter\n'));
 r.b=encode('Title\niPad second edition\nFooter\n');
 versions=await engine.conflictVersions(ROOT,FILE);
 result=await engine.resolveConflict(versions,'DRIVE');
 assert.equal(result.status,'RESOLVIDO_COM_BACKUPS');
 assert.equal(decode(v.files.get(FILE)),'Title\niPad second edition\nFooter\n');
 assert.equal(decode(r.b),'Title\niPad second edition\nFooter\n');
 assert.equal((await engine.preview(ROOT)).plan.blocked.length,0);
 assert.equal((await engine.preview(ROOT)).plan.actions.length,0);
 await assert.rejects(()=>engine.resolveConflict(versions,'DROP_ALL'),/inválida/);
 console.log('PASS conflict preview: 2 versions, preserve both, stale refusal, local/Drive choice, baselines, backups');
})().catch(e=>{console.error(e);process.exitCode=1;});
