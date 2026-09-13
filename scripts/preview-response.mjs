import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { dependency, root } from './lib/dependencies.mjs';
const portIndex=process.argv.indexOf('--port');
const port=portIndex<0?3010:Number(process.argv[portIndex+1]);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('--port must be an integer between 1 and 65535');
const result=await dependency('esbuild').build({absWorkingDir:root,entryPoints:['scripts/response-preview.tsx'],bundle:true,platform:'browser',format:'iife',target:'es2020',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},write:false,logLevel:'silent'});
const js=result.outputFiles[0].contents;
let css=readFileSync(resolve(root,'app/globals.css'),'utf8').replace(/^@import\s+[^;]+;\s*/gm,'');
for(const name of ['typhoon','kitchen','configured','leaderboard','scene-hunt','disaster','game-viewport'])css+='\n'+readFileSync(resolve(root,`app/${name}.css`),'utf8');
const shell=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>小红花 · 声画验收</title><style>${css}</style><div id="game-root"></div><script src="/preview.js"></script>`;
const publicDir=resolve(root,'public'), offline=resolve(root,'outputs/本地离线版/小红花应急行动.html');
createServer((req,res)=>{
 try {
  const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  res.setHeader('Cache-Control','no-store');
  if(p==='/preview.js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');return res.end(js);}
  if(p==='/offline'&&existsSync(offline)){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(readFileSync(offline));}
  if(['/','/kitchen','/lab','/template'].includes(p)){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(shell);}
  const file=resolve(publicDir,'.'+p);if(!file.startsWith(publicDir+sep)||!existsSync(file)||!statSync(file).isFile()){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',({'.png':'image/png','.webp':'image/webp','.wav':'audio/wav','.mp3':'audio/mpeg'}[extname(file)]??'application/octet-stream'));res.end(readFileSync(file));
 }catch{res.statusCode=400;res.end();}
}).listen(port,'127.0.0.1',()=>console.log(`Preview: http://127.0.0.1:${port}/kitchen ; /lab ; /template ; /offline. Reference files are never served.`));
