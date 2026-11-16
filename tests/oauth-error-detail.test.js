'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={crypto:require('node:crypto').webcrypto,TextEncoder,URLSearchParams,URL,Uint8Array,Date,btoa,console};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('src/auth.js','utf8')+';this.auth=NEXA_AUTH;',ctx);
(async()=>{
 const relay={url:'https://lab.a.run.app/v1/token',key:'a'.repeat(64)};
 for(const info of [
  {error:'invalid_request',hint:'CLIENT_SECRET_INVALID'},
  {error:'invalid_grant',hint:'CODE_EXPIRED_OR_REUSED'},
  {error:'invalid_client',hint:'GOOGLE_REJECTED'},
  {error:'invalid_request',hint:'REDIRECT_URI_MISMATCH'}]){
   const request=async()=>({status:400,json:info});
   await assert.rejects(()=>ctx.auth.exchange(request,'1234-test.apps.googleusercontent.com',
     'codeSECRET','verifierSECRET',relay),err=>{
     assert.match(err.message,/OAuth Relay: HTTP 400/);
     assert.ok(err.message.includes(info.error));
     assert.ok(err.message.includes(info.hint));
     assert.equal(err.message.includes('codeSECRET'),false);return true;
   });
 }
 await assert.rejects(()=>ctx.auth.exchange(async()=>({status:401,json:{error:'unauthorized'}}),'id','code','verifier',relay),/unauthorized/);
 console.log('PASS OAuth relay errors: sanitized HTTP status/category, no credential exposure');
})().catch(e=>{console.error(e);process.exitCode=1;});
