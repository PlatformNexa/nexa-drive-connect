'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const settings=[],secrets=new Map();let status=400,calls=0;
const context={module:{exports:{}},Date,Map,Set,Uint8Array,Uint16Array,ArrayBuffer,DataView,TextEncoder,TextDecoder,URLSearchParams,URL,console,
 require:n=>{assert.equal(n,'obsidian');return{Plugin:class{},PluginSettingTab:class{},Setting:class{},Modal:class{},Notice:class{},
 requestUrl:async()=>{calls++;return{status,json:{error:'invalid_client',hint:'GOOGLE_REJECTED'}};},
 Platform:{isDesktopApp:true,isWin:true}}}};
vm.createContext(context);
for(const n of ['core','audit','auth','drive','sync','merge','diff','platform','plugin-ios'])
 vm.runInContext(fs.readFileSync('src/'+n+'.js','utf8'),context);
(async()=>{
 const plugin=new context.module.exports();
 plugin.settings={clientId:'1234-test.apps.googleusercontent.com',relayUrl:'https://lab.a.run.app'};
 plugin.app={secretStorage:{getSecret:k=>secrets.get(k)||'',setSecret:(k,v)=>secrets.set(k,v)}};
 plugin.saveSettings=async()=>settings.push(JSON.stringify(plugin.settings));
 await plugin.recordOAuthStage('AGUARDANDO_RETORNO');
 assert.equal(plugin.settings.oauthDiagnostic.stage,'AGUARDANDO_RETORNO');
 await plugin.updateSecret({relayAccessKey:'a'.repeat(64),pendingOAuth:{state:'stateSECRET',verifier:'verifierSECRET',expires:Date.now()+60000}});
 await plugin.handleOAuth({state:'stateSECRET',code:'codeSECRET'});
 assert.equal(calls,1);assert.equal(plugin.settings.oauthDiagnostic.stage,'ERRO_TOKEN');
 assert.equal(plugin.settings.oauthDiagnostic.detail,'Google HTTP 400 · invalid_client · GOOGLE_REJECTED');
 for(const secret of ['codeSECRET','stateSECRET','verifierSECRET', 'a'.repeat(64)])
  assert.equal(settings.join('').includes(secret),false);
 await plugin.updateSecret({pendingOAuth:{state:'expected',verifier:'otherSECRET',expires:Date.now()+60000}});
 await plugin.handleOAuth({state:'wrong',code:'code2SECRET'});
 assert.equal(calls,1);assert.equal(plugin.settings.oauthDiagnostic.stage,'ERRO_RETORNO');
 console.log('PASS OAuth diagnostic with relay: failure category, state mismatch, no credentials in data.json');
})().catch(e=>{console.error(e);process.exitCode=1;});
