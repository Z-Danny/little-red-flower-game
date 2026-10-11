import rules from '@/content/staged-response/first-aid-comprehensive/rules.json';
export { rules };
export type Phase = 'intro' | 'prepare' | 'prepared' | 'review' | 'reviewed' | 'respond' | 'complete';
export type Step = 'safety' | 'assess' | 'recognize' | 'help' | 'power' | 'pads' | 'analysis' | 'decision' | 'resume' | 'handover';
export type Branch = 'shock' | 'no-shock';
export type Axis = 'preparation' | 'recognition' | 'action-cooperation';
export type State = {
  phase: Phase; step: Step; branch: Branch; paused: boolean;
  packed: string[]; checked: string[]; found: string[]; acknowledged: string[];
  called: boolean; dispatched: boolean; cpr: boolean; clear: boolean; shocked: boolean; resumed: boolean;
  feedback: string; correction: string | null; mistakes: Record<Axis, number>; log: string[];
  elapsed: number; dispatchedAt: number | null; aedReady: boolean; observations: string[];
  exposed: boolean; pads: string[]; cleared: string[]; beats: number;
};
export type Action = { type: string; id?: string; target?: string; dt?: number };
export const initialState = (branch: Branch = 'shock'): State => ({
  phase: 'intro', step: 'safety', branch, paused: false, packed: [], checked: [], found: [], acknowledged: [],
  called: false, dispatched: false, cpr: false, clear: false, shocked: false, resumed: false,
  feedback: '', correction: null, mistakes: { preparation: 0, recognition: 0, 'action-cooperation': 0 }, log: [],
  elapsed: 0, dispatchedAt: null, aedReady: false, observations: [], exposed: false, pads: [], cleared: [], beats: 0,
});
const includes = (ids: readonly string[], id?: string): id is string => !!id && ids.includes(id);
const unique = (ids: string[], id: string) => ids.includes(id) ? ids : [...ids, id];
export const preparationReady = (s: State) => rules.inventory.every(id => s.packed.includes(id)) && rules.siteChecks.every(id => s.checked.includes(id));
export const reviewReady = (s: State) => rules.reviewTargets.every(id => s.acknowledged.includes(id));
export const result = (s: State) => [
  { axis: '准备合理', done: preparationReady(s), corrections: s.mistakes.preparation },
  { axis: '识别不当帮助', done: reviewReady(s), corrections: s.mistakes.recognition },
  { axis: '行动与协作', done: s.phase === 'complete' && s.called && s.dispatched && s.resumed, corrections: s.mistakes['action-cooperation'] },
];
/** Pure scene actions. Only the active scene clock advances; no patient health or real-skill scoring. */
export function reduce(s: State, a: Action): State {
  if (a.type === 'restart') return initialState(s.branch);
  if (a.type === 'pause') return { ...s, paused: true };
  if (a.type === 'continue') return { ...s, paused: false };
  if (s.paused || s.phase === 'complete') return s;
  if (a.type === 'tick') {
    if (s.phase !== 'respond' || !Number.isFinite(a.dt) || a.dt! <= 0 || a.dt! > 250) return s;
    const elapsed = s.elapsed + a.dt!;
    return { ...s, elapsed, aedReady: s.aedReady || (s.dispatchedAt !== null && elapsed - s.dispatchedAt >= rules.interaction.aedTravelActiveMs) };
  }
  const update = (patch: Partial<State>) => ({ ...s, feedback: '', ...patch, log: [...s.log, a.type + (a.id ? ':' + a.id : '')] });
  const wrong = (axis: Axis, feedback: string) => update({ feedback, mistakes: { ...s.mistakes, [axis]: s.mistakes[axis] + 1 } });
  if (a.type === 'dismiss-feedback') return { ...s, feedback: '' };
  if (s.phase === 'intro') {
    if (a.type === 'branch' && (a.id === 'shock' || a.id === 'no-shock')) return update({ branch: a.id });
    if (a.type === 'begin') return update({ phase: 'prepare' });
  }
  if (s.phase === 'prepare') {
    if (a.type === 'pack' && includes(rules.inventory, a.id)) return s.packed.includes(a.id) ? s : update({ packed: unique(s.packed, a.id) });
    if (a.type === 'check' && includes(rules.siteChecks, a.id)) return s.checked.includes(a.id) ? s : update({ checked: unique(s.checked, a.id) });
    if (a.type === 'unneeded') return wrong('preparation', '个人处方药不作为公共通用用品。');
    if (a.type === 'finish-prep' && preparationReady(s)) return update({ phase: 'prepared' });
  }
  if (s.phase === 'prepared' && a.type === 'open-review') return update({ phase: 'review' });
  if (s.phase === 'review') {
    if (s.correction) {
      if (a.type === 'acknowledge') return update({ acknowledged: unique(s.acknowledged, s.correction), correction: null });
      return s;
    }
    if (a.type === 'identify' && includes(rules.reviewTargets, a.id)) return s.acknowledged.includes(a.id) ? s : update({ found: unique(s.found, a.id), correction: a.id });
    if (a.type === 'review-safe') return wrong('recognition', '这里没有不当行为。观察杯子、急救包旁等待的人和拍摄者。');
    if (a.type === 'finish-review' && reviewReady(s)) return update({ phase: 'reviewed' });
  }
  if (s.phase === 'reviewed' && a.type === 'start-event') return update({ phase: 'respond', step: 'safety' });
  if (s.phase !== 'respond') return s;
  if (a.type === 'wait') return wrong('action-cooperation', '不要等待用品或AED返回，先启动呼救与帮助。');
  if (a.type === 'water') return wrong('action-cooperation', '无反应者不能喂水、喂食或喂药。');
  if (s.step === 'safety' && a.type === 'safe') return update({ step: 'assess' });
  if (s.step === 'assess' && a.type === 'examine' && includes(['response', 'breathing'], a.id)) {
    const observations = unique(s.observations, a.id);
    return update({ observations, step: observations.length === 2 ? 'recognize' : 'assess', feedback: a.id === 'response' ? '呼唤、轻拍双肩：没有反应。' : '观察呼吸：没有正常呼吸，仅有异常喘息。' });
  }
  if (s.step === 'recognize') {
    if (a.type === 'recognize') return update({ step: 'help' });
    if (a.type === 'normal') return wrong('action-cooperation', '异常喘息不是正常呼吸。本题需要立即启动帮助。');
  }
  if (s.step === 'help') {
    if (a.type === 'call' && !s.called) return update({ called: true });
    if (a.type === 'dispatch' && !s.dispatched) return update({ dispatched: true, dispatchedAt: s.elapsed });
    if (a.type === 'cpr' && s.called) return update({ cpr: true, beats: s.beats + 1 });
    if (a.type === 'receive-aed' && s.called && s.dispatched && s.cpr && s.aedReady) return update({ step: 'power' });
  }
  if (s.step === 'power' && a.type === 'power') return update({ step: 'pads' });
  if (s.step === 'pads') {
    if (a.type === 'expose') return update({ exposed: true });
    if (a.type === 'place-pad' && s.exposed && includes(['upper', 'side'], a.id)) {
      if (s.pads.includes(a.id)) return s;
      if (a.target !== a.id) return wrong('action-cooperation', '按设备图示匹配位置；可拖动，也可先点电极片再点对应落位。');
      const pads = unique(s.pads, a.id);
      return update({ pads, step: pads.length === 2 ? 'analysis' : 'pads', cleared: [] });
    }
  }
  if (s.step === 'analysis' || (s.step === 'decision' && s.branch === 'shock')) {
    if (a.type === 'clear-person' && includes(['self', 'caller', 'runner'], a.id)) {
      if (s.cleared.includes(a.id)) return s;
      const cleared = unique(s.cleared, a.id);
      return cleared.length < 3 ? update({ cleared }) : s.step === 'analysis'
        ? update({ step: 'decision', cleared: [], clear: false }) : update({ cleared, clear: true });
    }
    if (a.type === 'touch') return wrong('action-cooperation', '分析与电击时，所有人都要离开接触。');
  }
  if (s.step === 'decision') {
    if (a.type === 'shock') {
      if (s.branch === 'no-shock') return wrong('action-cooperation', '设备不建议电击。请立即恢复CPR。');
      return s.clear ? update({ shocked: true, step: 'resume' }) : wrong('action-cooperation', '电击前，再次确认自己和两位同伴均已离开接触。');
    }
    if (s.branch === 'no-shock' && a.type === 'resume') return update({ resumed: true, step: 'handover' });
  }
  if (s.step === 'resume' && a.type === 'resume') return update({ resumed: true, step: 'handover' });
  if (s.step === 'handover' && a.type === 'handover' && s.resumed) return update({ phase: 'complete' });
  return s;
}
