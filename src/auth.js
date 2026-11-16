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
  function secureRelay(relay){
    if(!relay?.url||!relay?.key)throw Error('Configure o NEXA OAuth Relay.');
    let u;try{u=new URL(relay.url);}catch(_){throw Error('Endereço do Relay inválido.');}
    if(u.protocol!=='https:'||!u.hostname.endsWith('.run.app')||u.pathname!=='/v1/token'||
      u.search||u.hash||u.username||u.password)throw Error('Relay LAB: somente HTTPS no Cloud Run.');
    if(!/^[a-f0-9]{64}$/i.test(relay.key))throw Error('Chave do Relay inválida (64 caracteres).');
    return u.href;
  }
  async function exchange(request,clientId,code,verifier,relay){
    if(!code||!verifier)throw Error('Código/verificador ausente.');
    return tokenRequest(request,new URLSearchParams({grant_type:'authorization_code',
      code,code_verifier:verifier}).toString(),relay);
  }
  async function refresh(request,clientId,token,relay){
    return tokenRequest(request,new URLSearchParams({
      grant_type:'refresh_token',refresh_token:token}).toString(),relay);
  }
  async function tokenRequest(request,body,relay){
    const url=secureRelay(relay);
    const r=await request({url,method:'POST',contentType:'application/x-www-form-urlencoded',
      headers:{'Content-Type':'application/x-www-form-urlencoded','X-Nexa-Relay-Key':relay.key},
      body,throw:false});
    if(r.status!==200){
      let value={};try{value=r.json||JSON.parse(r.text||'{}');}catch(_){}
      const err=String(value.error||''),hint=String(value.hint||'');
      const code=/^[a-z][a-z0-9_]{0,49}$/.test(err)?err:'unknown';
      const category=/^[A-Z][A-Z0-9_]{0,50}$/.test(hint)?hint:'REVISAR_SERVICO';
      throw Error('OAuth Relay: HTTP '+r.status+' ('+code+') ['+category+']');
    }
    const output=r.json||JSON.parse(r.text);
    if(!output.access_token||!output.expires_in)throw Error('Resposta OAuth incompleta.');
    return output;
  }
  return {start,exchange,refresh,CALLBACK,SCOPE};
})();
