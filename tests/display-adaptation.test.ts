import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCoverCamera,clientToScene,sceneToClient} from '../app/game/display/camera';
import {fitSurface} from '../app/game/display/viewport';
const matrix=[[320,568],[375,667],[390,844],[430,932],[1366,900],[844,390]];
for(const [width,height] of matrix) test(`single cover + inverse + viewport ${width}x${height}`,()=>{
  const f=fitSurface({width,height,offsetLeft:0,offsetTop:0},{width:720,height:1280});
  if(width<=600&&height>=width){assert.equal(f.width,width);assert.equal(f.height,height);}
  else {assert(f.width<=520);assert(f.height<=height);assert.equal(f.x,(width-f.width)/2);}
  assert.equal(f.y,0);
  for(const b of [{x:0,y:0,w:720,h:1280},{x:-20,y:-160,w:760,h:1640}]){
    const c=createCoverCamera({sceneBounds:b},f.width,f.height);
    assert.equal(c.scale,Math.max(f.width/b.w,f.height/b.h));
    assert(c.x+b.x*c.scale<.001);assert(c.y+b.y*c.scale<.001);
    assert(c.x+(b.x+b.w)*c.scale>=f.width-.001);assert(c.y+(b.y+b.h)*c.scale>=f.height-.001);
    for(const p of [{x:12,y:18},{x:680,y:1160},{x:350,y:640}]){
      const rect={left:f.x+13,top:f.y+27},q=clientToScene(c,sceneToClient(c,p,rect),rect);
      assert(Math.abs(q.x-p.x)<1e-8);assert(Math.abs(q.y-p.y)<1e-8);
    }
  }
});
test('critical content pans without changing the cover scale',()=>{
  const c=createCoverCamera({sceneBounds:{x:0,y:0,w:720,h:1280},critical:{x:12,y:300,w:400,h:500}},390,844);
  assert.equal(c.scale,844/1280);assert.equal(c.clippedCritical,false);
});
test('impossible content composition is reported, never masked by contain',()=>{
  const c=createCoverCamera({sceneBounds:{x:0,y:0,w:720,h:1280},critical:{x:10,y:100,w:700,h:1100}},390,844);
  assert(c.clippedCritical);assert.equal(c.scale,844/1280);
});
test('visual viewport offsets locate the whole surface, never pad the painting',()=>{
  const f=fitSurface({width:390,height:680,offsetLeft:3,offsetTop:42},{width:720,height:1280});
  assert.deepEqual(f,{x:3,y:42,width:390,height:680,mobile:true});
});
test('local HUD avoidance pans without reserving an empty top bar',()=>{
  const framing={sceneBounds:{x:0,y:-200,w:720,h:1680},criticalRegions:[{x:0,y:100,w:100,h:100}]};
  const base=createCoverCamera(framing,360,640);
  const camera=createCoverCamera(framing,360,640,{},[{x:0,y:0,w:50,h:80}]);
  assert.equal(camera.scale,.5);assert.equal(camera.clippedCritical,false);
  assert(camera.y>base.y);assert(camera.y+100*camera.scale>=80);
  assert(camera.y-200*camera.scale<=0);assert(camera.y+1480*camera.scale>=640);
  const p={x:1,y:101};assert.deepEqual(clientToScene(camera,sceneToClient(camera,p)),p);
});
test('impossible HUD overlap is explicit and cannot change cover scale',()=>{
  const framing={sceneBounds:{x:0,y:0,w:720,h:1280},criticalRegions:[{x:0,y:0,w:720,h:1280}]};
  const c=createCoverCamera(framing,360,640,{},[{x:12,y:10,w:44,h:44}]);
  assert.equal(c.scale,.5);assert(c.clippedCritical);
});
