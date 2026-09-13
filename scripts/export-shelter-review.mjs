/** Refresh the existing review gallery, but run its player from maintained source.
 * Nine other review packs are data-only frozen snapshots, not production templates.
 */
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {Script} from 'node:vm';
import {dependency,root} from './lib/dependencies.mjs';
const history='D:/中关村/小红花/test1/work/response-batch-20260911';
const ids=['quake-cover-practice','quake-exit-practice','collapse-signal-practice','bleeding-pressure-practice','car-window-practice','flood-highground-practice','lift-contact-practice','electric-isolate-practice','fire-shelter-practice','fire-stairs-practice'];
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=b=>createHash('sha256').update(b).digest('hex');
const manifest={schemaVersion:1,kind:'offline-review-snapshot',artMode:'unified-storybook-v3',generatedAt:new Date().toISOString(),levels:ids.map(id=>{
 const base=id==='fire-shelter-practice'?root:history,rules=read(path.join(base,'content/levels',id,'level.json'));
 return{id,title:rules.title,order:rules.order,goalCount:rules.goals.length,medicalReviewRequired:['bleeding-pressure-practice','electric-isolate-practice'].includes(id),ruleHash:hash(JSON.stringify(rules)),skins:['illustrated','paper-gouache'].map(style=>({id:style,label:'统一暖纸 · 绘本',ready:true,errors:[],warnings:['本地技术审阅；不代表专业审核、真机或听感验收。'],pack:{rules,skin:read(path.join(base,'content/levels',id,'skins',style+'.json'))}}))};})};
const result=await dependency('esbuild').build({absWorkingDir:root,entryPoints:[path.join(history,'scripts/practice-preview.tsx')],tsconfig:path.join(root,'tsconfig.json'),bundle:true,platform:'browser',format:'iife',target:'es2020',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},write:false,minify:true,metafile:true,logLevel:'silent',plugins:[{name:'current-runtime-review',setup(build){
 build.onResolve({filter:/^practice:registry$/},()=>({path:'registry',namespace:'review'}));
 build.onLoad({filter:/.*/,namespace:'review'},()=>({contents:`export default ${JSON.stringify(manifest)}`,loader:'js'}));
 build.onResolve({filter:/^\.\.\/components\/game\/configured\/player$/},()=>({path:path.join(root,'components/game/configured/player.tsx')}));
}}]});
let js=result.outputFiles[0].text,css=['app/configured.css','app/game-viewport.css','app/typography.css'].map(p=>fs.readFileSync(path.join(root,p),'utf8')).join('\n')+'\n'+fs.readFileSync(path.join(history,'scripts/practice-preview.css'),'utf8');
const assets=[],table=[];
for(const url of new Set((js+css).match(/\/(?:levels|audio|fonts)\/[A-Za-z0-9_./-]+\.(?:png|webp|wav|mp3|ogg|woff2)/g)??[])){
 const current=path.join(root,'public',url.slice(1)),file=fs.existsSync(current)?current:path.join(history,'public',url.slice(1)),bytes=fs.readFileSync(file),ext=url.split('.').at(-1),mime={png:'image/png',webp:'image/webp',wav:'audio/wav',mp3:'audio/mpeg',ogg:'audio/ogg',woff2:'font/woff2'}[ext],data=`data:${mime};base64,${bytes.toString('base64')}`;
 js=js.split(JSON.stringify(url)).join(`__REVIEW_ART[${table.length}]`);css=css.split(url).join(data);table.push(data);assets.push({path:url,sha256:hash(bytes)});
}
js=`const __REVIEW_ART=${JSON.stringify(table)};\n${js}`;new Script(js);
if(/speechSynthesis|SpeechSynthesisUtterance/.test(js))throw Error('TTS not allowed');
const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta http-equiv="Content-Security-Policy" content="default-src 'none';script-src 'unsafe-inline';style-src 'unsafe-inline';img-src data: blob:;media-src data: blob:;font-src data:;connect-src 'none';base-uri 'none';form-action 'none'"><title>小红花处置关 · 本地审阅</title><style>${css}</style></head><body><div id="practice-root"></div><script>${js.replace(/<\/script/gi,'<\\/script')}</script></body></html>`;
const out=path.join(root,'outputs/高楼火灾审阅');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'小红花处置关_本地审阅.html'),html);fs.writeFileSync(path.join(out,'审阅导出校验.json'),JSON.stringify({sha256:hash(html),bytes:Buffer.byteLength(html),assets,updated:['fire-shelter-practice'],otherReviewPacks:'frozen data snapshots; medical pending',runtime:'maintained source'},null,2));console.log(out);
