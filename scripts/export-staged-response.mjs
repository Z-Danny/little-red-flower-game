/** Isolated draft export only. Does not register levels, sync catalogs or award flowers. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { dependency, root } from './lib/dependencies.mjs';
const read = p => fs.readFileSync(path.join(root,p),'utf8').replace(/^\uFEFF/,'');
const dir=path.join(root,'outputs/first-aid-comprehensive-preview'); fs.mkdirSync(dir,{recursive:true});
const skin=JSON.parse(read('content/staged-response/first-aid-comprehensive/skin.json'));
const result=await dependency('esbuild').build({absWorkingDir:root,entryPoints:['scripts/staged-response-preview.tsx'],bundle:true,format:'iife',platform:'browser',target:'es2020',jsx:'automatic',minify:true,write:false,define:{'process.env.NODE_ENV':'"production"'}});
let js=result.outputFiles[0].text;
const art=[];
for(const file of new Set([...Object.values(skin.art), ...Object.values(skin.assets ?? {})])){
 const bytes=fs.readFileSync(path.join(root,'public',file));
 const uri='data:image/png;base64,'+bytes.toString('base64');
 if(!js.includes(file))throw Error('Missing bundled image '+file);
 js=js.replaceAll(file,uri);
 art.push({file,sha256:createHash('sha256').update(bytes).digest('hex')});
}
const inputs=['app/staged-response.css','components/game/staged-response/player.tsx','app/game/staged-response/model.ts','app/game/scene-hunt/viewport.ts','content/staged-response/first-aid-comprehensive/skin.json','content/staged-response/first-aid-comprehensive/rules.json'];
const fingerprints=inputs.map(file=>({file,sha256:createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')}));
const css=read('app/staged-response.css');
const html='<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'; connect-src \'none\'; base-uri \'none\'; form-action \'none\'"><title>4-9 综合急救挑战 · 全屏行动版</title><style>'+css+'</style></head><body><div id="game-root"></div><script>'+js.replaceAll('</script','<\\/script')+'</script></body></html>';
const file=path.join(dir,'4-9综合急救挑战.html');fs.writeFileSync(file,html);
fs.writeFileSync(path.join(dir,'export.json'),JSON.stringify({status:'draft-preview-not-production',file,htmlSha256:createHash('sha256').update(html).digest('hex'),art,inputs:fingerprints,presentation:'fullscreen-interactive-v3',cast:'all-characters-fictional-Chinese-adults',medicalReview:'not_run',realDevice:'not_run',humanAudio:'not_run',audio:'none-by-design'},null,2));
console.log(file+'\nSHA256 '+createHash('sha256').update(html).digest('hex'));
