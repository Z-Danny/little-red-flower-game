import type { LevelPackage } from './schema';

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
  exactKeys(r, ['schemaVersion','id','kind','title','order','location','description','safety','objects','goals','interactions','risk','completion'], 'level');
  exactKeys(s, ['schemaVersion','id','world','assets','background','poses','zones','states','animations','effects'], 'skin');
  oneOf(r.schemaVersion, [1], 'level.schemaVersion'); oneOf(s.schemaVersion, [1], 'skin.schemaVersion');
  id(r.id, 'level.id'); id(s.id, 'skin.id'); oneOf(r.kind, ['prevention', 'response'], 'level.kind');
  ['title','location','description','safety'].forEach(k => text(r[k], `level.${k}`));
  number(r.order, 'level.order', 1, 9999); if (!Number.isInteger(r.order)) fail('level.order', '必须是整数');
  const objects = array(r.objects, 'level.objects'), goals = array(r.goals, 'level.goals'), rules = array(r.interactions, 'level.interactions');
  if (!objects.length || objects.length > 40) fail('level.objects', '每关 1～40 个对象');
  if (!goals.length || goals.length > 12) fail('level.goals', '每关 1～12 个目标');
  const targetCount = goals.filter(g => g?.showTarget !== false).length;
  if (r.kind === 'prevention' && (targetCount < 3 || targetCount > 6)) fail('level.goals', '找隐患必须有 3～6 个剪影目标，辅助目标可设 showTarget=false');
  const objectIds = uniqueIds(objects, 'level.objects'), goalIds = uniqueIds(goals, 'level.goals');
  uniqueIds(rules, 'level.interactions');
  for (const o of objects) {
    exactKeys(o, ['id','label','input','requires','disabledWhen'], `objects.${o.id}`);
    text(o.label, `objects.${o.id}.label`); oneOf(o.input, ['tap','drag','none'], `objects.${o.id}.input`);
    refs(o.requires, goalIds, `objects.${o.id}.requires`); refs(o.disabledWhen, goalIds, `objects.${o.id}.disabledWhen`);
  }
  for (const g of goals) {
    exactKeys(g, ['id','label','object','showTarget'], `goals.${g.id}`);
    if (g.showTarget !== undefined && typeof g.showTarget !== 'boolean') fail(`goals.${g.id}.showTarget`, '必须是布尔值');
    text(g.label, `goals.${g.id}.label`); refs([g.object], objectIds, `goals.${g.id}.object`);
  }
  const world = obj(s.world, 'skin.world'); exactKeys(world, ['width','height'], 'skin.world');
  number(world.width, 'skin.world.width', 100, 4000); number(world.height, 'skin.world.height', 100, 4000);
  const assets = obj(s.assets, 'skin.assets'), assetIds = new Set(Object.keys(assets));
  for (const [key, value] of Object.entries(assets)) {
    id(key, `assets.${key}`); const a = obj(value, `assets.${key}`); exactKeys(a, ['src','alpha'], `assets.${key}`);
    const source = text(a.src, `assets.${key}.src`);
    if (!localAssetPattern.test(source) && !(options.embedded && /^data:image\/(?:png|webp);base64,[A-Za-z0-9+/=]+$/.test(source))) fail(`assets.${key}.src`, '只接受 public/levels 内 PNG/WebP 的绝对 URL，不接受网络或临时路径');
    if (typeof a.alpha !== 'boolean') fail(`assets.${key}.alpha`, '必须明确声明是否需要透明通道');
  }
  refs([s.background], assetIds, 'skin.background');
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
    const when = obj(state.when, `${p}.when`); exactKeys(when, ['all','any','not','emotion','riskAtLeast'], `${p}.when`);
    if (!Object.keys(when).length) fail(`${p}.when`, '状态条件不能为空');
    for (const k of ['all','any','not']) refs(when[k], goalIds, `${p}.when.${k}`);
    if (when.emotion !== undefined) oneOf(when.emotion, ['worried','panicked','focused','relieved'], `${p}.when.emotion`);
    if (when.riskAtLeast !== undefined) number(when.riskAtLeast, `${p}.when.riskAtLeast`, 0, 100);
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
        exactKeys(f, ['at','x','y','w','h','rotation','opacity','asset'], q);
        const at = number(f.at, `${q}.at`, .00001, 1); if (at <= previous) fail(q, '关键帧必须按时间递增'); previous = at;
        const { at: _, ...patch } = f; validatePose(patch, q, true);
      }
      if (previous !== 1) fail(p, '最后一帧 at 必须等于 1');
    }
  }
  const zoneIds = new Set(Object.keys(zones)), animationIds = new Set(Object.keys(motions));
  for (const rule of rules) {
    const p = `interactions.${rule.id}`; exactKeys(rule, ['id','source','mode','target','requires','unless','grants','outcome','animation','riskDelta','feedback'], p);
    refs([rule.source], objectIds, `${p}.source`); oneOf(rule.mode, ['tap','drop'], `${p}.mode`); oneOf(rule.outcome, ['correct','danger','neutral'], `${p}.outcome`);
    const object = objects.find(o => o.id === rule.source);
    if (object.input !== (rule.mode === 'tap' ? 'tap' : 'drag')) fail(p, '规则与对象输入方式不一致');
    if (rule.mode === 'drop') refs([rule.target], zoneIds, `${p}.target`);
    else if (rule.target !== undefined) fail(p, '点击规则不能指定拖放目标');
    refs(rule.requires, goalIds, `${p}.requires`); refs(rule.unless, goalIds, `${p}.unless`);
    refs(rule.grants, goalIds, `${p}.grants`, false); refs([rule.animation], animationIds, `${p}.animation`);
    if (rule.outcome !== 'correct' && rule.grants.length) fail(p, '错误/无关操作不能发放目标');
    if (rule.outcome === 'correct' && !rule.grants.length) fail(p, '正确操作必须产生目标');
    if (rule.outcome === 'danger') text(rule.feedback, `${p}.feedback`);
    if (rule.feedback !== undefined) text(rule.feedback, `${p}.feedback`);
    if (rule.riskDelta !== undefined) number(rule.riskDelta, `${p}.riskDelta`, rule.outcome === 'danger' ? 0 : -100, 100);
  }
  const risk = obj(r.risk, 'level.risk'); exactKeys(risk, ['seconds','initial','warningAt','peakFeedback'], 'level.risk');
  number(risk.seconds, 'risk.seconds', 5, 3600); number(risk.initial, 'risk.initial', 0, 99); number(risk.warningAt, 'risk.warningAt', 1, 100); text(risk.peakFeedback, 'risk.peakFeedback');
  const completion = obj(r.completion, 'level.completion'); exactKeys(completion, ['requires','settleMs','summary'], 'level.completion');
  const required = refs(completion.requires, goalIds, 'completion.requires', false); if (!required.length) fail('completion.requires', '通关条件不能为空');
  if (required.length !== goals.length) fail('completion.requires', '所有声明的目标都必须参与通关，避免剪影未完成却结算');
  number(completion.settleMs, 'completion.settleMs', 0, 5000); text(completion.summary, 'completion.summary');
  for (const [i, raw] of array(s.effects, 'skin.effects').entries()) {
    const e = obj(raw, `effects[${i}]`); exactKeys(e, ['object','kind','until'], `effects[${i}]`);
    refs([e.object], poseIds, `effects[${i}].object`); oneOf(e.kind, ['fire','wobble'], `effects[${i}].kind`); refs(e.until, goalIds, `effects[${i}].until`, false);
    if (!e.until.length) fail(`effects[${i}].until`, '环境特效必须有明确停止条件');
  }
  // Exhaust all monotone goal states, not just a topological approximation. This catches
  // mutually exclusive locks, shadowed rules, premature disabled objects and dead-end choices.
  const queue: string[][] = [[]], visited = new Set(['']), full = [...goalIds].sort().join('|');
  let fullFound = false;
  for (let index = 0; index < queue.length; index++) {
    const done = queue[index], all = (ids: string[] = []) => ids.every(v => done.includes(v)), any = (ids: string[] = []) => ids.some(v => done.includes(v));
    if ([...done].sort().join('|') === full) { fullFound = true; continue; }
    let outgoing = false;
    for (const o of objects) {
      if (!all(o.requires) || any(o.disabledWhen)) continue;
      const inputs = rules.filter(rule => rule.source === o.id);
      for (const input of inputs) {
        const first = rules.find(rule => rule.source === o.id && rule.mode === input.mode && rule.target === input.target && all(rule.requires) && !any(rule.unless) && (!rule.grants.length || !all(rule.grants)));
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
