'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={crypto:require('node:crypto').webcrypto,TextEncoder,URLSearchParams,Uint8Array,Date,btoa,console};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('src/auth.js','utf8')+';this.auth=NEXA_AUTH;',ctx);
(async()=>{
 const cases=[
 {error:'invalid_request',error_description:'Missing required parameter: client_secret',want:/HTTP 400 \(invalid_request\) \[CLIENT_SECRET_REQUERIDO\]/},
 {error:'invalid_grant',error_description:'Token has expired or has been used',want:/HTTP 400 \(invalid_grant\) \[CODIGO_EXPIRADO_OU_REUTILIZADO\]/},
 {error:'invalid_client',error_description:'The OAuth client is not valid',want:/HTTP 400 \(invalid_client\) \[REVISAR_CONFIGURACAO\]/},
 {error:'invalid_request',error_description:'redirect_uri mismatch',want:/HTTP 400 \(invalid_request\) \[REDIRECT_URI\]/},
 {error:'invalid_grant',error_description:'Invalid code_verifier in PKCE',want:/HTTP 400 \(invalid_grant\) \[PKCE\]/},
 {error:'INVALID_CODE_SECRET_TOKEN',error_description:'secret-value-123',want:/HTTP 400 \(unknown\) \[REVISAR_CONFIGURACAO\]/}
 ];
 for(const item of cases){
   const request=async()=>({status:400,json:item});
   await assert.rejects(()=>ctx.auth.exchange(request,'1234-test.apps.googleusercontent.com','codeSECRET','verifierSECRET'),e=>{
     assert.match(e.message,item.want);
     for(const hidden of ['secret-value-123','codeSECRET','verifierSECRET'])
       assert.equal(e.message.includes(hidden),false);
     return true;
   });
 }
 console.log('PASS OAuth detail: safe 400 error classification, no raw descriptions or credentials');
})().catch(e=>{console.error(e);process.exitCode=1;});
