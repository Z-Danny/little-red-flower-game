import { level, timing, isPlayableItem, type Emotion, type GoalId, type ItemId, type Point, type ZoneId } from './config';

export type ActionKind = 'cover' | 'shutoff' | 'evacuate' | 'water' | 'cloth' | 'spray' | 'miss-spray' | 'bounce';
export type Action = { kind: ActionKind; item: ItemId; from: Point; at: Point; age: number; duration: number; goal?: GoalId };
export type Notice = { serial: number; tone: 'success' | 'danger' | 'neutral'; text: string };
export type Run = {
  phase: 'briefing' | 'playing' | 'settling' | 'complete'; elapsed: number; risk: number;
  covered: boolean; gasOff: boolean; evacuated: boolean; mistakes: number;
  action: Action | null; reaction: Emotion | null; reactionAge: number; boost: number; suppression: number;
  notice: Notice; serial: number; settlingAge: number; stars: number; peakReached: boolean;
};
export type Event = { type: 'start' | 'reset' | 'hint' } | { type: 'tick'; ms: number }
  | { type: 'drop'; item: ItemId; zone: ZoneId; at: Point; from: Point };

export const createRun = (): Run => ({
  phase: 'briefing', elapsed: 0, risk: level.initialRisk, covered: false, gasOff: false, evacuated: false,
  mistakes: 0, action: null, reaction: null, reactionAge: 0, boost: 0, suppression: 0,
  notice: { serial: 0, tone: 'neutral', text: '直接拿取厨房里的物品；点击灶台旋钮可以关火。' }, serial: 0,
  settlingAge: 0, stars: 0, peakReached: false,
});
export const controlled = (r: Run) => r.covered && r.gasOff;
export const completedCount = (r: Run) => Number(r.covered) + Number(r.gasOff) + Number(r.evacuated);
export const emotion = (r: Run): Emotion => controlled(r) ? 'relieved' : r.reaction ?? (r.risk >= 70 ? 'panicked' : 'worried');
export function fireLevel(r: Run) {
  if (controlled(r)) return 0;
  if (r.covered) return .12; // Only the burner glow remains under the sealed pan.
  return Math.max(.18, (r.gasOff ? .5 : .78) + r.risk / 190 + r.boost - r.suppression);
}
export function smokeLevel(r: Run) {
  if (controlled(r)) return Math.max(0, 1 - r.settlingAge / 1100) * .18;
  return Math.min(1, (r.covered ? .25 : .55) * (r.gasOff ? .6 : 1) + r.boost * .22 + r.risk / 500);
}
function tell(r: Run, text: string, tone: Notice['tone'] = 'neutral'): Run {
  return { ...r, serial: r.serial + 1, notice: { serial: r.serial + 1, tone, text } };
}
function begin(r: Run, e: Extract<Event, { type: 'drop' }>, kind: ActionKind, duration: number, text: string, goal?: GoalId): Run {
  return tell({ ...r, action: { kind, item: e.item, at: e.at, from: e.from, age: 0, duration, goal } }, text, goal ? 'success' : 'neutral');
}
export function reduceRun(r: Run, e: Event, presentation?:{settleMs:number}): Run {
  if (e.type === 'reset') return createRun();
  if (e.type === 'start') return r.phase === 'briefing' ? { ...r, phase: 'playing' } : r;
  if (e.type === 'hint') {
    if (r.phase !== 'playing' || r.action) return r;
    return tell(r, !r.gasOff ? '点击灶台面板上的燃气开关，让它原位旋转关闭。' : !r.covered ? '锅盖在左下方备菜台上，把它拖到着火的油锅上。' : '两项处置都完成了，把人物拖到右侧门外安全区。');
  }
  if (e.type === 'tick') {
    if (r.phase === 'briefing' || r.phase === 'complete' || !Number.isFinite(e.ms) || e.ms <= 0) return r;
    const ms = Math.min(e.ms, 100), safe = controlled(r);
    const elapsed = r.elapsed + ms;
    // Exactly 50 active seconds to the training peak. Correct/incorrect actions
    // change the fire, never refill or shorten the separate countdown clock.
    const risk = safe ? Math.max(0, r.risk - ms / 25) : elapsed >= level.riskSeconds * 1000 ? 100
      : Math.min(100, r.risk + ms * (100 - level.initialRisk) / (level.riskSeconds * 1000));
    let n: Run = { ...r, elapsed, risk,
      boost: Math.max(0, r.boost - ms / 14000), suppression: Math.max(0, r.suppression - ms / 9000),
      reactionAge: Math.max(0, r.reactionAge - ms), reaction: r.reactionAge > ms ? r.reaction : null,
      settlingAge: safe ? r.settlingAge + ms : 0 };
    if (!n.peakReached && n.risk >= 100) {
      n.peakReached = true;
      // Never replace an actionable wrong-operation explanation with a generic peak notice.
      if (!r.action && r.reactionAge <= 0) n = tell({ ...n, reaction: 'panicked', reactionAge: timing.reaction }, '火势已很危险！训练仍可继续；现实中请立即撤离并拨打 119。', 'danger');
    }
    if (r.action) {
      const action = { ...r.action, age: r.action.age + ms };
      n.action = action;
      if (action.age >= action.duration) {
        n.action = null;
        if (action.goal) {
          n[action.goal] = true;
          n.reaction = 'focused'; n.reactionAge = timing.reaction;
          n.risk = Math.max(0, n.risk - 12);
          if (action.goal === 'covered') n = tell(n, n.gasOff ? '锅口已盖严，明火熄灭。请带人物撤离。' : '锅盖已盖严！还需要关闭燃气，停止继续加热。', 'success');
          if (action.goal === 'gasOff') n = tell(n, n.covered ? '燃气已关闭，明火熄灭。请带人物撤离。' : '火源已关闭。油锅仍在燃烧，请用锅盖盖严。', 'success');
          if (action.goal === 'evacuated') {
            n.phase = 'settling'; n.settlingAge = 0; n.stars = n.mistakes === 0 ? 3 : 2;
            n = tell(n, '已到门外安全区。火灭后不要立即揭开锅盖。', 'success');
          }
        }
      }
    }
    if (r.phase === 'settling' && n.settlingAge >= (presentation?.settleMs??timing.settling)) n.phase = 'complete';
    return n;
  }
  if (e.type !== 'drop' || r.phase !== 'playing' || r.action) return r;
  if (!isPlayableItem(e.item)) return r;
  if ((e.item === 'lid' && r.covered) || (e.item === 'gas' && r.gasOff) || (e.item === 'person' && r.evacuated)) return r;
  if (e.item === 'lid' && e.zone === 'pan') return begin(r, e, 'cover', timing.lid, '正在平稳盖住锅口…', 'covered');
  if (e.item === 'gas' && e.zone === 'off') return begin(r, e, 'shutoff', timing.gas, '正在关闭燃气开关…', 'gasOff');
  if (e.item === 'person' && e.zone === 'exit') {
    if (controlled(r)) return begin(r, e, 'evacuate', timing.person, '沿着安全路线撤到门外…', 'evacuated');
    return begin(r, e, 'bounce', timing.bounce, '训练目标尚未完成：先完成关火和盖锅盖。现实火势失控时应立即撤离。');
  }
  if ((e.item === 'water' || e.item === 'cloth') && e.zone === 'pan') {
    if (r.covered) return begin(r, e, 'bounce', timing.bounce, '锅口已经盖住，请保持覆盖，不要添加水或其他物品。');
    const text = e.item === 'water' ? '油锅起火不能泼水！火焰突然蹿高了。' : '不要用易燃物覆盖火焰！这块小化纤抹布无法盖严锅口，已经着火。';
    return tell({ ...begin(r, e, e.item, timing.wrong, text), mistakes: r.mistakes + 1, risk: Math.min(100, r.risk + 15), boost: Math.min(.9, r.boost + .6), reaction: 'panicked', reactionAge: timing.reaction }, text, 'danger');
  }
  if (e.item === 'extinguisher') {
    const aimed = e.zone === 'pan';
    return tell({ ...begin(r, e, aimed ? 'spray' : 'miss-spray', timing.spray, ''),
      suppression: aimed && !r.covered ? .5 : r.suppression,
      reaction: aimed ? 'focused' : r.risk >= 70 ? 'panicked' : 'worried', reactionAge: timing.reaction },
    aimed ? '已对准火焰根部，火势暂时降低。本关仍需完成关火和盖锅盖。' : '喷射偏移了，请对准火焰根部。', aimed ? 'success' : 'neutral');
  }
  return begin(r, e, 'bounce', timing.bounce, e.item === 'plate' || e.item === 'knife' ? '这件物品不能用于本关处置，已放回原位。' : '目标没有对上，再试试。');
}
