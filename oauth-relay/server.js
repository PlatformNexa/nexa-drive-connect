'use strict';
// NEXA OAuth Relay: credential exchange only. Never receives Drive file contents.
const http=require('node:http');
const crypto=require('node:crypto');
const TOKEN_URL='https://oauth2.googleapis.com/token';
const CALLBACK='https://platformnexa.github.io/nexa-drive-connect/callback.html';
const MAX_BODY=4096;
function validConfig(c){
 if(!/^\d+-[a-z0-9-]+\.apps\.googleusercontent\.com$/.test(c.clientId||''))throw Error('OAUTH_CLIENT_ID ausente ou inválido');
 if(typeof c.clientSecret!=='string'||c.clientSecret.length<8)throw Error('OAUTH_CLIENT_SECRET ausente');
 if(!/^[a-f0-9]{64}$/i.test(c.accessKey||''))throw Error('RELAY_ACCESS_KEY deve ter 64 caracteres hexadecimais');
 return c;
}
function safeEqual(a,b){
 const x=Buffer.from(typeof a==='string'?a:'', 'utf8'),y=Buffer.from(b,'utf8');
 return x.length===y.length&&crypto.timingSafeEqual(x,y);
}
function send(res,status,data){
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private',
  'Pragma':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
 res.end(JSON.stringify(data));
}
async function readBody(req){
 let total=0;const chunks=[];
 for await(const chunk of req){
  total+=chunk.length;
  if(total>MAX_BODY)throw Error('BODY_TOO_LARGE');
  chunks.push(chunk);
 }
 return Buffer.concat(chunks).toString('utf8');
}
function classifyGoogleError(payload){
 const raw=String(payload&&payload.error||'');
 const error=/^[a-z][a-z0-9_]{0,49}$/.test(raw)?raw:'google_error';
 const detail=String(payload&&payload.error_description||'').toLowerCase();
 let hint='GOOGLE_REJECTED';
 if(detail.includes('client_secret'))hint='CLIENT_SECRET_INVALID';
 else if(detail.includes('redirect_uri'))hint='REDIRECT_URI_MISMATCH';
 else if(detail.includes('code_verifier')||detail.includes('pkce'))hint='PKCE_MISMATCH';
 else if(/expired|already used|reused/.test(detail))hint='CODE_EXPIRED_OR_REUSED';
 return {error,hint};
}
function makeHandler(rawConfig,fetcher=globalThis.fetch){
 const config=validConfig(rawConfig),rate={start:0,count:0};let inFlight=0;
 return async(req,res)=>{
  try{
   const pathname=new URL(req.url,'http://local.invalid').pathname;
   if(req.method==='GET'&&pathname==='/health'){send(res,200,{service:'NEXA OAuth Relay',ready:true});return;}
   if(pathname!=='/v1/token'){send(res,404,{error:'not_found'});return;}
   if(req.method!=='POST'){send(res,405,{error:'method_not_allowed'});return;}
   if(!safeEqual(req.headers['x-nexa-relay-key'],config.accessKey)){
     send(res,401,{error:'unauthorized'});return;
   }
   const now=Date.now();
   if(now-rate.start>60000){rate.start=now;rate.count=0;}
   if(++rate.count>30||inFlight>=5){send(res,429,{error:'rate_limited'});return;}
   const contentType=String(req.headers['content-type']||'').split(';')[0].trim().toLowerCase();
   if(contentType!=='application/x-www-form-urlencoded'){
     send(res,415,{error:'unsupported_content_type'});return;
   }
   let body;
   try{body=await readBody(req);}catch(_){send(res,413,{error:'body_too_large'});return;}
   const q=new URLSearchParams(body);
   const grant=q.get('grant_type');
   const upstream=new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret});
   if(grant==='authorization_code'){
     const code=q.get('code')||'',verifier=q.get('code_verifier')||'';
     if(code.length<8||code.length>2048||/[\x00-\x1f\x7f]/.test(code)||
       !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)){
       send(res,400,{error:'invalid_request',hint:'CODE_OR_PKCE_INVALID'});return;
     }
     upstream.set('grant_type',grant);upstream.set('code',code);
     upstream.set('code_verifier',verifier);upstream.set('redirect_uri',CALLBACK);
   }else if(grant==='refresh_token'){
     const refresh=q.get('refresh_token')||'';
     if(refresh.length<10||refresh.length>2048||/[\x00-\x1f\x7f]/.test(refresh)){
       send(res,400,{error:'invalid_request',hint:'REFRESH_TOKEN_INVALID'});return;
     }
     upstream.set('grant_type',grant);upstream.set('refresh_token',refresh);
   }else{send(res,400,{error:'unsupported_grant_type'});return;}
   inFlight++;
   try{
     const response=await fetcher(TOKEN_URL,{method:'POST',
       headers:{'Content-Type':'application/x-www-form-urlencoded','Cache-Control':'no-store'},
       body:upstream.toString(),signal:AbortSignal.timeout(10000)});
     let payload={};
     try{payload=await response.json();}catch(_){}
     if(!response.ok){send(res,response.status===400?400:502,classifyGoogleError(payload));return;}
     if(typeof payload.access_token!=='string'||!Number.isFinite(Number(payload.expires_in))){
       send(res,502,{error:'google_invalid_response'});return;
     }
     const token={access_token:payload.access_token,expires_in:Number(payload.expires_in)};
     if(typeof payload.refresh_token==='string')token.refresh_token=payload.refresh_token;
     send(res,200,token);
   }catch(_){send(res,502,{error:'google_unavailable'});}
   finally{inFlight--;}
  }catch(_){send(res,500,{error:'internal_error'});}
 };
}
if(require.main===module){
 const config=validConfig({clientId:process.env.OAUTH_CLIENT_ID,
   clientSecret:process.env.OAUTH_CLIENT_SECRET,accessKey:process.env.RELAY_ACCESS_KEY});
 http.createServer(makeHandler(config)).listen(Number(process.env.PORT||8080),'0.0.0.0');
}
module.exports={makeHandler,validConfig,classifyGoogleError,CALLBACK};
