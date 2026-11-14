'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const code=fs.readFileSync('src/platform.js','utf8');
const ctx={};vm.createContext(ctx);vm.runInContext(code+'\nthis.NEXA_PLATFORM_TEST=NEXA_PLATFORM;',ctx);
const platform=ctx.NEXA_PLATFORM_TEST;
assert.equal(platform.classify({isDesktopApp:true,isWin:true}),'windows');
assert.equal(platform.classify({isDesktopApp:true,isMacOS:true}),'desktop');
assert.equal(platform.classify({isIosApp:true,isMobileApp:true}),'ios');
assert.equal(platform.classify({isAndroidApp:true,isMobileApp:true}),'android');
assert.equal(platform.classify({}),'unknown');
let i=platform.audit({vault:{adapter:{getBasePath:()=>String.raw`G:\Meu Drive\Obsidian-Lab`}}},{isDesktopApp:true,isWin:true});
assert.equal(i.cloudPathHint,true);
assert.equal(i.hasLocalPath,true);
assert.deepEqual(Object.keys(i).sort(),['cloudPathHint','hasLocalPath','target']);
i=platform.audit({vault:{adapter:{getBasePath:()=>String.raw`C:\NEXA_LABS\Obsidian-Lab`}}},{isDesktopApp:true,isWin:true});
assert.equal(i.cloudPathHint,false);
i=platform.audit({vault:{adapter:{getBasePath(){throw Error('denied')}}}},{isDesktopApp:true,isWin:true});
assert.equal(i.hasLocalPath,false);
i=platform.audit({vault:{adapter:{getBasePath(){throw Error('mobile must not call')}}}},{isIosApp:true,isMobileApp:true});
assert.equal(i.target,'ios');
assert.equal(i.hasLocalPath,false);
const main=fs.readFileSync('main.js','utf8');
assert.match(main,/NEXA_PLATFORM/);
assert.match(main,/firstSyncApproved/);
assert.match(main,/boundRootId/);
assert.match(main,/classify\(Platform\)/);
assert.doesNotMatch(main,/require\(['"](?:fs|electron|path|crypto)['"]\)/);
// Exercise the real plugin's automatic-sync gate without network or local filesystem I/O.
const runtime={module:{exports:{}},require:name=>{
  if(name!=='obsidian')throw Error('unexpected require '+name);
  return {Plugin:class{},PluginSettingTab:class{},Setting:class{},Modal:class{},Notice:class{},
    requestUrl:async()=>{throw Error('network should not be used')},
    Platform:{isDesktopApp:true,isWin:true}};
},console,Date,Map,Set,Uint8Array,ArrayBuffer,DataView,TextEncoder,URLSearchParams};
vm.createContext(runtime);
for(const n of ['core','audit','auth','drive','sync','platform','plugin-ios']){
  vm.runInContext(fs.readFileSync('src/'+n+'.js','utf8'),runtime);
}
(async()=>{
  const PluginClass=runtime.module.exports;
  const plugin=new PluginClass();
  let previews=0;
  plugin.busy=false;plugin.nextTick=0;
  plugin.app={workspace:{getLeavesOfType:()=>[]},vault:{read:async()=>''}};
  plugin.settings={autoSync:true,firstSyncApproved:false,boundRootId:'',remoteRootId:'root-123456789',intervalMinutes:5,lastStatus:''};
  plugin.snapshot=async()=>{previews++;return{plan:{blocked:[],actions:[]}};};
  plugin.saveSettings=async()=>{};
  await plugin.maybeAutoSync();
  assert.equal(previews,0,'no automatic sync before manual approval');
  plugin.settings.firstSyncApproved=true;plugin.settings.boundRootId='another-root';
  await plugin.maybeAutoSync();
  assert.equal(previews,0,'no automatic sync after changing remote root');
  plugin.settings.boundRootId=plugin.settings.remoteRootId;
  await plugin.maybeAutoSync();
  assert.equal(previews,1,'automatic sync may preview only after manual approval');
  plugin.settings.firstSyncApproved=false;plugin.settings.boundRootId='';
  plugin.busy=false;
  plugin.engine=()=>({apply:async()=>({status:'CONCLUIDO_COM_READBACK',success:[{type:'UPLOAD_NEW'}],blocked:[],failed:[]})});
  await plugin.applySnapshot({rootId:'root-123456789',plan:{actions:[{type:'UPLOAD_NEW'}],blocked:[],unchanged:[]}});
  assert.equal(plugin.settings.firstSyncApproved,true,'manual success records approval');
  assert.equal(plugin.settings.boundRootId,'root-123456789','approved root is persisted');
  console.log('PASS Windows desktop: platform, local vault advisory, first-sync permission and root guard');
})().catch(e=>{console.error(e);process.exitCode=1;});
