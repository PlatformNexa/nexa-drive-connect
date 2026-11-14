'use strict';
// Deterministic laboratory: 3 independent Obsidian-like vaults + one shared mock Google Drive.
// Assertions cover actual SyncEngine actions. No external accounts, notes, or network calls.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={TextEncoder,TextDecoder,Uint8Array,Uint16Array,ArrayBuffer,DataView,Map,Set,Date,URLSearchParams,console};
vm.createContext(ctx);
for(const n of ['core','merge','sync'])vm.runInContext(fs.readFileSync('src/'+n+'.js','utf8')+'\nthis.'+n+'=NEXA_'+n.toUpperCase()+';',ctx);
const enc=s=>new TextEncoder().encode(s),dec=b=>new TextDecoder().decode(b);
const data=b=>new Uint8Array(b).slice(),ROOT='root-123456789';
const ORIGINAL='Título\nIluminação original\nDivisor\nMateriais originais\nConclusão\n';
class Vault {
 constructor(label){this.label=label;this.files=new Map();this.dirs=new Set();
  this.adapter={exists:async p=>this.files.has(p)||this.dirs.has(p),
  mkdir:async p=>this.dirs.add(p),
  writeBinary:async(p,b)=>this.files.set(p,data(b)),
  readBinary:async p=>this.files.get(p).slice().buffer};}
 getFiles(){return [...this.files].filter(([p])=>!p.startsWith('.nexa-connect/')&&!p.startsWith('.nexa-connect-recovery/')&&!p.startsWith('.obsidian/')).map(([path,b])=>({path,stat:{size:b.length}}));}
 getAbstractFileByPath(p){const b=this.files.get(p);return b?{path:p,stat:{size:b.length}}:null;}
 async readBinary(f){return this.files.get(f.path).slice().buffer;}
 async createBinary(p,b){if(this.files.has(p))throw Error('exists');this.files.set(p,data(b));}
 async modifyBinary(f,b){if(!this.files.has(f.path))throw Error('missing');this.files.set(f.path,data(b));}
 async createFolder(p){this.dirs.add(p);}
 edit(p,s){this.files.set(p,enc(s));}
 read(p){return this.files.has(p)?dec(this.files.get(p)):null;}
}
class Cloud{
 constructor(){this.files=new Map();this.serial=0;this.failNextUpload=false;this.afterNextUpload=null;}
 seed(p,s){this.files.set(p,{id:'id-'+(++this.serial),bytes:enc(s),parentId:ROOT});}
 findById(id){return [...this.files.values()].find(f=>f.id===id);}
 async tree(id){assert.equal(id,ROOT);
  return {rootId:ROOT,rootName:'Obsidian',dirs:new Map([['',ROOT]]),skipped:[],
   files:[...this.files].map(([path,f])=>({path,id:f.id,md5:ctx.core.md5(f.bytes),size:f.bytes.length,parentId:f.parentId}))};}
 async metadata(id){const f=this.findById(id);if(!f)return{trashed:true};
  return{id:f.id,parents:[f.parentId],md5Checksum:ctx.core.md5(f.bytes),trashed:false};}
 async download(id){return this.findById(id).bytes.slice().buffer;}
 async listChildren(parent){return [...this.files].filter(([,f])=>f.parentId===parent).map(([name,f])=>({name,id:f.id}));}
 async upload(name,parent,bytes,id){
  if(this.failNextUpload){this.failNextUpload=false;throw Error('INJECTED_UPLOAD_FAILURE');}
  if(id){const f=this.findById(id);if(!f)throw Error('missing remote ID');f.bytes=data(bytes);}
  else{if(this.files.has(name))throw Error('duplicate');this.files.set(name,{id:'id-'+(++this.serial),bytes:data(bytes),parentId:parent});}
  if(this.afterNextUpload){const action=this.afterNextUpload;this.afterNextUpload=null;action(this);}
  return{id:id||this.files.get(name).id};
 }
 async createFolder(){throw Error('No nested folders in this fixture');}
 read(p){const f=this.files.get(p);return f?dec(f.bytes):null;}
 edit(p,s){const f=this.files.get(p);if(!f)throw Error('missing');f.bytes=enc(s);}
}
class Device{
 constructor(label,cloud){this.name=label;this.vault=new Vault(label);this.cloud=cloud;this.state={baseline:{},remoteRootId:ROOT};
  this.engine=new ctx.sync.SyncEngine(this.vault,cloud,async()=>this.state,async patch=>{this.state={...this.state,...patch};});}
 async preview(){return this.engine.preview(ROOT);}
 async sync(){const p=await this.preview();if(p.plan.blocked.length)return{blocked:p.plan.blocked,applied:false,plan:p.plan};
  const report=await this.engine.apply(p,true);
  return{...report,applied:true,plan:p.plan};}
}
const count={passed:0};
async function scenario(name,fn){await fn();count.passed++;console.log('PASS 3DEV '+count.passed+' '+name);}
(async()=>{
 const cloud=new Cloud();cloud.seed('Projeto NEXA.md',ORIGINAL);
 const win=new Device('Windows',cloud),ios=new Device('iPhone',cloud),ipad=new Device('iPad',cloud);
 await scenario('initial distribution to Windows/iPhone/iPad',async()=>{
  for(const device of [win,ios,ipad]){
   const r=await device.sync();assert.equal(r.failed.length,0);assert.equal(device.vault.read('Projeto NEXA.md'),ORIGINAL);
   assert.equal(device.state.baseline['Projeto NEXA.md'].md5,ctx.core.md5(enc(ORIGINAL)));
  }
 });
 await scenario('Windows edit automatically becomes available on iPhone/iPad at their next sync',async()=>{
  win.vault.edit('Projeto NEXA.md',ORIGINAL.replace('Iluminação original','Iluminação Windows'));
  assert.equal((await win.sync()).failed.length,0);
  for(const device of [ios,ipad]){
   assert.equal((await device.sync()).failed.length,0);
   assert.match(device.vault.read('Projeto NEXA.md'),/Iluminação Windows/);
  }
 });
 await scenario('iPhone edit returns to Windows/iPad via same Drive',async()=>{
  ios.vault.edit('Projeto NEXA.md',ios.vault.read('Projeto NEXA.md').replace('Materiais originais','Materiais iPhone'));
  assert.equal((await ios.sync()).failed.length,0);
  for(const device of [win,ipad]){
   assert.equal((await device.sync()).failed.length,0);
   assert.match(device.vault.read('Projeto NEXA.md'),/Materiais iPhone/);
  }
 });
 await scenario('different new files from Windows and iPad survive',async()=>{
  win.vault.edit('Windows.md','Documento Windows');
  ipad.vault.edit('iPad.md','Documento iPad');
  assert.equal((await win.sync()).failed.length,0);
  assert.equal((await ipad.sync()).failed.length,0);
  assert.equal((await ios.sync()).failed.length,0);
  assert.equal(ios.vault.read('Windows.md'),'Documento Windows');
  assert.equal(ios.vault.read('iPad.md'),'Documento iPad');
  await win.sync();await ipad.sync();
  assert.equal(win.vault.read('iPad.md'),'Documento iPad');
 });
 await scenario('3-way merge preserves different lines from Windows and iPad (iPhone catches up)',async()=>{
  const path='Projeto NEXA.md',current=cloud.read(path);
  win.vault.edit(path,current.replace('Iluminação Windows','Iluminação Windows V2'));
  ipad.vault.edit(path,current.replace('Materiais iPhone','Materiais iPad V2'));
  assert.equal((await win.sync()).failed.length,0);
  const p=await ipad.preview();
  assert.equal(p.plan.blocked.length,0);assert.equal(p.plan.actions.length,1);
  assert.equal(p.plan.actions[0].type,'MERGE_UPDATE');
  assert.equal((await ipad.engine.apply(p,true)).failed.length,0);
  const expected=current.replace('Iluminação Windows','Iluminação Windows V2').replace('Materiais iPhone','Materiais iPad V2');
  assert.equal(cloud.read(path),expected);assert.equal(ipad.vault.read(path),expected);
  assert.equal((await ios.sync()).failed.length,0);
  assert.equal(ios.vault.read(path),expected);
  assert.equal((await win.sync()).failed.length,0);
  assert.equal(win.vault.read(path),expected);
 });
 await scenario('overlapping edits block all uploads, without overwriting either copy',async()=>{
  const path='Projeto NEXA.md',current=cloud.read(path);
  win.vault.edit(path,current.replace('Conclusão','Conclusão Windows'));
  ios.vault.edit(path,current.replace('Conclusão','Conclusão iPhone'));
  assert.equal((await win.sync()).failed.length,0);
  const remoteBefore=cloud.read(path),localBefore=ios.vault.read(path);
  const check=await ios.sync();
  assert.equal(check.applied,false);
  assert.equal(check.blocked[0].reason,'ALTERACAO_CONCORRENTE');
  assert.equal(cloud.read(path),remoteBefore);
  assert.equal(ios.vault.read(path),localBefore);
 });
 await scenario('local deletion blocked, remote content remains untouched',async()=>{
  const path='iPad.md';const before=cloud.read(path);ios.vault.files.delete(path);
  const check=await ios.sync();assert.equal(check.applied,false);
  assert.ok(check.blocked.some(x=>x.reason==='LOCAL_AUSENTE_OU_EXCLUIDO'));
  assert.equal(cloud.read(path),before);
  ios.vault.edit(path,before);
 });
 await scenario('remote edit after preview invalidates approval (no stale overwrite)',async()=>{
  // resolve previous conflicting branch explicitly by using a different independent file
  const path='Windows.md';const before=cloud.read(path);
  win.vault.edit(path,before+' local edit');
  const snapshot=await win.preview();
  assert.ok(snapshot.plan.actions.some(a=>a.path===path));
  cloud.edit(path,before+' remote edit');
  await assert.rejects(()=>win.engine.apply(snapshot,true),/estado mudou|aprovação cancelada/);
  assert.equal(win.vault.read(path),before+' local edit');
  assert.equal(cloud.read(path),before+' remote edit');
  win.vault.edit(path,before); // restore local, baseline unchanged
  const restored=await win.sync();
  assert.equal(restored.applied,true);
  assert.equal(win.vault.read(path),before+' remote edit');
 });
 await scenario('network failure on update keeps local edit and base, with no remote overwrite',async()=>{
  const path='iPad.md',before=cloud.read(path),base=ipad.state.baseline[path].md5;
  ipad.vault.edit(path,before+' changed on iPad');
  cloud.failNextUpload=true;
  const response=await ipad.sync();
  assert.equal(response.failed.length,1);assert.match(response.failed[0].reason,/INJECTED_UPLOAD_FAILURE/);
  assert.equal(cloud.read(path),before);
  assert.equal(ipad.vault.read(path),before+' changed on iPad');
  assert.equal(ipad.state.baseline[path].md5,base);
  const retry=await ipad.sync();
  assert.equal(retry.failed.length,0,'RETRY_FAILURE: '+JSON.stringify(retry.failed));
  assert.equal(cloud.read(path),before+' changed on iPad');
  await ios.sync(); await win.sync();
 });
 await scenario('first-sync divergent same filename is blocked without overwriting',async()=>{
  const fresh=new Device('Fresh unapproved tablet',cloud);
  fresh.vault.edit('Projeto NEXA.md','Outra versão da nota');
  const plan=await fresh.preview();
  assert.ok(plan.plan.blocked.some(x=>x.reason==='PRIMEIRA_SINC_DIVERGENTE'));
  assert.equal(fresh.vault.read('Projeto NEXA.md'),'Outra versão da nota');
 });
 await scenario('unapproved action and expired snapshot are rejected',async()=>{
  const d=new Device('new',cloud),p=await d.preview();
  await assert.rejects(()=>d.engine.apply(p,false),/confirmação explícita/);
  p.createdAt='2000-01-01T00:00:00.000Z';
  await assert.rejects(()=>d.engine.apply(p,true),/Prévia expirada/);
 });
 await scenario('metadata of private .obsidian folder never sent to Drive',async()=>{
  const d=new Device('isolated',cloud);
  d.vault.edit('.obsidian/secret.json','{"private":true}');
  const p=await d.preview();
  assert.ok(!p.plan.actions.some(a=>a.path.includes('.obsidian')));
  assert.equal(cloud.files.has('.obsidian/secret.json'),false);
 });
 await scenario('stable state is idempotent, zero upload/download actions',async()=>{
  const d=new Device('clean',cloud);
  assert.equal((await d.sync()).failed.length,0);
  const before=[...cloud.files].map(([p,f])=>[p,ctx.core.md5(f.bytes)]);
  const second=await d.sync();
  assert.equal(second.plan.actions.length,0);
  assert.deepEqual([...cloud.files].map(([p,f])=>[p,ctx.core.md5(f.bytes)]),before);
 });
 console.log('PASS LAB: '+count.passed+' separate scenarios, 3 device replicas and one shared mock Drive');
})().catch(e=>{console.error(e);process.exitCode=1});
