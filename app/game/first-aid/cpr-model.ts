import rules from '@/content/first-aid/cpr/rules.json';
export { rules as cprRules };
export type CprPhase = 'scene' | 'position' | 'hands' | 'posture' | 'rhythm' | 'complete';
export type CprStep = 'call' | 'aed' | 'start' | 'position' | 'hands' | 'posture' | 'rhythm' | 'handover' | 'finish';
export type CprReview = { action: Exclude<CprStep, 'finish'>; remainingMs: number };
export type CprState = {
  phase: CprPhase; elapsed: number; called: boolean; requestedAt: number | null;
  aedReady: boolean; handedOver: boolean; samples: number; near: number;
  lastTap: number | null; pulseAt: number | null; feedback: string; review: CprReview | null;
};
export type CprEvent =
  | { type: 'tick'; dt: number } | { type: 'call' | 'aed' | 'start' | 'tap' | 'handover' | 'finish' | 'suspend' | 'continue' }
  | { type: 'position' | 'hands' | 'posture'; correct: boolean };
export const createCpr = (): CprState => ({ phase: 'scene', elapsed: 0, called: false, requestedAt: null, aedReady: false, handedOver: false, samples: 0, near: 0, lastTap: null, pulseAt: null, review: null, feedback: '教学练习逐步进行：先请女士拨打120。真实急救中呼救与帮助应并行。' });
/** Sequential learning only: never prescribe these reading pauses for real CPR. */
export function cprStep(s: CprState): CprStep {
  if (!s.called) return 'call';
  if (s.requestedAt === null) return 'aed';
  if (s.phase === 'scene') return 'start';
  if (s.phase !== 'rhythm' && s.phase !== 'complete') return s.phase;
  if (s.samples < rules.sampleIntervals) return 'rhythm';
  return s.handedOver ? 'finish' : 'handover';
}
export const canFinishCpr = (s: CprState) => !s.review && s.phase === 'rhythm' && s.called && s.aedReady && s.handedOver && s.samples >= rules.sampleIntervals;
const reviewAfter = (s: CprState, action: CprReview['action']): CprState => ({ ...s, lastTap: null, pulseAt: null, review: { action, remainingMs: rules.reviewMs } });
export function reduceCpr(s: CprState, e: CprEvent): CprState {
  if (e.type === 'tick') {
    if (!Number.isFinite(e.dt) || e.dt < 0 || e.dt > 250) return s;
    const elapsed = s.elapsed + e.dt;
    return { ...s, elapsed, aedReady: s.aedReady || (s.requestedAt !== null && elapsed - s.requestedAt >= rules.aedTravelMs), review: s.review ? { ...s.review, remainingMs: Math.max(0, s.review.remainingMs - e.dt) } : null };
  }
  if (e.type === 'suspend') return { ...s, lastTap: null, pulseAt: null };
  if (s.phase === 'complete') return s;
  if (e.type === 'continue') return s.review?.remainingMs === 0 ? { ...s, review: null, lastTap: null, pulseAt: null, feedback: '' } : s;
  // A reducer guard, not just disabled buttons: rapid clicks/keyboard cannot skip steps.
  if (s.review || (e.type === 'tap' ? 'rhythm' : e.type) !== cprStep(s)) return s;
  switch (e.type) {
    case 'call': return reviewAfter({ ...s, called: true, feedback: '已指派旁人拨打120。' }, 'call');
    case 'aed': return reviewAfter({ ...s, requestedAt: s.elapsed, feedback: '已指派另一人尽快取AED。' }, 'aed');
    case 'start': return reviewAfter({ ...s, phase: 'position', feedback: '选择患者胸部一侧的施救位置。' }, 'start');
    case 'position': return e.correct
      ? reviewAfter({ ...s, phase: 'hands', feedback: '已到胸部一侧。' }, 'position')
      : { ...s, feedback: '脚边离胸部太远。请移到胸部一侧，不搬动患者去找道具。' };
    case 'hands': return e.correct
      ? reviewAfter({ ...s, phase: 'posture', feedback: '手位示意正确。' }, 'hands')
      : { ...s, feedback: '不是腹部。掌根应在胸部中央、胸骨下半部，双手重叠。' };
    case 'posture': return e.correct
      ? reviewAfter({ ...s, phase: 'rhythm', feedback: '姿势示意正确。' }, 'posture')
      : { ...s, feedback: '不要弯肘、斜着用力。双臂伸直，肩在双手正上方，注意充分回弹。' };
    case 'tap': {
      const dt = s.lastTap === null ? null : s.elapsed - s.lastTap;
      if (dt !== null && dt < rules.minInputMs) return { ...s, feedback: '点得太急了，跟随光点，避免连点。' };
      if (dt === null || dt > rules.maxIntervalMs) return { ...s, lastTap: s.elapsed, pulseAt: s.elapsed, feedback: '已记录起拍，继续点按。停顿后重新采样，不扣除已有练习。' };
      const rate = 60000 / dt, near = rate >= rules.rateMin && rate <= rules.rateMax;
      const next = { ...s, lastTap: s.elapsed, pulseAt: s.elapsed, samples: Math.min(rules.sampleIntervals, s.samples + 1), near: s.near + Number(near), feedback: near ? '输入节奏接近提示，继续保持。' : rate > rules.rateMax ? '输入偏快，稍微放慢；按压后注意充分回弹。' : '输入偏慢，稍微加快，跟随光点。' };
      return next.samples === rules.sampleIntervals ? reviewAfter(next, 'rhythm') : next;
    }
    case 'handover': return s.aedReady ? reviewAfter({ ...s, handedOver: true, feedback: '接替者已就位并继续模拟按压。' }, 'handover') : s;
    case 'finish': return canFinishCpr(s) ? { ...s, phase: 'complete', feedback: '练习完成，协助者继续模拟救助。本关不演示AED分析或电击。' } : s;
  }
}
