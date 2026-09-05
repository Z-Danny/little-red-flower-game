'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getLevel, levels } from '@/app/game/levels';
import { LevelHub } from './level-hub';
import { LevelPlayer } from './level-player';
import { TyphoonPlayer } from './typhoon/typhoon-player';
import { KitchenPlayer } from './kitchen/kitchen-player';

const STORAGE_KEY = 'little-red-flower-emergency-progress-v1';

type ModelContext = {
  registerTool: (tool: {
    name: string; title: string; description: string; inputSchema: object;
    annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
    execute: (input: unknown) => unknown;
  }, options?: { signal?: AbortSignal }) => void | Promise<void>;
};

export function GameApp() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [completed, setCompleted] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);
  const active = activeId ? getLevel(activeId) : undefined;
  const totalFlowers = useMemo(() => Object.values(completed).reduce((sum, value) => sum + value, 0), [completed]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) setCompleted(JSON.parse(saved) as Record<string, number>);
      } catch { /* A private browser session can still play without persistence. */ }
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(completed)); } catch { /* Non-critical. */ }
  }, [completed, loaded]);

  const finishLevel = useCallback((levelId: string, stars: number) => {
    setCompleted((current) => ({ ...current, [levelId]: Math.max(current[levelId] ?? 0, stars) }));
  }, []);

  const resetProgress = useCallback(() => {
    if (window.confirm('要清空所有小红花和关卡记录吗？')) setCompleted({});
  }, []);

  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = async () => {
      await context.registerTool({
        name: 'start_emergency_level', title: '开始应急训练关卡',
        description: '按关卡 ID 打开一个可交互的应急训练关卡。',
        inputSchema: { type: 'object', properties: { levelId: { type: 'string', enum: levels.filter((level) => level.playable).map((level) => level.id) } }, required: ['levelId'], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute(input) {
          const levelId = typeof input === 'object' && input !== null && 'levelId' in input ? String((input as { levelId: unknown }).levelId) : '';
          if (!getLevel(levelId)?.playable) throw new Error('该关卡尚未开放');
          setActiveId(levelId);
          return { status: 'opened', levelId };
        },
      }, { signal: lifecycle.signal });
      await context.registerTool({
        name: 'read_emergency_progress', title: '读取应急训练进度',
        description: '读取设备上已完成的关卡和获得的小红花总数。',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute() { return { completed, flowers: totalFlowers, totalLevels: levels.length }; },
      }, { signal: lifecycle.signal });
    };
    void register().catch(() => undefined);
    return () => lifecycle.abort();
  }, [completed, totalFlowers]);

  if (active) {
    if (active.id === 'oil-fire') return <main className="game-page"><KitchenPlayer totalFlowers={totalFlowers} onBack={() => setActiveId(null)} onFinish={finishLevel} /></main>;
    if (active.id === 'typhoon-home') return <main className="game-page"><TyphoonPlayer totalFlowers={totalFlowers} onBack={() => setActiveId(null)} onFinish={finishLevel} onNext={() => setActiveId(null)} /></main>;
    return (
      <main className="game-page">
        <LevelPlayer
          key={active.id}
          level={active}
          totalFlowers={totalFlowers}
          onBack={() => setActiveId(null)}
          onFinish={finishLevel}
          onNext={() => {
            const next = levels.find((level) => level.order > active.order && level.playable);
            setActiveId(next?.id ?? null);
          }}
        />
      </main>
    );
  }

  return <main className="game-page"><LevelHub completed={completed} onStart={setActiveId} onReset={resetProgress} /></main>;
}
