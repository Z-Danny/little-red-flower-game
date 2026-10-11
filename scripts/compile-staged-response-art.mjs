/** Compile interactive props from the SAME approved Chinese-cast master; no generated masks claimed. */
import fs from 'node:fs';import path from 'node:path';import{createHash}from'node:crypto';import{dependency}from'./lib/dependencies.mjs';
const sharp=dependency('sharp'),dir='public/levels/first-aid-comprehensive',out='art-source/first-aid-comprehensive/fullscreen-v3';
const source=dir+'/prepare-cn-v2.png';
const specs={
 gloves:{box:{x:39,y:960,w:218,h:146},polygon:[[46,1030],[127,961],[252,965],[251,1056],[221,1101],[42,1092]]},
 dressing:{box:{x:239,y:1007,w:195,h:104},polygon:[[241,1101],[282,1010],[428,1016],[398,1107]]},
 bandage:{box:{x:447,y:1009,w:153,h:104},polygon:[[456,1049],[477,1033],[550,1013],[572,1017],[593,1042],[595,1071],[577,1087],[500,1107],[470,1103],[454,1080]]},
 saline:{box:{x:651,y:963,w:67,h:136},polygon:[[669,966],[693,966],[697,981],[697,995],[709,1012],[714,1083],[704,1093],[667,1093],[655,1083],[657,1015],[668,995]]},
 blanket:{box:{x:742,y:936,w:253,h:164},polygon:[[747,973],[785,953],[931,939],[967,952],[978,986],[980,1011],[991,1045],[984,1060],[991,1086],[966,1097],[760,1096],[746,1080],[753,1061],[745,1045],[751,1028],[746,1005]]}
};
const assets={},files=[];const hash=b=>createHash('sha256').update(b).digest('hex');
for(const[id,{box,polygon}]of Object.entries(specs)){
 const{ x,y,w,h}=box,points=polygon.map(([a,b])=>`${a-x},${b-y}`).join(' ');
 const mask=Buffer.from(`<svg width="${w}" height="${h}"><polygon points="${points}" fill="white"/></svg>`);
 const sprite=await sharp(source).extract({left:x,top:y,width:w,height:h}).ensureAlpha().composite([{input:mask,blend:'dest-in'}]).png().toBuffer();
 const filename=`prop-${id}-v3.png`;fs.writeFileSync(dir+'/'+filename,sprite);assets[id]='/levels/first-aid-comprehensive/'+filename;files.push({file:filename,sha256:hash(sprite)});
 const silhouette=await sharp(sprite).tint('#42594b').png().toBuffer();fs.writeFileSync(dir+`/silhouette-${id}-v3.png`,silhouette);
}
const bagBox={x:300,y:741,w:411,h:270};
const bagPolygon=[[323,874],[342,831],[361,778],[392,752],[612,749],[646,773],[658,855],[684,872],[680,944],[650,960],[650,1003],[357,1005],[328,987],[310,936]];
const bagMask=Buffer.from(`<svg width="411" height="270"><polygon points="${bagPolygon.map(([x,y])=>`${x-300},${y-741}`).join(' ')}" fill="white"/></svg>`);
await sharp(source).extract({left:300,top:741,width:411,height:270}).ensureAlpha().composite([{input:bagMask,blend:'dest-in'}]).png().toFile(dir+'/bag-front-v3.png');
assets.bagFront='/levels/first-aid-comprehensive/bag-front-v3.png';
// The source table grain is tiled only inside prop-removal slots at runtime; not AI inpainting.
await sharp(source).extract({left:280,top:1121,width:430,height:31}).png().toFile(dir+'/table-grain-v3.png');
const skin=JSON.parse(fs.readFileSync('content/staged-response/first-aid-comprehensive/skin.json','utf8').replace(/^\uFEFF/,''));
skin.id='paperbook-chinese-interactive-v3';skin.props=specs;skin.bagBox=bagBox;skin.tableSurface={x:0,y:935,w:1024,h:189};skin.assets={...assets,wood:'/levels/first-aid-comprehensive/table-grain-v3.png',aedOff:'/levels/aed-cooperation/device-off.png',aedOn:'/levels/aed-cooperation/device-on.png',padUpper:'/levels/aed-cooperation/pad-upper.png',padSide:'/levels/aed-cooperation/pad-side.png'};
skin.points={bag:{x:511,y:882},cabinet:{x:503,y:475},route:{x:732,y:713},safe:{x:589,y:1120},shoulder:{x:265,y:900},breathing:{x:396,y:914},caller:{x:350,y:640},runner:{x:907,y:550},responseCabinet:{x:100,y:468},compress:{x:354,y:910},device:{x:778,y:1172},handover:{x:432,y:716}};
skin.reviewTargets={'give-water':{x:252,y:704,w:118,h:118},'wait-for-bag':{x:488,y:687,w:169,h:139},'film-patient':{x:674,y:596,w:137,h:101}};
skin.criticalRegions={prepare:[{x:39,y:936,w:956,h:177},{x:790,y:455,w:142,h:94}],review:[{x:230,y:450,w:670,h:185}],respond:[{x:48,y:348,w:960,h:700}],complete:[{x:184,y:359,w:790,h:368}]};
skin.composition={background:'shared-cover',foreground:'shared-contain-full-width-with-soft-vertical-blend',note:'Two existing shared transforms; source master unchanged, no per-level camera. Cover paints every screen corner; intact foreground preserves all faces.'};
skin.productionLayerCompilation='same-source-props-authored-alpha-polygons';
fs.writeFileSync('content/staged-response/first-aid-comprehensive/skin.json',JSON.stringify(skin,null,2)+'\n');
fs.writeFileSync(out+'/compile.json',JSON.stringify({source,sourceSha256:hash(fs.readFileSync(source)),method:'manually-traced-source-alpha-polygons-and-source-wood-texture; not AI-generated masks',specs,bag:{box:bagBox,polygon:bagPolygon},files:fs.readdirSync(dir).filter(n=>n.endsWith('-v3.png')).map(file=>({file,sha256:hash(fs.readFileSync(dir+'/'+file))})),failedGeneration:{tool:'image_gen.imagegen',date:'2026-10-07',status:'503 model_not_found',outputs:0},medicalReview:'not_run'},null,2));
console.log('Compiled five source props, silhouettes, source table texture and current-master hit regions.');
