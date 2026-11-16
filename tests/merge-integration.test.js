'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const crypto=require('node:crypto');
const ctx={TextEncoder,TextDecoder,Uint8Array,Uint16Array,ArrayBuffer,DataView,Map,Set,Date,URLSearchParams,crypto:crypto.webcrypto,console};
vm.createContext(ctx);
for(const n of ['core','merge','sync'])vm.runInContext(fs.readFileSync('src/'+n+'.js','utf8')+'\nthis.'+n+'=NEXA_'+n.toUpperCase()+';',ctx);
const buf=x=>new TextEncoder().encode(x),txt=x=>new TextDecoder().decode(x);
const B='title\npart A\nseparator\npart B\nfooter\n';
class Vault{
 constructor(){this.data=new Map([['note.md',buf(B)]]);this.adapter={
  exists:async p=>this.data.has(p)||[...this.data.keys()].some(k=>k.startsWith(p+'/')),
  mkdir:async()=>{},readBinary:async p=>this.data.get(p).slice().buffer,
  writeBinary:async(p,d)=>this.data.set(p,new Uint8Array(d).slice())
 };}
 getFiles(){return [...this.data.entries()].filter(([p])=>!p.startsWith('.nexa-connect/')).map(([path,b])=>({path,stat:{size:b.length}}));}
 getAbstractFileByPath(p){const b=this.data.get(p);return b?{path:p,stat:{size:b.length}}:null;}
 async readBinary(f){return this.data.get(f.path).slice().buffer;}
 async modifyBinary(f,d){this.data.set(f.path,new Uint8Array(d).slice());}
 async createBinary(p,d){this.data.set(p,new Uint8Array(d).slice());}
 async createFolder(){}
}
class Drive{
 constructor(){this.b=buf(B);this.id='remote-1';}
 async tree(){return{rootId:'root-123456789',rootName:'Obsidian',dirs:new Map([['','root-123456789']]),skipped:[],files:[{path:'note.md',id:this.id,md5:ctx.core.md5(this.b),size:this.b.length,parentId:'root-123456789'}]};}
 async metadata(){return{id:this.id,md5Checksum:ctx.core.md5(this.b),trashed:false,parents:['root-123456789']};}
 async download(){return this.b.slice().buffer;}
 async upload(name,parent,data,id){assert.equal(id,this.id);this.b=new Uint8Array(data).slice();return{id};}
}
(async()=>{
 const vault=new Vault(),drive=new Drive();let state={remoteRootId:'root-123456789',baseline:{}};
 const engine=new ctx.sync.SyncEngine(vault,drive,async()=>state,async next=>{state={...state,...next};});
 let snapshot=await engine.preview('root-123456789');
 assert.equal(snapshot.plan.unchanged.length,1);
 let report=await engine.apply(snapshot,true);
 assert.equal(report.failed.length,0);
 assert.equal(state.baseline['note.md'].md5,ctx.core.md5(buf(B)));
 assert.equal(vault.data.has('.nexa-connect/merge-base/'+ctx.core.md5(buf(B))+'.txt'),true);
 vault.data.set('note.md',buf('title\npart A (Windows)\nseparator\npart B\nfooter\n'));
 drive.b=buf('title\npart A\nseparator\npart B (iPhone)\nfooter\n');
 snapshot=await engine.preview('root-123456789');
 assert.equal(snapshot.plan.blocked.length,0);
 assert.equal(snapshot.plan.actions[0].type,'MERGE_UPDATE');
 report=await engine.apply(snapshot,true);
 assert.equal(report.failed.length,0);
 assert.equal(report.success[0].type,'MERGE_UPDATE');
 const expected='title\npart A (Windows)\nseparator\npart B (iPhone)\nfooter\n';
 assert.equal(txt(vault.data.get('note.md')),expected);
 assert.equal(txt(drive.b),expected);
 assert.equal(state.baseline['note.md'].md5,ctx.core.md5(buf(expected)));
 assert.ok([...vault.data.keys()].some(p=>p.includes('LOCAL_ANTES_MERGE/note.md')));
 assert.ok([...vault.data.keys()].some(p=>p.includes('REMOTO_ANTES_MERGE/note.md')));
 // Two different changes to the same line must remain blocked.
 vault.data.set('note.md',buf('title\npart A (Windows 2)\nseparator\npart B (iPhone)\nfooter\n'));
 drive.b=buf('title\npart A (iPhone 2)\nseparator\npart B (iPhone)\nfooter\n');
 snapshot=await engine.preview('root-123456789');
 assert.equal(snapshot.plan.actions.length,0);
 assert.equal(snapshot.plan.blocked[0].reason,'ALTERACAO_CONCORRENTE');
 await assert.rejects(()=>engine.apply(snapshot,true),/conflitos/);
 // Ancestor unavailable: must not guess or merge.
 vault.data.set('note.md',buf('title\npart A (Windows 3)\nseparator\npart B (iPhone)\nfooter\n'));
 drive.b=buf('title\npart A (iPhone)\nseparator\npart B (iPhone)\nfooter\n');
 vault.data.delete('.nexa-connect/merge-base/'+ctx.core.md5(buf(expected))+'.txt');
 snapshot=await engine.preview('root-123456789');
 assert.equal(snapshot.plan.blocked[0].reason,'ALTERACAO_CONCORRENTE');
 console.log('PASS integration merge: two devices, baseline, backups, readback, overlapping changes, missing ancestor');
})().catch(e=>{console.error(e);process.exitCode=1});
