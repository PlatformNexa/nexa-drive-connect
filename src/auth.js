/* NEXA OAuth public-client PKCE (no embedded secret). iOS: HTTPS callback -> obsidian://. */
const NEXA_AUTH = (() => {
  'use strict';
  const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
  const TOKEN_URL = 'https://oauth2.googleapis.com/token';
  const CALLBACK = 'https://platformnexa.github.io/nexa-drive-connect/callback.html';
  const SCOPE = 'https://www.googleapis.com/auth/drive';
  function randomUrlSafe(n) {
    const bytes = new Uint8Array(n); crypto.getRandomValues(bytes);
    return Array.from(bytes, b=>b.toString(16).padStart(2,'0')).join('');
  }
  async function challenge(verifier) {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));
    let s=''; for(const b of digest) s+=String.fromCharCode(b);
    return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
  }
  async function start(clientId) {
    if(!/^\d+-[a-z0-9-]+\.apps\.googleusercontent\.com$/.test(clientId||''))throw new Error('Client ID Google inválido.');
    const verifier=randomUrlSafe(32), state=randomUrlSafe(18);
    const q=new URLSearchParams({client_id:clientId,redirect_uri:CALLBACK,response_type:'code',scope:SCOPE,
      access_type:'offline',prompt:'consent',code_challenge_method:'S256',code_challenge:await challenge(verifier),state});
    return {verifier,state,expires:Date.now()+15*60*1000,url:AUTH_URL+'?'+q.toString()};
  }
  async function exchange(request, clientId, code, verifier) {
    if(!code || !verifier)throw new Error('Código/verificador ausente.');
    const body=new URLSearchParams({client_id:clientId,code,code_verifier:verifier,
      grant_type:'authorization_code',redirect_uri:CALLBACK}).toString();
    return tokenRequest(request,body);
  }
  async function refresh(request,clientId,refreshToken){
    const body=new URLSearchParams({client_id:clientId,refresh_token:refreshToken,grant_type:'refresh_token'}).toString();
    return tokenRequest(request,body);
  }
  async function tokenRequest(request,body){
    const r=await request({url:TOKEN_URL,method:'POST',contentType:'application/x-www-form-urlencoded',body,
      headers:{'Content-Type':'application/x-www-form-urlencoded'},throw:false});
    if(r.status!==200) throw new Error('OAuth Google: HTTP '+r.status+'. Revise cliente, redirecionamento e autorização.');
    const out=r.json||JSON.parse(r.text);
    if(!out.access_token || !out.expires_in)throw new Error('Resposta OAuth incompleta.');
    return out;
  }
  return {start,exchange,refresh,CALLBACK,SCOPE};
})();
