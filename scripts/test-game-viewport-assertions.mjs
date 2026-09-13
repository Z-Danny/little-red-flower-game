import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {root} from './lib/dependencies.mjs';
import {VIEWPORT_MATRIX,getDisplayRuntime,assertGeometrySnapshot,addressBarSize} from './lib/game-viewport-assertions.mjs';
const {fitSurface}=await getDisplayRuntime();
const design={width:720,height:1280};
function fixture(width,height){
 const viewport={width,height,offsetLeft:0,offsetTop:0},surface=fitSurface(viewport,design),box={x:surface.x,y:surface.y,width:surface.width,height:surface.height};
 return {viewport,surface:box,canvas:{...box},bitmap:{width:Math.round(box.width),height:Math.round(box.height)},document:{width,height,scrollWidth:width,scrollHeight:height,scrollX:0,scrollY:0},hud:{x:box.x,y:0,width:box.width,height:68},buttons:[{x:box.x+8,y:8,width:44,height:44},{x:box.x+box.width-52,y:8,width:44,height:44}],clocks:[],title:{x:box.x+60,y:12,width:100,height:34,scrollWidth:100,clientWidth:100,scrollHeight:34,clientHeight:34}};
}
for(const [w,h] of VIEWPORT_MATRIX)test(`${w}×${h}: actual shared fitSurface is the expected geometry`,()=>assertGeometrySnapshot(fixture(w,h),design,fitSurface));
test('old contain letterboxing cannot masquerade as new shared-surface acceptance',()=>{const g=fixture(390,844);g.surface.width=390;g.surface.height=693;assert.throws(()=>assertGeometrySnapshot(g,design,fitSurface),/surface height/);});
for(const [name,mutate,message] of [
 ['document overflow',g=>g.document.scrollHeight+=10,/vertical document overflow/],
 ['small HUD',g=>g.buttons[0].width=38,/44×44/],
 ['cropped canvas',g=>g.canvas.width-=20,/canvas fills surface/],
 ['title text overflow',g=>g.title.scrollWidth=140,/title text overflows/],
 ['scroll offset',g=>g.document.scrollY=18,/scrollY/],
 ['missing new contract',g=>g.surface=null,/old contain exports/],
])test(`reject ${name}`,()=>{const g=fixture(390,844);mutate(g);assert.throws(()=>assertGeometrySnapshot(g,design,fitSurface),message);});
test('resize fixture changes available height without changing the phone width',()=>assert.deepEqual(addressBarSize({width:390,height:844}),{width:390,height:748}));
test('all build entrypoints include shared CSS after old player CSS',()=>{
 const read=p=>readFileSync(join(root,p),'utf8');
 const layout=read('app/layout.tsx');assert(layout.indexOf("'./game-viewport.css'")>layout.indexOf("'./globals.css'"));
 const offline=read('scripts/export-offline.mjs');assert(offline.indexOf("'game-viewport.css'")>offline.indexOf("'disaster.css'"));
 // No practice-review entry exists in the maintained project; new placement drafts are outside this scope.
 assert(offline.includes('--preview-hunt'),'Existing isolated Hunt preview must be preserved');
 const preview=read('scripts/preview-response.mjs');assert(preview.includes("'disaster','game-viewport'"));assert(preview.includes('viewport-fit=cover'));assert(preview.includes("indexOf('--port')"));
});
