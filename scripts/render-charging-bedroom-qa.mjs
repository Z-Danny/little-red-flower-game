// Four production-renderer frames. This is not a browser or physical-device test.
import {createRequire} from 'node:module';
import {existsSync,readdirSync,mkdtempSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
const root=resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url);
const {createCanvas,loadImage}=require(process.argv[2]||'@napi-rs/canvas');
const esbuildPath=readdirSync(join(root,'node_modules/.pnpm')).filter(n=>n.startsWith('esbuild@')).map(n=>join(root,'node_modules/.pnpm',n,'node_modules/esbuild')).find(p=>existsSync(join(p,'lib/main.js')));
const entry=join(mkdtempSync(join(tmpdir(),'bedroom-render-')),'renderer.mjs');
await require(esbuildPath).build({absWorkingDir:root,entryPoints:['components/game/scene-hunt/renderer.ts'],bundle:true,platform:'node',format:'esm',outfile:entry,logLevel:'silent'});
const {drawHunt}=await import(pathToFileURL(entry).href);
const pack=Object.fromEntries(['rules','skin','presentation'].map(k=>[k,JSON.parse(readFileSync(join(root,`content/scenes/charging-bedroom/${k}.json`)))]));
const art={};for(const key of ['scene','clean','safe','family'])art[key]=await loadImage(join(root,'public',pack.skin[key]));
const output=join(root,'docs/charging-bedroom/qa');mkdirSync(output,{recursive:true});
const initial={phase:'playing',elapsed:0,found:[],marking:null,revealAge:0,miss:null,peak:false,stars:0};
for(const [name,state]of Object.entries({initial,peak:{...initial,elapsed:93000,peak:true},marked:{...initial,elapsed:93000,found:Object.keys(pack.skin.targets)},ending:{...initial,phase:'complete',revealAge:5500,found:Object.keys(pack.skin.targets),stars:3}})){
  const c=createCanvas(720,1280);drawHunt(c.getContext('2d'),pack,art,state,false,null);writeFileSync(join(output,name+'.png'),c.toBuffer('image/png'));
}
console.log('Four production renderer frames: '+output);
