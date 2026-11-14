'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={module:{exports:{}},Uint8Array,Uint16Array,ArrayBuffer,DataView,Map,Set,TextEncoder,TextDecoder,Date,URLSearchParams,console,
require(n){assert.equal(n,'obsidian');return{Plugin:class{},PluginSettingTab:class{},Setting:class{},Modal:class{},Notice:class{},requestUrl(){},Platform:{isDesktopApp:true,isWin:true}};}};
vm.createContext(context);
for(const n of ['core','audit','auth','drive','sync','merge','platform','plugin-ios'])
vm.runInContext(fs.readFileSync('src/'+n+'.js','utf8'),context);
const Plugin=context.module.exports;
(async()=>{
const p=new Plugin();p.settings={remoteRootId:'root-123456789',boundRootId:''};
p.engine=()=>({preview:async()=>({remote:{rootName:'Obsidian'}})});
await assert.rejects(()=>p.snapshot(),/MODO LAB.*bloqueado/,'Official Obsidian folder must be rejected');
p.engine=()=>({preview:async()=>({remote:{rootName:'NEXA_DRIVE_CONNECT_LAB'}})});
assert.equal((await p.snapshot()).remote.rootName,'NEXA_DRIVE_CONNECT_LAB');
p.settings.boundRootId='otherRoot';
await assert.rejects(()=>p.snapshot(),/Pasta remota alterada/);
console.log('PASS LAB GUARD: official Drive folder blocked; laboratory folder accepted; root switch blocked');
})().catch(e=>{console.error(e);process.exitCode=1});
