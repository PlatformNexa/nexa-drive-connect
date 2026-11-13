'use strict';
const fs=require('node:fs'),path=require('node:path');
const components=['core.js','audit.js','auth.js','drive.js','sync.js','plugin-ios.js'];
const out='/* NEXA Drive Connect · source: PlatformNexa/nexa-drive-connect */\n'+components.map(f=>`\n/* src/${f} */\n`+fs.readFileSync(path.join(__dirname,'src',f),'utf8')).join('\n');
for(const dest of ['main.js','dist/main.js']){fs.mkdirSync(path.dirname(path.join(__dirname,dest)),{recursive:true});fs.writeFileSync(path.join(__dirname,dest),out);}
fs.copyFileSync(path.join(__dirname,'manifest.json'),path.join(__dirname,'dist','manifest.json'));
console.log('Build NEXA:',out.length,'bytes');