/* NEXA conservative, line-based diff3 merge. No network or secrets. */
const NEXA_MERGE=(()=>{
 'use strict';
 const MAX_BYTES=256*1024, MAX_LINES=1200, MAX_CELLS=1500000;
 const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
 function encode(text){return encoder.encode(text);}
 function decode(data){
   const b=data instanceof Uint8Array?data:new Uint8Array(data);
   if(b.byteLength>MAX_BYTES)throw Error('BASE_ACIMA_DO_LIMITE');
   const text=decoder.decode(b);
   if(text.includes('\0'))throw Error('CONTEUDO_NAO_TEXTUAL');
   return text;
 }
 function edits(base,other){
   const n=base.length,m=other.length;
   if(n>MAX_LINES||m>MAX_LINES||(n+1)*(m+1)>MAX_CELLS)throw Error('TEXTO_COMPLEXO_DEMAIS');
   const dp=Array.from({length:n+1},()=>new Uint16Array(m+1));
   for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)
     dp[i][j]=base[i]===other[j]?1+dp[i+1][j+1]:Math.max(dp[i+1][j],dp[i][j+1]);
   const out=[];let h=null,i=0,j=0;
   while(i<n||j<m){
     if(i<n&&j<m&&base[i]===other[j]){
       if(h){h.end=i;out.push(h);h=null;} i++;j++;continue;
     }
     if(!h)h={start:i,end:i,content:[]};
     if(j<m&&(i>=n||dp[i][j+1]>=dp[i+1][j]))h.content.push(other[j++]);
     else{i++;h.end=i;}
   }
   if(h){h.end=i;out.push(h);}
   return out;
 }
 function same(a,b){
   return a.start===b.start&&a.end===b.end&&
     a.content.length===b.content.length&&a.content.every((x,i)=>x===b.content[i]);
 }
 function touch(a,b){return a.start<=b.end&&b.start<=a.end;}
 function merge(baseText,localText,remoteText){
   if([baseText,localText,remoteText].some(s=>typeof s!=='string'||encode(s).byteLength>MAX_BYTES))
     return {ok:false,reason:'ARQUIVO_MERGE_ACIMA_LIMITE'};
   if(localText===remoteText)return {ok:true,text:localText,changes:0};
   try{
     const base=baseText.split('\n'),loc=localText.split('\n'),rem=remoteText.split('\n');
     const left=edits(base,loc),right=edits(base,rem);
     for(const a of left)for(const b of right)if(touch(a,b)&&!same(a,b))
       return {ok:false,reason:'TRECHOS_SOBREPOSTOS'};
     const all=left.slice();
     for(const b of right)if(!all.some(a=>same(a,b)))all.push(b);
     all.sort((a,b)=>a.start-b.start||a.end-b.end);
     const out=[];let pos=0;
     for(const h of all){
       if(h.start<pos)return {ok:false,reason:'HUNKS_SOBREPOSTOS'};
       out.push(...base.slice(pos,h.start),...h.content);pos=h.end;
     }
     out.push(...base.slice(pos));
     const text=out.join('\n');
     if(encode(text).byteLength>MAX_BYTES)return {ok:false,reason:'RESULTADO_MUITO_GRANDE'};
     return {ok:true,text,changes:all.length};
   }catch(e){return {ok:false,reason:String(e.message||e)};}
 }
 return {encode,decode,merge,MAX_BYTES};
})();
