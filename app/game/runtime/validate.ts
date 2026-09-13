import type { LevelPackage } from './schema';
import audioManifest from '@/content/response/audio-manifest.json';

const idPattern = /^[a-z][a-z0-9-]{0,63}$/;
export const localAssetPattern = /^\/levels\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.(?:png|webp)$/;
const fail = (path: string, message: string): never => { throw new Error(`${path}: ${message}`); };
const obj = (v: unknown, p: string): Record<string, any> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail(p, '必须是对象');
  return v as Record<string, any>;
};
const array = (v: unknown, p: string): any[] => { if (!Array.isArray(v)) fail(p, '必须是数组'); return v as any[]; };
const text = (v: unknown, p: string) => { if (typeof v !== 'string' || !v.trim()) fail(p, '必须是非空文本'); return v as string; };
const number = (v: unknown, p: string, min: number, max: number) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fail(p, `必须在 ${min}～${max} 内`); return v as number; };
const id = (v: unknown, p: string) => { if (!idPattern.test(text(v, p))) fail(p, 'ID 只能使用小写字母、数字和连字符'); return v as string; };
const oneOf = (v: unknown, values: unknown[], p: string) => { if (!values.includes(v)) fail(p, `不支持的值 ${String(v)}`); };
function uniqueIds(list: any[], path: string) {
  const ids = list.map((o, i) => id(obj(o, `${path}[${i}]`).id, `${path}[${i}].id`));
  if (new Set(ids).size !== ids.length) fail(path, 'ID 重复');
  return new Set(ids);
}
function refs(value: unknown, allowed: Set<string>, p: string, optional = true): string[] {
  const values = value === undefined && optional ? [] : array(value, p);
  if (new Set(values).size !== values.length) fail(p, '引用重复');
  values.forEach((v, i) => { if (typeof v !== 'string' || !allowed.has(v)) fail(`${p}[${i}]`, `未知引用 ${String(v)}`); });
  return values;
}
function exactKeys(value: Record<string, any>, allowed: string[], path: string) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`${path}.${key}`, '未知字段，可能拼写错误');
}
function box(value: unknown, p: string, partial = false) {
  const b = obj(value, p);
  for (const k of ['x', 'y', 'w', 'h']) if (!partial || b[k] !== undefined) number(b[k], `${p}.${k}`, k === 'w' || k === 'h' ? .01 : -10000, 10000);
  return b;
}

/** Fail closed, before a package is registered or exported. All messages include a JSON field path. */
export function validatePackage(rulesInput: unknown, skinInput: unknown, options: { embedded?: boolean } = {}): LevelPackage {
  const r = obj(rulesInput, 'level'), s = obj(skinInput, 'skin');
  exactKeys(r, ['schemaVersion','id','kind','title','order','location','description','safety','briefing','objects','goals','interactions','risk','completion','stages'], 'level');
  exactKeys(s, ['schemaVersion','id','world','framing','assets','background','poses','zones','states','animations','effects','labels','zoneLabels','response','presentation','zoneConditions'], 'skin');
  oneOf(r.schemaVersion, [1], 'level.schemaVersion'); oneOf(s.schemaVersion, [1], 'skin.schemaVersion');
  id(r.id, 'level.id'); id(s.id, 'skin.id'); oneOf(r.kind, ['prevention', 'response'], 'level.kind');
  ['title','location','description','safety'].forEach(k => text(r[k], `level.${k}`));
  if (r.briefing !== undefined) text(r.briefing, 'level.briefing');
  number(r.order, 'level.order', 1, 9999); if (!Number.isInteger(r.order)) fail('level.order', '必须是整数');
  const objects = array(r.objects, 'level.objects'), goals = array(r.goals, 'level.goals'), rules = array(r.interactions, 'level.interactions');
  if (!objects.length || objects.length > 40) fail('level.objects', '每关 1～40 个对象');
  if (!goals.length || goals.length > 12) fail('level.goals', '每关 1～12 个目标');
  const targetCount = goals.filter(g => g?.showTarget !== false).length;
  if (r.kind === 'prevention' && (targetCount < 3 || targetCount > 6)) fail('level.goals', '找隐患必须有 3～6 个剪影目标，辅助目标可设 showTarget=false');
  const objectIds = uniqueIds(objects, 'level.objects'), goalIds = uniqueIds(goals, 'level.goals');
  uniqueIds(rules, 'level.interactions');
  const stages = array(r.stages ?? [], 'level.stages');
  if (stages.length > 16) fail('level.stages', '每关至多 16 个阶段');
  const stageIds = uniqueIds(stages, 'level.stages');
  for (const stage of stages) {
    const p = `stages.${stage.id}`; exactKeys(stage, ['id','requires','afterMs','feedback'], p);
    refs(stage.requires, goalIds, `${p}.requires`, false); number(stage.afterMs, `${p}.afterMs`, 0, 600000);
    if (stage.feedback !== undefined) text(stage.feedback, `${p}.feedback`);
  }
  const condition = (v: unknown, p: string, nonempty = true) => {
    const when = obj(v, p); exactKeys(when, ['all','any','not','stages','notStages','emotion','riskAtLeast'], p);
    if (nonempty && !Object.keys(when).length) fail(p, '状态条件不能为空');
    for (const k of ['all','any','not']) refs(when[k], goalIds, `${p}.${k}`);
    refs(when.stages, stageIds, `${p}.stages`);
    refs(when.notStages, stageIds, `${p}.notStages`);
    if ((when.stages ?? []).some((stage: string) => (when.notStages ?? []).includes(stage))) fail(p, '同一阶段不能同时要求已进入和未进入');
    if (when.emotion !== undefined) oneOf(when.emotion, ['worried','panicked','focused','relieved'], `${p}.emotion`);
    if (when.riskAtLeast !== undefined) number(when.riskAtLeast, `${p}.riskAtLeast`, 0, 100);
    return when;
  };
  for (const o of objects) {
    exactKeys(o, ['id','label','input','requires','disabledWhen','stages'], `objects.${o.id}`);
    text(o.label, `objects.${o.id}.label`); oneOf(o.input, ['tap','drag','both','none'], `objects.${o.id}.input`);
    refs(o.requires, goalIds, `objects.${o.id}.requires`); refs(o.disabledWhen, goalIds, `objects.${o.id}.disabledWhen`);
    refs(o.stages, stageIds, `objects.${o.id}.stages`);
  }
  for (const g of goals) {
    exactKeys(g, ['id','label','object','showTarget'], `goals.${g.id}`);
    if (g.showTarget !== undefined && typeof g.showTarget !== 'boolean') fail(`goals.${g.id}.showTarget`, '必须是布尔值');
    text(g.label, `goals.${g.id}.label`); refs([g.object], objectIds, `goals.${g.id}.object`);
  }
  const world = obj(s.world, 'skin.world'); exactKeys(world, ['width','height'], 'skin.world');
  number(world.width, 'skin.world.width', 100, 4000); number(world.height, 'skin.world.height', 100, 4000);
  if (s.framing !== undefined) {
    const framing = obj(s.framing, 'skin.framing');
    exactKeys(framing, ['sceneBounds','critical','criticalRegions'], 'skin.framing');
    if (!framing.sceneBounds) fail('skin.framing.sceneBounds', '必须提供真实绘制范围');
    for (const key of ['sceneBounds','critical']) if (framing[key] !== undefined) {
      box(framing[key], `skin.framing.${key}`); exactKeys(framing[key], ['x','y','w','h'], `skin.framing.${key}`);
    }
    if (framing.criticalRegions !== undefined) {
      const regions = array(framing.criticalRegions, 'skin.framing.criticalRegions');
      if (regions.length > 128) fail('skin.framing.criticalRegions', '最多128个关键矩形');
      for (const [i, region] of regions.entries()) {
        box(region, `skin.framing.criticalRegions[${i}]`); exactKeys(region, ['x','y','w','h'], `skin.framing.criticalRegions[${i}]`);
      }
    }
    const bounds = framing.sceneBounds;
    if (bounds.x > 0 || bounds.y > 0 || bounds.x + bounds.w < world.width || bounds.y + bounds.h < world.height) fail('skin.framing.sceneBounds', '扩图范围必须包含原设计画布');
    for (const region of [...(framing.critical ? [framing.critical] : []), ...(framing.criticalRegions ?? [])]) {
      if (region.x < bounds.x - 1e-7 || region.y < bounds.y - 1e-7 || region.x + region.w > bounds.x + bounds.w + 1e-7 || region.y + region.h > bounds.y + bounds.h + 1e-7) fail('skin.framing', '关键内容不得超出真实绘画范围');
    }
  }
  const assets = obj(s.assets, 'skin.assets'), assetIds = new Set(Object.keys(assets));
  for (const [key, value] of Object.entries(assets)) {
    id(key, `assets.${key}`); const a = obj(value, `assets.${key}`); exactKeys(a, ['src','alpha','sceneBounds','frame'], `assets.${key}`);
    if (a.frame !== undefined) {
      box(a.frame, `assets.${key}.frame`); exactKeys(a.frame, ['x','y','w','h'], `assets.${key}.frame`);
      if (!['x','y','w','h'].every(k => Number.isInteger(a.frame[k])) || a.frame.x < 0 || a.frame.y < 0) fail(`assets.${key}.frame`, '精灵帧使用非负整数像素坐标');
    }
    const source = text(a.src, `assets.${key}.src`);
    if (!localAssetPattern.test(source) && !(options.embedded && /^data:image\/(?:png|webp);base64,[A-Za-z0-9+/=]+$/.test(source))) fail(`assets.${key}.src`, '只接受 public/levels 内 PNG/WebP 的绝对 URL，不接受网络或临时路径');
    if (typeof a.alpha !== 'boolean') fail(`assets.${key}.alpha`, '必须明确声明是否需要透明通道');
    if(a.sceneBounds!==undefined){box(a.sceneBounds,`assets.${key}.sceneBounds`);exactKeys(a.sceneBounds,['x','y','w','h'],`assets.${key}.sceneBounds`);if(a.alpha)fail(`assets.${key}.sceneBounds`,'只能给完整不透明背景指定扩图边界');}
  }
  refs([s.background], assetIds, 'skin.background');
  if(s.framing){
    const b=s.framing.sceneBounds,d=assets[s.background].sceneBounds??{x:0,y:0,w:world.width,h:world.height};
    if(d.x>b.x||d.y>b.y||d.x+d.w<b.x+b.w||d.y+d.h<b.y+b.h)fail('skin.background','实际背景未覆盖声明相机范围，请先扩画');
  }
  const poses = obj(s.poses, 'skin.poses'), poseIds = new Set(Object.keys(poses)), zones = obj(s.zones, 'skin.zones');
  for (const key of poseIds) id(key, `poses.${key}`);
  const validatePose = (v: unknown, p: string, partial = false) => {
    const pose = box(v, p, partial); exactKeys(pose, ['x','y','w','h','asset','depth','rotation','opacity','pivot','blockInput'], p);
    if (!partial || pose.asset !== undefined) refs([pose.asset], assetIds, `${p}.asset`);
    if (!partial || pose.depth !== undefined) number(pose.depth, `${p}.depth`, -1000, 1000);
    if (pose.rotation !== undefined) number(pose.rotation, `${p}.rotation`, -Math.PI * 4, Math.PI * 4);
    if (pose.opacity !== undefined) number(pose.opacity, `${p}.opacity`, 0, 1);
    if (pose.blockInput !== undefined && typeof pose.blockInput !== 'boolean') fail(`${p}.blockInput`, '必须是布尔值');
    if (pose.pivot) { exactKeys(obj(pose.pivot, `${p}.pivot`), ['x','y'], `${p}.pivot`); number(pose.pivot.x, `${p}.pivot.x`, 0, 1); number(pose.pivot.y, `${p}.pivot.y`, 0, 1); }
    return pose;
  };
  const inWorld = (b: any, p: string) => { if (b.x < 0 || b.y < 0 || b.x + b.w > world.width || b.y + b.h > world.height) fail(p, '初始物件/目标区域超出逻辑画布'); };
  for (const [key, value] of Object.entries(poses)) inWorld(validatePose(value, `poses.${key}`), `poses.${key}`);
  for (const o of objects) refs([o.id], poseIds, `objects.${o.id}.pose`);
  for (const [key, value] of Object.entries(zones)) { id(key, `zones.${key}`); exactKeys(obj(value, `zones.${key}`), ['x','y','w','h'], `zones.${key}`); inWorld(box(value, `zones.${key}`), `zones.${key}`); }
  const states = array(s.states, 'skin.states');
  for (const [index, v] of states.entries()) {
    const state = obj(v, `states[${index}]`), p = `states[${index}]`; exactKeys(state, ['object','when','pose'], p);
    refs([state.object], poseIds, `${p}.object`);
    condition(state.when, `${p}.when`);
    validatePose(state.pose, `${p}.pose`, true);
  }
  const motions = obj(s.animations, 'skin.animations');
  for (const [key, value] of Object.entries(motions)) {
    id(key, `animations.${key}`); const a = obj(value, `animations.${key}`); exactKeys(a, ['durationMs','tracks'], `animations.${key}`);
    number(a.durationMs, `animations.${key}.durationMs`, 500, 1500);
    const tracks = array(a.tracks, `animations.${key}.tracks`), seen = new Set<string>();
    if (!tracks.length) fail(`animations.${key}.tracks`, '处理动画至少有一条轨道');
    for (const [i, raw] of tracks.entries()) {
      const p = `animations.${key}.tracks[${i}]`, t = obj(raw, p); exactKeys(t, ['object','fromDrop','keyframes'], p);
      refs([t.object], poseIds, `${p}.object`); if (seen.has(t.object)) fail(p, '同一动画不能重复驱动同一物体'); seen.add(t.object);
      if (t.fromDrop !== undefined && typeof t.fromDrop !== 'boolean') fail(`${p}.fromDrop`, '必须是布尔值');
      const frames = array(t.keyframes, `${p}.keyframes`); if (!frames.length) fail(p, '关键帧不能为空');
      let previous = 0;
      for (const [j, rawFrame] of frames.entries()) {
        const f = obj(rawFrame, `${p}.keyframes[${j}]`), q = `${p}.keyframes[${j}]`;
        exactKeys(f, ['at','x','y','w','h','rotation','opacity','asset','restoreHome'], q);
        if(f.restoreHome!==undefined && f.restoreHome!==true)fail(`${q}.restoreHome`,'只能显式设为 true');
        const at = number(f.at, `${q}.at`, .00001, 1); if (at <= previous) fail(q, '关键帧必须按时间递增'); previous = at;
        const { at: _, restoreHome: __, ...patch } = f; validatePose(patch, q, true);
      }
      if (previous !== 1) fail(p, '最后一帧 at 必须等于 1');
    }
  }
  const zoneIds = new Set(Object.keys(zones)), animationIds = new Set(Object.keys(motions));
  for (const rule of rules) {
    const p = `interactions.${rule.id}`; exactKeys(rule, ['id','source','mode','target','requires','unless','stages','grants','outcome','animation','riskDelta','feedback','failure','escape'], p);
    refs([rule.source], objectIds, `${p}.source`); oneOf(rule.mode, ['tap','drop'], `${p}.mode`); oneOf(rule.outcome, ['correct','danger','neutral'], `${p}.outcome`);
    const object = objects.find(o => o.id === rule.source);
    if (object.input !== 'both' && object.input !== (rule.mode === 'tap' ? 'tap' : 'drag')) fail(p, '规则与对象输入方式不一致');
    if (rule.mode === 'drop') refs([rule.target], zoneIds, `${p}.target`);
    else if (rule.target !== undefined) fail(p, '点击规则不能指定拖放目标');
    refs(rule.requires, goalIds, `${p}.requires`); refs(rule.unless, goalIds, `${p}.unless`);
    refs(rule.stages, stageIds, `${p}.stages`);
    refs(rule.grants, goalIds, `${p}.grants`, false); refs([rule.animation], animationIds, `${p}.animation`);
    if (rule.outcome !== 'correct' && rule.grants.length) fail(p, '错误/无关操作不能发放目标');
    if (rule.outcome === 'correct' && !rule.grants.length) fail(p, '正确操作必须产生目标');
    if (rule.outcome === 'danger') text(rule.feedback, `${p}.feedback`);
    if (rule.failure !== undefined && (rule.failure !== true || rule.outcome !== 'danger')) fail(p, '立即失败只能用于明确危险操作');
    if (rule.escape !== undefined) {
      if (rule.escape !== true || rule.outcome !== 'neutral' || rule.grants.length || rule.failure || r.kind !== 'response') fail(p, '提前避险仅允许处置关无奖励的中性交互');
      text(rule.feedback, `${p}.feedback`);
    }
    if (rule.feedback !== undefined) text(rule.feedback, `${p}.feedback`);
    if (rule.riskDelta !== undefined) number(rule.riskDelta, `${p}.riskDelta`, rule.outcome === 'danger' ? 0 : -100, 100);
  }
  const risk = obj(r.risk, 'level.risk'); exactKeys(risk, ['mode','timeout','seconds','initial','warningAt','peakFeedback'], 'level.risk');
  if (risk.timeout !== undefined) oneOf(risk.timeout, ['continue','fail'], 'risk.timeout');
  if (risk.mode !== undefined) oneOf(risk.mode, ['risk','elapsed'], 'risk.mode');
  if (risk.mode === 'elapsed' && risk.initial !== 0) fail('risk.initial', '无风险倒计时的关卡必须从0开始');
  number(risk.seconds, 'risk.seconds', 5, 3600); number(risk.initial, 'risk.initial', 0, 99); number(risk.warningAt, 'risk.warningAt', 1, 100); text(risk.peakFeedback, 'risk.peakFeedback');
  const completion = obj(r.completion, 'level.completion'); exactKeys(completion, ['requires','settleMs','observeMs','fixedStars','summary','title','status'], 'level.completion');
  for (const k of ['title','status']) if (completion[k] !== undefined) text(completion[k], `completion.${k}`);
  const required = refs(completion.requires, goalIds, 'completion.requires', false); if (!required.length) fail('completion.requires', '通关条件不能为空');
  if (required.length !== goals.length) fail('completion.requires', '所有声明的目标都必须参与通关，避免剪影未完成却结算');
  number(completion.settleMs, 'completion.settleMs', 0, 5000); text(completion.summary, 'completion.summary');
  if (completion.observeMs !== undefined) number(completion.observeMs, 'completion.observeMs', 0, 60000);
  if (completion.fixedStars !== undefined) {
    number(completion.fixedStars, 'completion.fixedStars', 1, 3);
    if (!Number.isInteger(completion.fixedStars)) fail('completion.fixedStars', '必须是整数');
  }
  for (const [key,value] of Object.entries(s.zoneLabels === undefined ? {} : obj(s.zoneLabels,'skin.zoneLabels'))) { refs([key],zoneIds,`zoneLabels.${key}`); text(value,`zoneLabels.${key}`); }
  for (const [key, value] of Object.entries(s.zoneConditions === undefined ? {} : obj(s.zoneConditions, 'skin.zoneConditions'))) {
    refs([key], zoneIds, `zoneConditions.${key}`); condition(value, `zoneConditions.${key}`);
  }
  const hexColor = (v: unknown,p: string) => { if (!/^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(text(v,p))) fail(p,'颜色必须为6或8位十六进制'); };
  for (const [i,raw] of array(s.labels ?? [],'skin.labels').entries()) {
    const p=`labels[${i}]`,l=obj(raw,p); exactKeys(l,['object','text','x','y','size','color','align','background','when'],p);
    refs([l.object],poseIds,`${p}.object`); text(l.text,`${p}.text`);
    number(l.x,`${p}.x`,0,1); number(l.y,`${p}.y`,0,1); number(l.size,`${p}.size`,4,100); hexColor(l.color,`${p}.color`);
    if(l.align!==undefined)oneOf(l.align,['left','center','right'],`${p}.align`);
    if(l.background!==undefined)hexColor(l.background,`${p}.background`);
    if(l.when!==undefined) condition(l.when, `${p}.when`, false);
  }
  for (const [i, raw] of array(s.effects, 'skin.effects').entries()) {
    const e = obj(raw, `effects[${i}]`); exactKeys(e, ['object','kind','until'], `effects[${i}]`);
    refs([e.object], poseIds, `effects[${i}].object`); oneOf(e.kind, ['fire','wobble'], `effects[${i}].kind`); refs(e.until, goalIds, `effects[${i}].until`, false);
    if (!e.until.length) fail(`effects[${i}].until`, '环境特效必须有明确停止条件');
  }
  if (s.response !== undefined) {
    const p='skin.response', e=obj(s.response,p); exactKeys(e,['kind','actor','smokeOrigin','smokeDepth','sealed','sourceOff','controlledBy','cues'],p);
    oneOf(r.kind,['response'],p); oneOf(e.kind,['fire'],p+'.kind'); refs([e.actor],poseIds,p+'.actor');
    const origin=obj(e.smokeOrigin,p+'.smokeOrigin'); exactKeys(origin,['x','y'],p+'.smokeOrigin'); number(origin.x,p+'.smokeOrigin.x',0,world.width); number(origin.y,p+'.smokeOrigin.y',0,world.height); number(e.smokeDepth,p+'.smokeDepth',-1000,1000);
    for (const k of ['sealed','sourceOff']) if(e[k]!==undefined) refs([e[k]],goalIds,p+'.'+k);
    if(!refs(e.controlledBy,goalIds,p+'.controlledBy',false).length)fail(p+'.controlledBy','必须声明停止条件');
    const cues=obj(e.cues,p+'.cues'); exactKeys(cues,['opening','rising','critical','actions','milestones','characterEnabled'],p+'.cues');
    if(cues.characterEnabled!==undefined && typeof cues.characterEnabled!=='boolean')fail(p+'.cues.characterEnabled','必须是布尔值');
    const soundIds=new Set(Object.keys(audioManifest.assets));
    const validateCue=(raw:unknown,path:string,action:boolean)=>{const cue=obj(raw,path);exactKeys(cue,action?['at','sound','character']:['sound','character'],path);if(action)number(cue.at,path+'.at',0,1);if(cue.sound!==undefined)refs([cue.sound],soundIds,path+'.sound');if(cue.character!==undefined)refs([cue.character],soundIds,path+'.character');if(!cue.character&&!cue.sound)fail(path,'至少指定一种声音');};
    for(const key of ['opening','rising','critical'])if(cues[key]!==undefined)refs([cues[key]],soundIds,p+'.cues.'+key);
    for(const [key,cue] of Object.entries(obj(cues.actions,p+'.cues.actions'))){refs([key],new Set([...rules.map(x=>x.id),'bounce']),p+'.cues.actions');validateCue(cue,p+'.cues.actions.'+key,true);}
    for(const [key,cue] of Object.entries(obj(cues.milestones,p+'.cues.milestones'))){refs([key],new Set([...goalIds,'controlled']),p+'.cues.milestones');validateCue(cue,p+'.cues.milestones.'+key,false);}
  }
  if (s.presentation !== undefined) {
    const p = 'skin.presentation', presentation = obj(s.presentation, p);
    exactKeys(presentation, ['durationMs','effects','actors','audio','timer','roomSmoke','failureReveal'], p);
    if (presentation.failureReveal !== undefined && (presentation.failureReveal !== true || r.kind !== 'response')) fail(`${p}.failureReveal`, '仅处置关可显式启用失败演出');
    number(presentation.durationMs, `${p}.durationMs`, 1000, 600000);
    if(presentation.timer!==undefined)oneOf(presentation.timer,['countdown'],p+'.timer');
    if(presentation.roomSmoke!==undefined){
      const q=p+'.roomSmoke',v=obj(presentation.roomSmoke,q);
      exactKeys(v,['door','gap','ceiling','depth','closedGoal','pluggedGoal','reinforcedGoal','initialLoad','fillMs'],q);
      refs([v.closedGoal,v.pluggedGoal,v.reinforcedGoal],goalIds,q);
      for(const key of ['door','gap']){const st=obj(v[key],q+'.'+key);exactKeys(st,['origin','control','end','spread','radius','lifetimeMs'],q);
        for(const pt of ['origin','control','end']){exactKeys(obj(st[pt],q),['x','y'],q);number(st[pt].x,q,0,world.width);number(st[pt].y,q,0,world.height);}
        number(st.spread,q,0,300);number(st.radius,q,1,150);number(st.lifetimeMs,q,500,10000);
      }
      exactKeys(obj(v.ceiling,q),['x','y','w','h'],q);inWorld(box(v.ceiling,q),q);
      number(v.depth,q,-1000,1000);number(v.initialLoad,q,0,1);number(v.fillMs,q,1000,600000);
    }
    const effects = array(presentation.effects, `${p}.effects`);
    if (effects.length > 40) fail(`${p}.effects`, '最多 40 个有界效果');
    for (const [i, raw] of effects.entries()) {
      const q = `${p}.effects[${i}]`, effect = obj(raw, q);
      exactKeys(effect, ['kind','box','depth','color','strength','when','reductions','beam','clipPolygons','whenScene'], q);
      oneOf(effect.kind, ['dust','rain','water','smoke','glow','machine','light','alarm','beam'], `${q}.kind`);
      exactKeys(obj(effect.box, `${q}.box`), ['x','y','w','h'], `${q}.box`);
      inWorld(box(effect.box, `${q}.box`), `${q}.box`); number(effect.depth, `${q}.depth`, -1000, 1000);
      if (effect.clipPolygons !== undefined) {
        const path = `${q}.clipPolygons`, polygons = array(effect.clipPolygons, path);
        if (!polygons.length || polygons.length > 16) fail(path, '每个效果需要 1～16 个裁切多边形');
        for (const [j, rawPolygon] of polygons.entries()) {
          const polygonPath = `${path}[${j}]`, polygon = array(rawPolygon, polygonPath);
          if (polygon.length < 3 || polygon.length > 16) fail(polygonPath, '多边形需要 3～16 个顶点');
          for (const [k, rawPoint] of polygon.entries()) {
            const pointPath = `${polygonPath}[${k}]`, point = obj(rawPoint, pointPath);
            exactKeys(point, ['x','y'], pointPath);
            number(point.x, `${pointPath}.x`, 0, world.width);
            number(point.y, `${pointPath}.y`, 0, world.height);
          }
          const areaTwice = polygon.reduce((sum, point, k) => {
            const next = polygon[(k + 1) % polygon.length];
            return sum + point.x * next.y - next.x * point.y;
          }, 0);
          if (Math.abs(areaTwice) <= .000001) fail(polygonPath, '多边形面积不能为零');
        }
      }
      if (effect.whenScene !== undefined) {
        const path = `${q}.whenScene`, scene = obj(effect.whenScene, path);
        exactKeys(scene, ['object','asset'], path);
        refs([scene.object], poseIds, `${path}.object`);
        refs([scene.asset], assetIds, `${path}.asset`);
      }
      if(effect.beam){const v=effect.beam;exactKeys(obj(v,q),['object','origin','axis','length','spread','aperture'],q);if(effect.kind!=='beam')fail(q,'beam参数仅用于光束');refs([v.object],poseIds,q);for(const key of ['origin','axis']){exactKeys(obj(v[key],q),['x','y'],q);for(const axis of ['x','y'])number(v[key][axis],q,-1,1);}if(Math.hypot(v.axis.x,v.axis.y)<.001)fail(q,'方向不可为零');number(v.length,q,1,2000);number(v.spread,q,0,.5);number(v.aperture,q,1,100);}
      if (effect.color !== undefined) hexColor(effect.color, `${q}.color`);
      if (effect.strength !== undefined) number(effect.strength, `${q}.strength`, 0, 2);
      if (effect.when !== undefined) condition(effect.when, `${q}.when`);
      for (const [j, reduction] of array(effect.reductions ?? [], `${q}.reductions`).entries()) {
        const a = `${q}.reductions[${j}]`; exactKeys(obj(reduction, a), ['when','factor'], a);
        condition(reduction.when, `${a}.when`); number(reduction.factor, `${a}.factor`, 0, 1);
      }
    }
    const actorIds = new Set<string>();
    for (const [i, raw] of array(presentation.actors ?? [], `${p}.actors`).entries()) {
      const q = `${p}.actors[${i}]`, actor = obj(raw, q); exactKeys(actor, ['object','amplitude','until','performance'], q);
      refs([actor.object], poseIds, `${q}.object`); number(actor.amplitude, `${q}.amplitude`, 0, 1);
      refs(actor.until, goalIds, `${q}.until`);
      if(actor.performance){
        const path = `${q}.performance`, v=obj(actor.performance,path);
        exactKeys(v,['lean','periodMs','cough','cycle'],path); number(v.lean,`${path}.lean`,0,.15); number(v.periodMs,`${path}.periodMs`,500,10000);
        if(v.cough){exactKeys(obj(v.cough,path),['asset','w','h','everyMs','durationMs','until'],path);refs([v.cough.asset],assetIds,path);number(v.cough.w,path,1,world.width);number(v.cough.h,path,1,world.height);number(v.cough.everyMs,path,3000,30000);number(v.cough.durationMs,path,300,2000);refs(v.cough.until,goalIds,path);}
        if(v.cycle!==undefined){
          const cyclePath=`${path}.cycle`, cycle=obj(v.cycle,cyclePath);
          exactKeys(cycle,['frames','periodMs','when'],cyclePath);
          const frames=refs(cycle.frames,assetIds,`${cyclePath}.frames`,false);
          if(frames.length<2 || frames.length>16)fail(`${cyclePath}.frames`,'循环需要 2～16 张不同状态图');
          number(cycle.periodMs,`${cyclePath}.periodMs`,500,10000);
          if(cycle.when!==undefined)condition(cycle.when,`${cyclePath}.when`);
        }
      }
      if (actorIds.has(actor.object)) fail(q, '同一个人物不能重复驱动'); actorIds.add(actor.object);
    }
    if (presentation.audio !== undefined) {
      const q = `${p}.audio`, audio = obj(presentation.audio, q); exactKeys(audio, ['theme','cues','calmWhen','emergency','ambientProfile'], q);
      oneOf(audio.theme, ['quake','outdoor','collapse','medical','water','flood','lift','electric','fire'], `${q}.theme`);
      refs(audio.calmWhen, goalIds, `${q}.calmWhen`);
      if(audio.ambientProfile!==undefined)oneOf(audio.ambientProfile,['flood-window'],`${q}.ambientProfile`);
      if(audio.emergency){
        const e=obj(audio.emergency,q+'.emergency');
        exactKeys(e,['alarm','alarmUntil','heartbeat','cough','coughUntil','rescue','rescueAfterMs'],q);
        if(!['alarm','heartbeat','cough','rescue'].some(k=>e[k]!==undefined))fail(q,'至少配置一个声音');
        for(const k of ['alarm','heartbeat','cough','rescue'])if(e[k]!==undefined){id(e[k],q+'.'+k);if(/voice|speech|tts|narrat/i.test(e[k]))fail(q,'禁止朗读');}
        refs(e.alarmUntil,goalIds,q+'.alarmUntil');refs(e.coughUntil,goalIds,q+'.coughUntil');
        if(e.rescueAfterMs!==undefined)number(e.rescueAfterMs,q+'.rescueAfterMs',500,10000);
      }
      const cueKeys = new Set([...rules.map(rule => rule.id), ...stageIds, 'pickup','bounce','danger','goal','waiting','complete','opening','failure']);
      for (const [key, value] of Object.entries(obj(audio.cues, `${q}.cues`))) {
        refs([key], cueKeys, `${q}.cues.${key}`); id(value, `${q}.cues.${key}`);
        if (/(?:voice|speech|tts|narrat)/i.test(value)) fail(`${q}.cues.${key}`, '禁止文字朗读或语句音轨');
      }
    }
  }
  // Exhaust all monotone goal states, not just a topological approximation. This catches
  // mutually exclusive locks, shadowed rules, premature disabled objects and dead-end choices.
  const queue: string[][] = [[]], visited = new Set(['']), full = [...goalIds].sort().join('|');
  let fullFound = false;
  for (let index = 0; index < queue.length; index++) {
    const done = queue[index], all = (ids: string[] = []) => ids.every(v => done.includes(v)), any = (ids: string[] = []) => ids.some(v => done.includes(v));
    // Waiting for a goal-qualified stage is legal and has no penalty. Include
    // every such stage while checking goal deadlocks after required waits;
    // actual delay boundaries and pre-stage input are tested in the pure engine.
    const availableStages = stages.filter(stage => all(stage.requires)).map(stage => stage.id);
    const stageReady = (ids: string[] = []) => ids.every(value => availableStages.includes(value));
    const zoneReady = (target: string | undefined) => {
      const c = target && s.zoneConditions?.[target];
      return !c || (all(c.all) && (!c.any?.length || any(c.any)) && !any(c.not) && stageReady(c.stages)
        && !(c.notStages ?? []).some((stage: string) => availableStages.includes(stage))
        && !(risk.mode === 'elapsed' && (c.riskAtLeast ?? 0) > 0));
    };
    if ([...done].sort().join('|') === full) { fullFound = true; continue; }
    let outgoing = false;
    for (const o of objects) {
      if (!all(o.requires) || any(o.disabledWhen) || !stageReady(o.stages)) continue;
      const inputs = rules.filter(rule => rule.source === o.id);
      for (const input of inputs) {
        const first = rules.find(rule => rule.source === o.id && rule.mode === input.mode && rule.target === input.target && all(rule.requires) && !any(rule.unless) && stageReady(rule.stages) && zoneReady(rule.target) && (!rule.grants.length || !all(rule.grants)));
        if (!first || first.outcome !== 'correct' || !first.grants.length) continue;
        outgoing = true;
        const next = [...new Set([...done, ...first.grants])].sort(), key = next.join('|');
        if (!visited.has(key)) { visited.add(key); queue.push(next); }
      }
    }
    if (!outgoing) fail('level.interactions', `存在无法通关的状态，已完成 [${done.join(', ')}]；检查前置条件、禁用条件和规则顺序`);
  }
  if (!fullFound) fail('completion.requires', '目标不可达');
  return { rules: rulesInput, skin: skinInput } as LevelPackage;
}
