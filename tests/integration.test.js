'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const ctx={TextEncoder,TextDecoder,Uint8Array,Uint16Array,ArrayBuffer,DataView,Map,Set,Date,URLSearchParams,crypto:crypto.webcrypto,console};
vm.createContext(ctx);
for(const n of ['core','drive','merge','sync'])vm.runInContext(fs.readFileSync('src/'+n+'.js','utf8')+`;this.${n}=NEXA_${n.toUpperCase()}`,ctx);
const c=ctx.core;
class Vault{
 constructor(){this.data=new Map([['local.md',new Uint8Array(Buffer.from('local'))]]);this.adapter={
  exists:async p=>this.data.has(p)||[...this.data.keys()].some(k=>k.startsWith(p+'/')),
  mkdir:async()=>{},writeBinary:async(p,b)=>this.data.set(p,new Uint8Array(b)),
  readBinary:async p=>new Uint8Array(this.data.get(p)).buffer};}
 getFiles(){return [...this.data.entries()].filter(([p])=>!p.startsWith('.nexa-')).map(([path,b])=>({path,stat:{size:b.length}}));}
 getAbstractFileByPath(p){const b=this.data.get(p);return b?{path:p,stat:{size:b.length}}:null;}
 async readBinary(f){return this.data.get(f.path).slice().buffer;}
 async createBinary(p,b){this.data.set(p,new Uint8Array(b));}
 async modifyBinary(f,b){this.data.set(f.path,new Uint8Array(b));}
 async createFolder(){}
}
class Drive{
 constructor(){this.files=new Map([['remote.md',{id:'id-remote',b:Buffer.from('remote'),parentId:'root-123456789'}]]);}
 async tree(){return{rootId:'root-123456789',rootName:'Obsidian',
  dirs:new Map([['','root-123456789']]),skipped:[],
  files:[...this.files.entries()].map(([path,f])=>({path,id:f.id,md5:c.md5(f.b),size:f.b.length,parentId:f.parentId}))};}
 async metadata(id){const f=[...this.files.values()].find(x=>x.id===id);return {...f,parents:[f.parentId],md5Checksum:c.md5(f.b),trashed:false};}
 async listChildren(parent){return [...this.files.entries()].filter(([,f])=>f.parentId===parent).map(([name,f])=>({name,id:f.id}));}
 async download(id){const f=[...this.files.values()].find(x=>x.id===id);return f.b.buffer.slice(f.b.byteOffset,f.b.byteOffset+f.b.length);}
 async upload(name,parent,data,id){const b=Buffer.from(data);if(id){for(const f of this.files.values())if(f.id===id){f.b=b;return{id};}}const created='new-'+this.files.size;this.files.set(name,{id:created,b,parentId:parent});return{id:created};}
 async createFolder(){throw Error('no folders in fixture');}
}
(async()=>{
 const v=new Vault(),d=new Drive();let settings={baseline:{},remoteRootId:'root-123456789'};
 const s=new ctx.sync.SyncEngine(v,d,async()=>settings,async q=>{settings={...settings,...q}});
 const p=await s.preview('root-123456789');assert.equal(p.plan.actions.length,2);
 const result=await s.apply(p,true);assert.equal(result.failed.length,0);assert.equal(result.success.length,2);
 assert.equal(Buffer.from(v.data.get('remote.md')).toString(),'remote');assert.equal(d.files.get('local.md').b.toString(),'local');
 v.data.set('remote.md',new Uint8Array(Buffer.from('local change')));
 d.files.get('remote.md').b=Buffer.from('remote change');
 const conflict=await s.preview('root-123456789');assert.ok(conflict.plan.blocked.some(x=>x.reason==='ALTERACAO_CONCORRENTE'));
 // No deletion on either side
 v.data.delete('remote.md');const del=await s.preview('root-123456789');assert.ok(del.plan.blocked.some(x=>x.reason==='LOCAL_AUSENTE_OU_EXCLUIDO'));
 console.log('PASS integração: ida/volta, baseline, alteração concorrente, exclusão bloqueada');
})().catch(e=>{console.error(e);process.exitCode=1});
