'use client';
import React, { useEffect, useReducer, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { phoneFrame, sceneCamera } from '@/app/game/scene-hunt/viewport';
import type { HuntSkin } from '@/app/game/scene-hunt/schema';
import { initialState, reduce, preparationReady, reviewReady, result, rules } from '@/app/game/staged-response/model';
import copy from '@/content/staged-response/first-aid-comprehensive/presentation.json';
import skin from '@/content/staged-response/first-aid-comprehensive/skin.json';
import { cprRules } from '@/app/game/first-aid/cpr-model';

type ReviewId = keyof typeof copy.review;
type ItemId = keyof typeof skin.props;
type Point = { x: number; y: number };
type Tool = 'phone' | 'assign' | null;
function Icon({ name, ...props }: { name: string } & React.SVGProps<SVGSVGElement>) {
 const shapes: Record<string, React.ReactNode> = {
  hand: <><path d="M8 12V5a2 2 0 0 1 4 0v6-7a2 2 0 0 1 4 0v7-5a2 2 0 0 1 4 0v9c0 5-3 7-7 7-3 0-5-2-7-5l-3-4a2 2 0 0 1 3-2l2 2"/></>,
  phone:<path d="M6 3 3 5c-2 5 11 18 16 16l2-3-5-4-2 2-6-6 2-2Z"/>,
  heart:<path d="M12 21C-7 9 5-3 12 5 19-3 31 9 12 21Z"/>,
  bolt:<path d="m14 2-9 12h7l-2 8 9-12h-7Z"/>,
  eye:<><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
  route:<><path d="M6 21V8q0-4 4-4h9m-4-3 4 3-4 3"/><path d="M3 20h6"/></>,
  bag:<><rect x="3" y="7" width="18" height="14" rx="3"/><path d="M8 7V3h8v4M3 12h18M10 12v3h4v-3"/></>,
  lamp:<><path d="M8 16C-1 7 6 1 12 2c7-1 12 6 4 14v4H8ZM9 23h6M8 16h8"/></>,
  check:<path d="m4 12 5 5L21 5"/>,
  person:<><circle cx="12" cy="5" r="3"/><path d="M12 9v9m-7-4 7-5 7 5m-12 9 5-5 5 5"/></>,
  record:<><rect x="5" y="4" width="15" height="18" rx="2"/><path d="M9 2h7v5H9ZM9 12h7M9 16h7"/></>,
 };
 return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{shapes[name] ?? shapes.hand}</svg>;
}
export default function StagedResponsePlayer() {
 const [s, dispatch] = useReducer(reduce, undefined, () => initialState());
 const [size, setSize] = useState({ width: 390, height: 844 });
 const [hint, setHint] = useState(false), [tool, setTool] = useState<Tool>(null), [selectedPad, setSelectedPad] = useState<string | null>(null);
 const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
 const [flying, setFlying] = useState<ItemId | null>(null);
 const [pulse, setPulse] = useState(0);
 const [recordSelected, setRecordSelected] = useState(false);
 const [loadError, setLoadError] = useState(false);
 const dragRef = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
 const worldRef = useRef<HTMLDivElement>(null);
 const frame = phoneFrame({ width: 720, height: 1280 }, size.width, size.height);
 const camera = sceneCamera(skin as unknown as HuntSkin, frame.width, frame.height, false);
 const backdrop = sceneCamera(skin as unknown as HuntSkin, frame.width, frame.height, true);
 const respond = s.phase === 'respond';
 const handover = respond && s.step === 'handover';
 const picture = s.phase === 'complete' || handover ? 'complete' : respond ? 'respond' : ['review','reviewed'].includes(s.phase) ? 'review' : 'prepare';
 const act = picture === 'prepare' ? 0 : picture === 'review' ? 1 : 2;
 const active = !s.paused && !s.correction && !loadError;
 const isDevice = respond && ['power','pads','analysis','decision'].includes(s.step);
 const point = (p: Point): CSSProperties => ({ left: camera.x + p.x * camera.scaleX, top: camera.y + p.y * camera.scaleY });
 const sourceStyle: CSSProperties = { width: skin.width, height: skin.height, transform: `translate(${camera.x}px,${camera.y}px) scale(${camera.scaleX})` };
 const send = (type: string, id?: string, target?: string) => dispatch({ type, id, target });
 useEffect(() => {
  const resize = () => { setSize({ width: window.innerWidth, height: window.innerHeight }); setDrag(null); dragRef.current = null; };
  const hide = () => { if (document.hidden) { dispatch({ type: 'pause' }); setDrag(null); dragRef.current = null; } };
  resize(); window.addEventListener('resize', resize); document.addEventListener('visibilitychange', hide);
  return () => { window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', hide); };
 }, []);
 useEffect(() => {
  if (!active || !respond) return;
  let last = performance.now();
  const id = window.setInterval(() => { const now = performance.now(); dispatch({ type: 'tick', dt: Math.min(100, now-last) }); last=now; }, 80);
  return () => window.clearInterval(id);
 }, [active, respond]);
 useEffect(() => { setTool(null); }, [s.phase]);
 useEffect(() => { setSelectedPad(null); setRecordSelected(false); setDrag(null); dragRef.current=null; }, [s.phase, s.step]);
 useEffect(() => {
  if (!s.feedback || !active) return;
  const id=window.setTimeout(() => dispatch({type:'dismiss-feedback'}),3600); return () => clearTimeout(id);
 }, [s.feedback, active]);
 useEffect(() => {
  if (!flying || !active) return;
  const id=window.setTimeout(() => setFlying(null),620); return () => clearTimeout(id);
 }, [flying, active]);
 const restart = () => { setFlying(null); setTool(null); setHint(false); setSelectedPad(null); send('restart'); };
 const pack = (id: ItemId) => { if (active && !s.packed.includes(id)) { setFlying(id); send('pack',id); } };
 const beat = () => { if (!active) return; setPulse(p=>p+1); send(s.step === 'help' ? 'cpr' : 'resume'); };
 const openPhone = () => { if (s.step === 'recognize') send('recognize'); setTool('phone'); };
 // Native pointer capture supports touch, mouse, cancellation and click-select keyboard alternatives.
 const pointerDown = (e: PointerEvent<HTMLButtonElement>, id: string) => {
  if (!active) return; e.currentTarget.setPointerCapture(e.pointerId);
  dragRef.current={id,x:e.clientX,y:e.clientY,moved:false}; if(id==='record')setRecordSelected(true);else setSelectedPad(id); setDrag({id,x:e.clientX,y:e.clientY});
 };
 const pointerMove = (e: PointerEvent<HTMLButtonElement>) => {
  if(!dragRef.current)return;
  if(Math.hypot(e.clientX-dragRef.current.x,e.clientY-dragRef.current.y)>5)dragRef.current.moved=true;
  setDrag({id:dragRef.current.id,x:e.clientX,y:e.clientY});
 };
 const pointerUp = (e: PointerEvent<HTMLButtonElement>) => {
  const d=dragRef.current; dragRef.current=null;setDrag(null);if(!d||!active)return;
  if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  if(!d.moved)return;
  if(d.id==='record'){const receiver=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-handover-target]');if(receiver)send('handover');setRecordSelected(false);return;}
  const landing=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('[data-pad-target]');
  send('place-pad',d.id,landing?.dataset.padTarget??'outside');setSelectedPad(null);
 };
 const hotspot = (id: string, p: Point, icon: string, label: string, callback:()=>void, opts: {done?:boolean; className?:string; hidden?:boolean}={}) => <button key={id} type="button" data-hotspot={id} data-handover-target={id === 'handover' ? 'professional' : undefined} data-done={!!opts.done} className={`action-spot ${opts.className??''} ${hint?'show-label':''}`} style={point(p)} aria-label={label} disabled={opts.done} onClick={callback}><Icon name={opts.done?'check':icon}/><span>{label}</span></button>;
 const instructions: Record<string,string> = {
  safety:'点地面检查安全，再接近倒地者',assess:'轻拍双肩，观察呼吸；点击两处检查点',recognize:'无反应、仅喘息 · 点志愿者启动呼救',help:!s.called?'点青衣志愿者，模拟拨打120':!s.cpr?'立即点胸部帮助，不等AED返回':!s.dispatched?'帮助已开始 · 指派黄衣同伴取AED':s.aedReady?'AED已送到 · 点设备立即接入':'继续帮助 · 同伴正在取AED',power:'点设备上的绿色电源键',pads:!s.exposed?'拉开衣襟标记，露出胸部示意':`把两片电极拖到设备图示的位置 · ${s.pads.length}/2`,analysis:`点三只手，让自己和同伴离开接触 · ${s.cleared.length}/3`,decision:s.branch==='no-shock'?'不建议电击 · 点胸部立即恢复CPR':!s.clear?'建议电击 · 再次确认三人均离开接触':'无人接触 · 点闪电键执行本次电击',resume:'点胸部，立即恢复帮助',handover:'把救助记录交给接手的专业人员',
 };
 const instruction = s.phase==='prepare'?`点用品自动入包 · 再确认AED与通道` : s.phase==='review'?'直接点画中的不当帮助，不是点文字答案' : respond?instructions[s.step]:'三个时刻，接力守护';
 const progress = s.phase==='prepare'?`${s.packed.length}/5` : s.phase==='review'?`${s.acknowledged.length}/3` : respond?`${Math.min(10,Object.keys(copy.responseSteps).indexOf(s.step)+1)}/10`:'4-9';
 const transformedStyle=(c:typeof camera):CSSProperties=>({width:skin.width,height:skin.height,transform:`translate(${c.x}px,${c.y}px) scale(${c.scaleX})`});
 const clearHands = (again=false) => <div className="clear-hands"><small>{again?'电击前再次清场':'分析前清场'}</small><div>{(['self','caller','runner'] as const).map((id,i)=><button type="button" key={id} data-clear={id} data-cleared={s.cleared.includes(id)} aria-label={`让${['自己','呼救同伴','送AED同伴'][i]}离开接触`} disabled={s.cleared.includes(id)} onClick={()=>send('clear-person',id)}><Icon name={s.cleared.includes(id)?'check':'hand'}/><span>{['自己','呼救同伴','送AED同伴'][i]}</span></button>)}</div></div>;
 return <main className="staged-response" data-phase={s.phase} data-step={s.step} data-paused={s.paused} data-aed-ready={s.aedReady} data-cpr={s.cpr} style={{width:frame.width,height:frame.height,left:frame.x,'--beat-ms':`${60000/cprRules.guideRate}ms`} as CSSProperties}>
  <div className="scene-backdrop" aria-hidden="true"><img draggable={false} src={skin.art[picture]} style={transformedStyle(backdrop)} alt="" /></div>
  <div className="scene-surface" ref={worldRef} inert={!active || isDevice || !!tool}>
   <div className="scene-painting" style={sourceStyle} aria-hidden="true"><img draggable={false} src={skin.art[picture]} alt="" onError={()=>setLoadError(true)} />
    {picture==='prepare'&&<><div className="table-surface" style={{left:skin.tableSurface.x,top:skin.tableSurface.y,width:skin.tableSurface.w,height:skin.tableSurface.h,backgroundImage:`linear-gradient(#c49259dd,#b88953dd),url("${skin.assets.wood}")`}}/><img draggable={false} className="bag-front" src={skin.assets.bagFront} alt="" style={{left:skin.bagBox.x,top:skin.bagBox.y,width:skin.bagBox.w,height:skin.bagBox.h}}/>{Object.entries(skin.props).map(([id,{box}])=>!s.packed.includes(id)&&<img draggable={false} data-source-prop={id} key={id} className="source-prop" src={skin.assets[id as ItemId]} alt="" style={{left:box.x,top:box.y,width:box.w,height:box.h}}/>)}</>}
   </div>
   {s.phase==='prepare'&&<>
    {Object.entries(skin.props).map(([id,{box}])=>s.packed.includes(id)?null:<button key={id} type="button" data-pack={id} className={`prop-hit ${hint?'hint':''}`} aria-label={`收纳${copy.inventory[id as ItemId].name}`} style={{...point({x:box.x+box.w/2,y:box.y+box.h/2}),width:Math.max(44,box.w*camera.scaleX),height:Math.max(44,box.h*camera.scaleY)}} onClick={()=>pack(id as ItemId)}><span>{copy.inventory[id as ItemId].name}</span></button>)}
    {hotspot('cabinet',skin.points.cabinet,'bolt','确认AED位置',()=>send('check','aed-location'),{done:s.checked.includes('aed-location')})}
    {hotspot('route',skin.points.route,'route','检查救援通道',()=>send('check','access-route'),{done:s.checked.includes('access-route')})}
    <div className="bag-counter" style={point(skin.points.bag)}><Icon name="bag"/>{s.packed.length}/5</div>
    {flying&&<img draggable={false} key={flying} data-flying={flying} className="flying-prop" src={skin.assets[flying]} alt="" style={{...point({x:skin.props[flying].box.x+skin.props[flying].box.w/2,y:skin.props[flying].box.y+skin.props[flying].box.h/2}),width:skin.props[flying].box.w*camera.scaleX,'--flight-x':`${(skin.points.bag.x-skin.props[flying].box.x-skin.props[flying].box.w/2)*camera.scaleX}px`,'--flight-y':`${(skin.points.bag.y-skin.props[flying].box.y-skin.props[flying].box.h/2)*camera.scaleY}px`} as CSSProperties}/>}
   </>}
   {s.phase==='review'&&<>
    <button className="scene-inspect" aria-label="观察教学场景其他区域" onClick={()=>send('review-safe')}/>
    {Object.entries(skin.reviewTargets).map(([id,box])=><button type="button" key={id} data-review={id} className={`review-hit ${hint?'hint':''} ${s.acknowledged.includes(id)?'found':''}`} style={{...point({x:box.x+box.w/2,y:box.y+box.h/2}),width:Math.max(44,box.w*camera.scaleX),height:Math.max(44,box.h*camera.scaleY)}} aria-label={`观察${copy.review[id as ReviewId].name}`} disabled={s.acknowledged.includes(id)} onClick={()=>send('identify',id)}>{s.acknowledged.includes(id)&&<Icon name="check"/>}</button>)}
   </>}
   {respond&&!isDevice&&<>
    {s.step==='safety'&&hotspot('safe',skin.points.safe,'eye','观察地面与通道',()=>send('safe'))}
    {s.step==='assess'&&<>
     {hotspot('response',skin.points.shoulder,'hand','呼唤并轻拍双肩',()=>send('examine','response'),{done:s.observations.includes('response')})}
     {hotspot('breathing',skin.points.breathing,'eye','观察呼吸',()=>send('examine','breathing'),{done:s.observations.includes('breathing')})}
    </>}
    {['recognize','help'].includes(s.step)&&<>
     {hotspot('caller',skin.points.caller,'phone',s.called?'已呼救 · 免提中':'请你呼救',openPhone,{done:s.called})}
     {hotspot('runner',skin.points.runner,'bolt',s.dispatched?'已指派取AED':'请你取AED',()=>{if(s.step==='recognize')send('recognize');setTool('assign');},{done:s.dispatched})}
    </>}
    {((s.step==='help'&&s.called)||s.step==='resume'||(s.step==='decision'&&s.branch==='no-shock'))&&hotspot('compress',skin.points.compress,'hand',s.step==='help'?'开始 / 继续帮助':'恢复CPR',beat,{className:`compress-spot ${s.cpr?'beating':''}`})}
    {s.step==='help'&&s.cpr&&<div key={pulse} className="compression-wave" style={point(skin.points.compress)} aria-hidden="true"/>}
    {s.step==='help'&&s.dispatched&&<>
     <div className="helper-route" style={point(skin.points.responseCabinet)}><Icon name="bolt"/><span>{s.aedReady?'已取到':'取用中'}</span></div>
     {s.aedReady&&<button data-hotspot="device" className="aed-world" style={point(skin.points.device)} aria-label="接入同伴带来的AED" disabled={!s.cpr||!s.called} onClick={()=>send('receive-aed')}><img draggable={false} src={skin.assets.aedOff} alt="AED"/><span>AED已送到</span></button>}
    </>}
    {handover&&<>
     {hotspot('handover',skin.points.handover,'person','接手的专业人员',()=>{if(recordSelected)send('handover');else setRecordSelected(true);})}
     <button type="button" className={recordSelected ? "handover-record selected" : "handover-record"} data-record aria-label="拿起救助记录" aria-pressed={recordSelected} onDragStart={e=>e.preventDefault()} onPointerDown={e=>pointerDown(e,'record')} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={()=>{dragRef.current=null;setDrag(null)}} onClick={()=>setRecordSelected(true)}><Icon name="record"/><b>救助记录</b><span>无反应 · 无正常呼吸</span><span>已呼救 ✓ 已帮助 ✓</span><span>{s.shocked?'AED：已电击，已恢复CPR':'AED：不建议电击，已恢复CPR'}</span><small>拖给专业人员 / 点选后交接</small></button>
     <div className="handover-tag">专业团队已到场</div>
    </>}
   </>}
  </div>
  <div className="scene-ui" inert={!active || !!tool || s.phase==='intro' || ['prepared','reviewed','complete'].includes(s.phase)}>
   <header className="scene-hud"><button className="hud-round" aria-label="返回关卡开场" onClick={()=>{send('pause');}}>‹</button><div><small>第四章 · 4-9</small><h1>综合急救挑战</h1></div><button className={`hud-round ${hint?'on':''}`} aria-label="提示" aria-pressed={hint} onClick={()=>setHint(v=>!v)}><Icon name="lamp"/></button><button className="hud-round" aria-label="暂停" onClick={()=>{setDrag(null);dragRef.current=null;send('pause');}}>Ⅱ</button></header>
   <nav className="scene-actbar" aria-label="三幕进度">{['活动准备','演练复盘','现场处置'].map((label,i)=><span key={label} className={i===act?'current':i<act?'finished':''}><i>{i<act?'✓':`0${i+1}`}</i>{label}</span>)}</nav>
   {s.phase==='review'&&<div className="teaching-banner">教学定格 · 错误示例 · 非真实伤者</div>}
   {respond&&['recognize','help'].includes(s.step)&&<div className="case-badges"><span>无反应</span><span>仅喘息 ≠ 正常呼吸</span></div>}
   {s.phase==='prepare'&&<div className="inventory-dock" aria-label="包内用品">{rules.inventory.map(id=><span key={id} data-inventory={id} data-packed={s.packed.includes(id)}><img draggable={false} src={skin.assets[id as ItemId]} alt={copy.inventory[id as ItemId].name}/>{s.packed.includes(id)&&<b>✓</b>}</span>)}<small>{progress}</small></div>}
   {s.phase==='review'&&<div className="review-progress">{rules.reviewTargets.map(id=><i key={id} className={s.acknowledged.includes(id)?'done':''}>{s.acknowledged.includes(id)?'✓':'○'}</i>)}<small>纠正不当帮助</small></div>}
   <footer className="scene-footer"><span>{instruction}</span>{s.phase==='prepare'&&preparationReady(s)&&<button data-action="finish-prep" onClick={()=>send('finish-prep')}>开始活动 →</button>}{s.phase==='review'&&reviewReady(s)&&<button data-action="finish-review" onClick={()=>send('finish-review')}>复盘结束 →</button>}</footer>
  </div>
  {isDevice&&<div className="device-stage" inert={!active}>
   <div className="device-window" data-device-workspace><div className="device-heading"><Icon name="bolt"/><b>AED协作</b><small>依设备提示操作</small></div>
    <div className="device-screen" role="status">{s.step==='power'?'开启设备':s.step==='pads'?s.exposed?'胸部干燥 · 按图贴片':'准备胸部':s.step==='analysis'?'分析心律 · 不要接触':s.branch==='shock'?'建议电击':'不建议电击 · 恢复CPR'}</div>
    {s.step==='power'&&<div className="device-power-art"><img draggable={false} src={skin.assets.aedOff} alt="AED设备"/><button data-action="power" className="power-key" aria-label="开启AED电源" onClick={()=>send('power')}>⏻</button></div>}
    {s.step==='pads'&&<div className="pad-workspace">
     <div className="torso-diagram" aria-label="设备胸部贴片图示，非真实操作测量">
      <svg viewBox="0 0 260 300" aria-hidden="true"><defs><linearGradient id="torso-fill" x2="1" y2="1"><stop stopColor="#f8ddbd"/><stop offset="1" stopColor="#dfb28e"/></linearGradient></defs><circle cx="130" cy="36" r="25" fill="url(#torso-fill)" stroke="#aa866a" strokeWidth="2"/><path d="M106 59 72 75 40 106 26 209 52 216 76 148 78 280h106l1-132 23 68 26-7-14-103-33-31-34-16" fill="url(#torso-fill)" stroke="#aa866a" strokeWidth="2"/><path d="M128 89v90M86 108q23-14 38 0m13 0q20-14 37 0" fill="none" stroke="#cb9d79" strokeWidth="2"/></svg>
      {!s.exposed&&<button data-action="expose" className="shirt-tab" aria-label="解开衣襟，露出胸部" onClick={()=>send('expose')}><span>↔</span><small>打开衣襟</small></button>}
      {s.exposed&&<>{(['upper','side'] as const).map((id,i)=><button key={id} data-pad-target={id} className={`pad-target ${id} ${s.pads.includes(id)?'attached':''}`} aria-label={i===0?'患者右上胸落位':'患者左侧胸落位'} onClick={()=>{if(selectedPad){send('place-pad',selectedPad,id);setSelectedPad(null)}}}>{s.pads.includes(id)?<img draggable={false} src={id==='upper'?skin.assets.padUpper:skin.assets.padSide} alt="已贴好"/>:<><span>{i+1}</span><small>{i===0?'右上胸':'左侧胸'}</small></>}</button>)}</>}
     </div>
     <div className="pad-tray">{(['upper','side'] as const).map((id,i)=>!s.pads.includes(id)&&<button type="button" key={id} data-pad={id} disabled={!s.exposed} aria-label={`拿起电极片${i+1}`} aria-pressed={selectedPad===id} onDragStart={e=>e.preventDefault()} onPointerDown={e=>pointerDown(e,id)} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={()=>{dragRef.current=null;setDrag(null)}} onClick={()=>setSelectedPad(id)}><img draggable={false} src={id==='upper'?skin.assets.padUpper:skin.assets.padSide} alt=""/><span>电极片 {i+1}</span></button>)}<small>拖到虚线内<br/>也可点击拿起、点击落位</small></div>
    </div>}
    {s.step==='analysis'&&clearHands()}
    {s.step==='decision'&&<>{s.branch==='shock'?<>{clearHands(true)}<button data-action="shock" className={`shock-key ${s.clear?'ready':''}`} aria-label="执行本次建议电击" onClick={()=>send('shock')}><Icon name="bolt"/></button></>:<div className="no-shock"><Icon name="heart"/><button data-action="resume" onClick={beat}>立即恢复CPR</button><button className="blocked-shock" data-action="shock" aria-label="尝试电击" onClick={()=>send('shock')}><Icon name="bolt"/>不建议电击</button></div>}</>}
    <small className="device-disclaimer">流程与设备图示练习，不测真实按压技能</small>
   </div>
  </div>}
  {tool&&<div className="tool-overlay" inert={!active}>
   {tool==='phone'&&<div className="phone-tool" role="dialog" aria-label="模拟呼救手机"><button className="tool-close" aria-label="关闭手机" onClick={()=>setTool(null)}>×</button><small>模拟呼救 · 不拨打真实电话</small><b className="phone-number">120</b><div className="phone-location"><Icon name="route"/><span>社区活动广场 · 服务站旁</span></div><p>成人倒地 · 无反应 · 无正常呼吸</p><button data-action="call" className="call-key" aria-label="呼叫120并开启免提" onClick={()=>{send('call');setTool(null)}}><Icon name="phone"/><span>呼叫 · 免提</span></button></div>}
   {tool==='assign'&&<div className="assign-tool" role="dialog" aria-label="指派同伴取AED"><button className="tool-close" aria-label="关闭指派" onClick={()=>setTool(null)}>×</button><Icon name="person"/><b>请你取AED</b><span>点设备，交给黄衣同伴取用</span><button data-action="dispatch" aria-label="指派取用服务站AED" onClick={()=>{send('dispatch');setTool(null)}}><img draggable={false} src={skin.assets.aedOff} alt="AED"/><span>服务站外墙 → 带回这里</span></button></div>}
  </div>}
  {s.feedback&&!s.correction&&<div className="scene-toast" role="status">{s.feedback}</div>}
  {s.correction&&!s.paused&&<div className="correction-overlay"><section className="correction-card" role="dialog" aria-modal="true" aria-labelledby="correction-title"><small>教学复盘 · 找到了不当帮助</small><h2 id="correction-title">{copy.review[s.correction as ReviewId].name}</h2><p>{copy.review[s.correction as ReviewId].correction}</p><button autoFocus data-action="acknowledge" onClick={()=>send('acknowledge')}><Icon name="check"/>纠正这处行为</button></section></div>}
  {(['intro','prepared','reviewed','complete'].includes(s.phase))&&<div className="chapter-overlay"><section className={`chapter-card ${s.phase==='intro'?'opening':''}`}>
   <div className="chapter-flower">✿</div><small>第四章 · 4-9</small>
   {s.phase==='intro'?<><h1>综合急救挑战</h1><p>先准备 · 懂辨别 · 会协作</p><div className="chapter-triptych"><span><Icon name="bag"/>收纳用品</span><span><Icon name="eye"/>观察演练</span><span><Icon name="hand"/>现场行动</span></div><button autoFocus data-action="begin" onClick={()=>send('begin')}>进入活动广场 →</button><label className="branch-select">复盘分支<select value={s.branch} onChange={e=>send('branch',e.target.value)}><option value="shock">AED建议电击</option><option value="no-shock">AED不建议电击</option></select></label><small className="draft-note">独立试玩 · 不替代正规急救培训</small></>:s.phase==='prepared'?<><h2>准备好了！</h2><p>用品入包，设备明确，通道畅通。</p><button autoFocus data-action="open-review" onClick={()=>send('open-review')}>开始活动 · 进入演练复盘 →</button></>:s.phase==='reviewed'?<><h2>演练复盘结束</h2><p>稍后，活动中一位成人突然倒地……</p><strong>现在开始只做判断与帮助，不再找错或收集。</strong><button autoFocus data-action="start-event" onClick={()=>send('start-event')}>立即上前帮助 →</button></>:<><h2>帮助，接上了</h2><p>专业人员接手，救助仍在继续。</p><div className="scene-results">{result(s).map(r=><div key={r.axis}><Icon name="check"/><b>{r.axis}</b><small>{r.corrections?`纠正 ${r.corrections} 次`:'完成'}</small></div>)}</div><small>记录行动，不以患者痊愈作为通关条件。</small><button autoFocus data-action="restart" onClick={restart}>再演练一次 ↻</button></>}
  </section></div>}
  {s.paused&&<div className="pause-overlay"><section className="chapter-card" role="dialog" aria-modal="true" aria-labelledby="pause-title"><h2 id="pause-title">稍作休息</h2><p>场景行动已暂停</p><button autoFocus data-action="continue" onClick={()=>send('continue')}>继续演练</button><button data-action="restart" className="secondary" onClick={restart}>回到开场</button><small>静音练习 · 不发放正式地图奖励</small></section></div>}
  {loadError&&<div className="pause-overlay"><section className="chapter-card" role="alert"><h2>图片未能加载</h2><p>请重新打开完整离线文件，不要继续空白场景。</p><button onClick={()=>window.location.reload()}>重新加载</button></section></div>}
  {drag&&drag.id!=='record'&&<img draggable={false} className="drag-ghost" style={{left:drag.x-frame.x,top:drag.y}} src={drag.id==='upper'?skin.assets.padUpper:skin.assets.padSide} alt=""/>}
 {drag?.id==='record'&&<div className="record-ghost" style={{left:drag.x-frame.x,top:drag.y}}><Icon name="record"/></div>}
 </main>;
}
