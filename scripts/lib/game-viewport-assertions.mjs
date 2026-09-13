/** Shared, read-only browser geometry checks for every game player and export. */
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {dependency,root} from './dependencies.mjs';

export const VIEWPORT_MATRIX=[[320,568],[375,667],[390,844],[430,932],[1366,900]];
export const GEOMETRY_CONTRACT='shared-game-viewport-v1';
export const SELECTORS={surface:'[data-game-surface]',canvas:'[data-game-canvas]',hud:'.configured-hud,.kitchen-hud,.kitchen-topbar,.hunt-hud,.disaster-hud',title:'.configured-hud > span,.kitchen-hud h1,.kitchen-topbar h1,.hunt-hud h1,.disaster-hud h1'};
let displayRuntime;
export function getDisplayRuntime(){
 return displayRuntime??=(async()=>{
  const outfile=join(mkdtempSync(join(tmpdir(),'game-viewport-check-')),'display.mjs');
  await dependency('esbuild').build({absWorkingDir:root,stdin:{contents:"export * from './app/game/display/viewport'; export * from './app/game/display/camera';",resolveDir:root},bundle:true,platform:'node',format:'esm',outfile,logLevel:'silent'});
  return import(pathToFileURL(outfile).href);
 })();
}
const close=(actual,expected,label,tolerance=1.5)=>assert(Math.abs(actual-expected)<=tolerance,`${label}: ${actual} != ${expected}`);
const inside=(child,parent,label,tolerance=1.5)=>{
 assert(child.x>=parent.x-tolerance&&child.y>=parent.y-tolerance&&child.x+child.width<=parent.x+parent.width+tolerance&&child.y+child.height<=parent.y+parent.height+tolerance,`${label}: rectangle escapes its container`);
};
export function assertGeometrySnapshot(g,design,fitSurface,label='game'){
 assert(g.surface,`${label}: missing ${SELECTORS.surface}; old contain exports are not new viewport acceptance`);
 assert(g.canvas,`${label}: missing ${SELECTORS.canvas}`);
 const expected=fitSurface(g.viewport,design);
 for(const k of ['x','y','width','height'])close(g.surface[k],expected[k],`${label} surface ${k}`);
 for(const k of ['x','y','width','height'])close(g.canvas[k],g.surface[k],`${label} canvas fills surface ${k}`);
 assert(g.bitmap.width>0&&g.bitmap.height>0,`${label}: canvas backing store is empty`);
 if(!expected.mobile)assert(g.surface.width<=521.5,`${label}: desktop surface exceeds 520px`);
 assert(g.document.scrollWidth<=g.document.width+1.5,`${label}: horizontal document overflow`);
 assert(g.document.scrollHeight<=g.document.height+1.5,`${label}: vertical document overflow`);
 close(g.document.scrollX,0,`${label} document scrollX`);close(g.document.scrollY,0,`${label} document scrollY`);
 assert(g.hud,`${label}: missing HUD`);inside(g.hud,g.surface,`${label} HUD`);
 assert(g.buttons.length>=2,`${label}: expected at least back and pause HUD buttons`);
 for(const [i,b] of g.buttons.entries()){
  assert(b.width>=43.5&&b.height>=43.5,`${label}: HUD button ${i} must be at least 44×44 (was ${b.width}×${b.height})`);
  inside(b,g.surface,`${label} HUD button ${i}`);
 }
 assert(g.title,`${label}: missing title`);inside(g.title,g.hud,`${label} title`);
 assert(g.title.scrollWidth<=g.title.clientWidth+1.5,`${label}: title text overflows horizontally`);
 assert(g.title.scrollHeight<=g.title.clientHeight+1.5,`${label}: title text overflows vertically`);
 for(const b of [...g.buttons,...g.clocks]){
  const overlapX=Math.min(g.title.x+g.title.width,b.x+b.width)-Math.max(g.title.x,b.x);
  const overlapY=Math.min(g.title.y+g.title.height,b.y+b.height)-Math.max(g.title.y,b.y);
  assert(overlapX<=1.5||overlapY<=1.5,`${label}: title overlaps HUD button/clock`);
 }
 return {...g,expected,label,contract:GEOMETRY_CONTRACT};
}
export async function readGameGeometry(page,selectors=SELECTORS){
 return page.evaluate(s=>{
  const surface=document.querySelector(s.surface),canvas=surface?.querySelector(s.canvas),hud=surface?.querySelector(s.hud),title=surface?.querySelector(s.title);
  const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
  const visible=e=>{const b=rect(e),css=getComputedStyle(e);return b&&b.width>0&&b.height>0&&css.visibility!=='hidden'&&css.display!=='none';};
  const vv=window.visualViewport;
  return {viewport:{width:vv?.width??innerWidth,height:vv?.height??innerHeight,offsetLeft:vv?.offsetLeft??0,offsetTop:vv?.offsetTop??0},surface:rect(surface),canvas:rect(canvas),bitmap:{width:canvas?.width??0,height:canvas?.height??0},
   document:{width:innerWidth,height:innerHeight,scrollWidth:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth),scrollHeight:Math.max(document.documentElement.scrollHeight,document.body.scrollHeight),scrollX,scrollY},
   hud:rect(hud),title:title?{...rect(title),scrollWidth:title.scrollWidth,clientWidth:title.clientWidth,scrollHeight:title.scrollHeight,clientHeight:title.clientHeight,text:title.textContent}:null,
   buttons:[...(hud?.querySelectorAll('button')??[])].filter(visible).map(rect),clocks:[...(hud?.querySelectorAll('time,[aria-label="已用时间"],[aria-label="风雨增强倒计时"]')??[])].filter(visible).map(rect),surfaceData:surface?{...surface.dataset}:null};
 },selectors);
}
export async function assertGameGeometry(page,{design,label='game',selectors=SELECTORS}={}){
 assert(design?.width>0&&design?.height>0,'A real world/scene size is required');
 await page.locator(selectors.surface).waitFor({state:'visible'});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const g=await readGameGeometry(page,selectors),{fitSurface}=await getDisplayRuntime();
 return assertGeometrySnapshot(g,design,fitSurface,label);
}
export async function canvasReceivesPoint(page,point,selector=SELECTORS.canvas){
 return page.evaluate(({point,selector})=>{const el=document.elementFromPoint(point.x,point.y);return !!el&&(el.matches(selector)||!!el.closest(selector));},{point,selector});
}
export async function canvasReceivesPoints(page,points,selector=SELECTORS.canvas){
 return page.evaluate(({points,selector})=>points.map(point=>{const el=document.elementFromPoint(point.x,point.y);return !!el&&(el.matches(selector)||!!el.closest(selector));}),{points,selector});
}
/** Address-bar-sized resize without page-state injection. Caller checks its game state. */
export async function resizeViewport(page,{width,height},callback){
 await page.setViewportSize({width,height});
 await page.waitForTimeout(160);
 return callback?.();
}
export function addressBarSize({width,height}){return {width,height:height>width?Math.max(width+50,height-96):Math.max(320,height-96)};}
