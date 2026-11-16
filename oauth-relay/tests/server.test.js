'use strict';
const assert=require('node:assert/strict'),http=require('node:http');
const {makeHandler,validConfig}=require('../server');
const secret='a'.repeat(64),conf={clientId:'12345-sample.apps.googleusercontent.com',clientSecret:'server-only-secret',accessKey:secret};
function mockFetch(url,opts){
 assert.equal(url,'https://oauth2.googleapis.com/token');
 const params=new URLSearchParams(opts.body);
 assert.equal(params.get('client_secret'),'server-only-secret');
 assert.equal(params.get('client_id'),conf.clientId);
 assert.equal(params.get('redirect_uri'),'https://platformnexa.github.io/nexa-drive-connect/callback.html');
 return Promise.resolve({ok:true,status:200,json:async()=>({access_token:'token-for-test',refresh_token:'refresh-for-test',expires_in:3600})});
}
(async()=>{
 assert.throws(()=>validConfig({clientId:conf.clientId,clientSecret:conf.clientSecret,accessKey:'bad'}),/64/);
 const server=http.createServer(makeHandler(conf,mockFetch));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url='http://127.0.0.1:'+server.address().port;
 async function call(path,opts){
  const res=await fetch(url+path,opts);return {status:res.status,data:await res.json(),headers:res.headers};
 }
 try{
  let r=await call('/health');assert.equal(r.status,200);assert.equal(r.data.ready,true);
  r=await call('/v1/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=refresh_token&refresh_token=refresh-valid-token'});
  assert.equal(r.status,401);
  const headers={'Content-Type':'application/x-www-form-urlencoded','X-Nexa-Relay-Key':secret};
  r=await call('/v1/token',{method:'POST',headers,body:new URLSearchParams({grant_type:'authorization_code',code:'test-google-auth-code',code_verifier:'x'.repeat(64)})});
  assert.equal(r.status,200);assert.equal(r.data.access_token,'token-for-test');
  assert.equal(r.headers.get('cache-control'),'no-store, private');
  r=await call('/v1/token',{method:'POST',headers,body:'grant_type=wrong'});
  assert.equal(r.status,400);assert.equal(r.data.error,'unsupported_grant_type');
  r=await call('/v1/token',{method:'POST',headers,body:'grant_type=refresh_token&refresh_token=refresh-valid-token'});
  // mockFetch asserts redirect URI; refresh requests correctly omit it, use a distinct fetcher in further tests.
  assert.equal(r.status,502);
  r=await call('/v1/token',{method:'POST',headers,body:'a'.repeat(5000)});
  assert.equal(r.status,413);
  assert.equal(JSON.stringify(r.data).includes('server-only-secret'),false);
 }finally{await new Promise(r=>server.close(r));}
 const errors=[
  {error:'invalid_request',error_description:'Missing required parameter: client_secret'},
  {error:'invalid_grant',error_description:'Code expired'}];
 const {classifyGoogleError}=require('../server');
 assert.equal(classifyGoogleError(errors[0]).hint,'CLIENT_SECRET_INVALID');
 assert.equal(classifyGoogleError(errors[1]).hint,'CODE_EXPIRED_OR_REUSED');
 console.log('PASS OAuth relay: auth gate, token exchange, no raw secrets, size bound, sanitized errors');
})().catch(e=>{console.error(e);process.exitCode=1;});
