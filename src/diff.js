// NEXA side-by-side line diff: conservative display, bounded computation, no HTML.
const NEXA_DIFF=(()=>{
 'use strict';
 const MAX_LINES=350,MAX_CELLS=125000,MAX_CHARS=90000;
 function compare(left,right){
   if(typeof left!=='string'||typeof right!=='string')return {available:false,reason:'Conteúdo não textual'};
   if(left.length>MAX_CHARS||right.length>MAX_CHARS)
     return {available:false,reason:'Prévia textual excede 90.000 caracteres; preserve as versões e compare externamente.'};
   const a=left.split('\n'),b=right.split('\n');
   if(a.length>MAX_LINES||b.length>MAX_LINES||(a.length+1)*(b.length+1)>MAX_CELLS)
     return {available:false,reason:'Documento excede o limite seguro da comparação visual (350 linhas por versão).'};
   const dp=Array.from({length:a.length+1},()=>new Uint16Array(b.length+1));
   for(let i=a.length-1;i>=0;i--)for(let j=b.length-1;j>=0;j--)
     dp[i][j]=a[i]===b[j]?1+dp[i+1][j+1]:Math.max(dp[i+1][j],dp[i][j+1]);
   const rows=[];let i=0,j=0,leftLine=1,rightLine=1,changes=0;
   function add(leftText,rightText,leftType,rightType){
     if(leftType!=='same'||rightType!=='same')changes++;
     rows.push({
       left:leftText===null?null:{line:leftLine++,text:leftText,type:leftType},
       right:rightText===null?null:{line:rightLine++,text:rightText,type:rightType}
     });
   }
   while(i<a.length||j<b.length){
     if(i<a.length&&j<b.length&&a[i]===b[j]){add(a[i++],b[j++],'same','same');continue;}
     const removed=[],added=[];
     while(i<a.length||j<b.length){
       if(i<a.length&&j<b.length&&a[i]===b[j])break;
       if(j<b.length&&(i>=a.length||dp[i][j+1]>dp[i+1][j]))added.push(b[j++]);
       else if(i<a.length)removed.push(a[i++]);
       else added.push(b[j++]);
     }
     for(let k=0;k<Math.max(removed.length,added.length);k++){
       const lt=k<removed.length?removed[k]:null,rt=k<added.length?added[k]:null;
       add(lt,rt,lt===null?'empty':rt===null?'removed':'modified',
                rt===null?'empty':lt===null?'added':'modified');
     }
   }
   return {available:true,rows,changes,leftLines:a.length,rightLines:b.length};
 }
 return {compare,MAX_LINES};
})();
