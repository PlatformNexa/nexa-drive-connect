'use strict';
// Activity/resume and editor safety using the real plugin class with an Obsidian test double.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const timers=new Map();let seq=0;
const windowMock={
 setTimeout(fn,ms){const id=++seq;timers.set(id,{fn,ms});return id;},
 clearTimeout(id){timers.delete(id);},
 setInterval(){return 1;}
};
const runtime={module:{exports:{}},window:windowMock,document:{hidden:false},
 TextEncoder,TextDecoder,Uint8Array,Uint16Array,ArrayBuffer,DataView,Map,Set,Date,URLSearchParams,console,
 require(n){if(n!=='obsidian')throw Error('Unexpected external dep');
 return {Plugin:class{},PluginSettingTab:class{},Setting:class{},Modal:class{},Notice:class{},
 requestUrl:async()=>{throw Error('no network expected')},
 Platform:{isDesktopApp:true,isWin:true}};}};
vm.createContext(runtime);
for(const n of ['core','audit','auth','drive','sync','merge','platform','plugin-ios'])
 vm.runInContext(fs.readFileSync('src/'+n+'.js','utf8'),runtime);
const Plugin=runtime.module.exports;
(async()=>{
 let plugin=new Plugin();plugin.settings={autoSync:false,firstSyncApproved:false,boundRootId:'',
  remoteRootId:'root-123456789'};plugin.activityTimer=0;plugin.lastActivityCheck=0;plugin.nextTick=900000;
 let invoked=0;plugin.maybeAutoSync=async()=>{invoked++;};
 plugin.requestSyncOnActivity('focus');assert.equal(timers.size,0,'no sync before user approves');
 plugin.settings.autoSync=true;plugin.settings.firstSyncApproved=true;plugin.settings.boundRootId='root-123456789';
 plugin.requestSyncOnActivity('focus');plugin.requestSyncOnActivity('file-open');plugin.requestSyncOnActivity('modify');
 assert.equal(timers.size,1,'bursts are debounced');
 const due=[...timers.values()][0];assert.equal(due.ms,1800);due.fn();
 assert.equal(invoked,1,'focus/modify lead to sync check');assert.equal(plugin.nextTick,0);
 timers.clear();plugin.lastActivityCheck=Date.now();
 plugin.requestSyncOnActivity('focus');[...timers.values()][0].fn();assert.equal(invoked,1,'rate limit after recent check');
 timers.clear();plugin.activityTimer=0;plugin.settings.boundRootId='different';
 plugin.requestSyncOnActivity('resume');
 assert.equal(timers.size,0,'remote root change blocks automatic resume');
 plugin.settings.boundRootId='root-123456789';
 const file={path:'Projeto.md'};
 plugin.app={workspace:{getLeavesOfType:()=>[{view:{file,editor:{getValue:()=> 'DRAFT NOT SAVED'}}}]},
  vault:{read:async()=> 'contents on disk'}};
 const dirty=await plugin.editorSafety({actions:[]});
 assert.equal(dirty.reason,'EDITOR_COM_ALTERACAO_PENDENTE');
 plugin.app.workspace.getLeavesOfType=()=>[{view:{file,editor:{getValue:()=> 'contents on disk'}}}];
 assert.equal(await plugin.editorSafety({actions:[]}),null);
 const active=await plugin.editorSafety({actions:[{type:'DOWNLOAD_UPDATE',path:'Projeto.md'}]});
 assert.equal(active.reason,'NOTA_ABERTA_AGUARDA_FECHAMENTO');
 assert.equal(await plugin.editorSafety({actions:[{type:'UPLOAD_UPDATE',path:'Projeto.md'}]}),null);
 plugin.app.workspace.getLeavesOfType=()=>[];
 delete plugin.maybeAutoSync; // Restore real SyncEngine orchestration after debounce-unit stub.
 plugin.settings.intervalMinutes=5;
 plugin.settings.lastStatus='';
 plugin.busy=false;plugin.nextTick=0;
 let readCalls=0,writes=0;
 plugin.snapshot=async()=>{readCalls++;return {plan:{actions:[{type:'DOWNLOAD_UPDATE',path:'Projeto.md'}],blocked:[]}};};
 plugin.engine=()=>({apply:async()=>{writes++;return{status:'OK',success:[{}],failed:[]};}});
 plugin.saveSettings=async()=>{};
 plugin.app.workspace.getLeavesOfType=()=>[{view:{file,editor:{getValue:()=> 'contents on disk'}}}];
 await plugin.maybeAutoSync();
 assert.equal(writes,0,'never auto overwrite an open note');
 assert.match(plugin.settings.lastStatus,/AGUARDANDO/);
 plugin.app.workspace.getLeavesOfType=()=>[];
 plugin.nextTick=0;await plugin.maybeAutoSync();
 assert.equal(writes,1,'safe inactive note update proceeds');
 assert.equal(readCalls,2);
 console.log('PASS activity: focus, resume, modify debounce, safe editor buffer, open note write guard');
})().catch(e=>{console.error(e);process.exitCode=1});
