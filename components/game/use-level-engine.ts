'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { completedGoalIds, decideObjective } from '@/app/game/level-rules';
import type { Feedback, LevelConfig } from '@/app/game/types';

export function useLevelEngine(level: LevelConfig, onComplete: (stars: number) => void) {
  const [phase, setPhase] = useState<'briefing' | 'playing' | 'complete'>('briefing');
  const [resolved, setResolved] = useState<Set<string>>(() => new Set());
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [risk, setRisk] = useState(8);
  const [dangerMistakes, setDangerMistakes] = useState(0);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [hintId, setHintId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [consequenceShown, setConsequenceShown] = useState(false);
  const [consequenceActive, setConsequenceActive] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const actionTimer = useRef<number | null>(null);
  const hintTimer = useRef<number | null>(null);
  const consequenceTimer = useRef<number | null>(null);
  const shownRiskCues = useRef<Set<string>>(new Set());

  const completedGoals = useMemo(() => completedGoalIds(level, resolved), [level, resolved]);
  const report = useCallback((type: Feedback['type'], text: string) => {
    setFeedback({ type, text, nonce: Date.now() });
  }, []);

  useEffect(() => {
    if (phase !== 'playing') return;
    const timer = window.setInterval(() => {
      setElapsed((value) => value + 0.5);
      setRisk((value) => Math.min(100, value + 50 / level.riskSeconds));
    }, 500);
    return () => window.clearInterval(timer);
  }, [level.riskSeconds, phase]);

  useEffect(() => {
    if (risk < 100 || consequenceShown || phase !== 'playing') return;
    const timer = window.setTimeout(() => {
      setConsequenceShown(true);
      setConsequenceActive(true);
      setDangerMistakes((value) => value + 1);
      report('danger', '风险已达到峰值！后果动画已发生，但你仍可继续完成训练。');
      consequenceTimer.current = window.setTimeout(() => setConsequenceActive(false), 1900);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [consequenceShown, phase, report, risk]);

  useEffect(() => {
    if (phase !== 'playing') return;
    const objective = level.objectives?.find((item) =>
      item.riskCue && risk >= item.riskCue.threshold && !resolved.has(item.id) && !shownRiskCues.current.has(item.id));
    if (!objective?.riskCue) return;
    shownRiskCues.current.add(objective.id);
    const timer = window.setTimeout(() => report(objective.riskCue?.tone ?? 'neutral', objective.riskCue!.text), 0);
    return () => window.clearTimeout(timer);
  }, [level.objectives, phase, report, resolved, risk]);

  useEffect(() => {
    if (phase !== 'playing' || completedGoals.length !== level.goals.length) return;
    const stars = dangerMistakes === 0 && risk < 72 ? 3 : dangerMistakes <= 2 ? 2 : 1;
    const timer = window.setTimeout(() => {
      setPhase('complete');
      onComplete(stars);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [completedGoals.length, dangerMistakes, level.goals.length, onComplete, phase, risk]);

  const resolveObjective = useCallback((id: string) => {
    if (processingId) return;
    const decision = decideObjective(level, resolved, id);
    if (decision.status === 'blocked') return report('neutral', decision.message);
    if (decision.status !== 'ready') return;
    const duration = level.objectives?.find((objective) => objective.id === id)?.treatment?.durationMs ?? 850;
    setProcessingId(id);
    actionTimer.current = window.setTimeout(() => {
      setResolved((current) => new Set(current).add(id));
      setProcessingId(null);
      report('success', decision.message);
    }, duration);
  }, [level, processingId, report, resolved]);

  const reportMiss = useCallback(() => {
    report('neutral', '这里没有需要处理的隐患，再观察一下。');
  }, [report]);

  const applyDrop = useCallback((itemId: string, zoneId: string) => {
    const action = level.actions?.find((candidate) => candidate.itemId === itemId && candidate.zoneId === zoneId);
    setSelectedItem(null);
    if (!action) return report('neutral', '这个物品用在这里没有帮助，换个位置试试。');
    if (action.goalId && resolved.has(action.goalId)) return report('neutral', '这一步已经完成了。');
    const ready = (action.requires ?? []).every((requirement) => resolved.has(requirement));
    if (!ready) return report('neutral', action.blockedText ?? '还需要先完成前面的关键动作。');
    if (action.outcome === 'danger') {
      setDangerMistakes((value) => value + 1);
      setRisk((value) => Math.min(100, value + 14));
      return report('danger', action.feedback);
    }
    if (action.goalId) setResolved((current) => new Set(current).add(action.goalId!));
    report(action.outcome === 'correct' ? 'success' : 'neutral', action.feedback);
  }, [level.actions, report, resolved]);

  const requestHint = useCallback((targetId?: string) => {
    const requestedId = targetId && level.goals.includes(targetId) && !resolved.has(targetId)
      ? targetId
      : level.goals.find((goal) => !resolved.has(goal));
    if (!requestedId) return;
    const requested = level.objectives?.find((objective) => objective.id === requestedId);
    const prerequisiteId = requested?.requires?.find((requirement) => !resolved.has(requirement));
    const hintTarget = level.objectives?.find((objective) => objective.id === (prerequisiteId ?? requestedId));
    setHintId(hintTarget?.id ?? requestedId);
    report('neutral', level.kind === 'prevention'
      ? hintTarget?.hintText ?? '对照顶部剪影，留意场景中形状相同的物品。'
      : '试试高亮的操作物品。');
    if (hintTimer.current) window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setHintId(null), 2200);
  }, [level.goals, level.kind, level.objectives, report, resolved]);

  useEffect(() => () => {
    if (actionTimer.current) window.clearTimeout(actionTimer.current);
    if (hintTimer.current) window.clearTimeout(hintTimer.current);
    if (consequenceTimer.current) window.clearTimeout(consequenceTimer.current);
  }, []);

  const reset = useCallback(() => {
    if (actionTimer.current) window.clearTimeout(actionTimer.current);
    if (hintTimer.current) window.clearTimeout(hintTimer.current);
    if (consequenceTimer.current) window.clearTimeout(consequenceTimer.current);
    shownRiskCues.current.clear();
    setPhase('briefing'); setResolved(new Set()); setFeedback(null); setRisk(8); setDangerMistakes(0);
    setSelectedItem(null); setHintId(null); setElapsed(0); setConsequenceShown(false); setConsequenceActive(false); setProcessingId(null);
  }, []);

  return {
    phase, setPhase, resolved, feedback, risk, dangerMistakes, selectedItem, setSelectedItem,
    hintId, elapsed, completedGoals, processingId, consequenceActive, resolveObjective, reportMiss, applyDrop, requestHint, reset,
  };
}
