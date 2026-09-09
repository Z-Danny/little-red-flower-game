'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getLevel, getPackage, levels } from '@/app/game/levels';
import { LevelHub } from './level-hub';
import { LevelPlayer } from './level-player';
import { TyphoonPlayer } from './typhoon/typhoon-player';
import { KitchenPlayer } from './kitchen/kitchen-player';
import { ConfiguredPlayer } from './configured/player';
import { SceneHuntPlayer } from './scene-hunt/player';
import { getHunt } from '@/app/game/scene-hunt/registry';
import { useLeaderboard } from './leaderboard/use-leaderboard';
import { LeaderboardPage } from './leaderboard/leaderboard-page';

const EMPTY_PROGRESS: Record<string, number> = {};

type ModelContext = {
  registerTool: (tool: {
    name: string; title: string; description: string; inputSchema: object;
    annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
    execute: (input: unknown) => unknown;
  }, options?: { signal?: AbortSignal }) => void | Promise<void>;
};

export function GameApp() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const board = useLeaderboard();
  const sessionPlayerId = useRef('');
  const completed = board.snapshot?.current.completed ?? EMPTY_PROGRESS;
  const active = activeId ? getLevel(activeId) : undefined;
  const totalFlowers = Object.values(completed).reduce((sum, value) => sum + value, 0);
  const playerId = board.snapshot?.current.id;
  const startLevel = useCallback((id: string) => {
    if (!playerId) return;
    sessionPlayerId.current = playerId;
    setActiveId(id);
    setShowLeaderboard(false);
  }, [playerId]);
  const recordResult = board.recordResult;
  const finishLevel = useCallback((levelId: string, stars: number) => {
    recordResult(levelId, stars, sessionPlayerId.current);
  }, [recordResult]);

  const resetProgress = () => {
    if (window.confirm(`要清空「${board.snapshot?.current.name}」的小红花和关卡记录吗？其他玩家不受影响。`)) board.resetProgress();
  };

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
          if (!playerId) throw new Error('玩家存档正在载入，请稍后重试');
          startLevel(levelId);
          return { status: 'opened', levelId };
        },
      }, { signal: lifecycle.signal });
      await context.registerTool({
        name: 'read_emergency_progress', title: '读取应急训练进度',
        description: '读取本机当前玩家已完成的关卡和获得的小红花总数。',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute() { return { completed, flowers: totalFlowers, totalLevels: levels.length }; },
      }, { signal: lifecycle.signal });
    };
    void register().catch(() => undefined);
    return () => lifecycle.abort();
  }, [completed, totalFlowers, playerId, startLevel]);

  if (!board.snapshot) return <main className="game-page"><section className="phone-stage game-loading" role="status"><p>{board.error || '正在打开小红花训练册…'}</p>{board.error && <button onClick={board.refresh}>重新读取存档</button>}</section></main>;
  const notice = board.error || board.snapshot.notice;

  if (active) {
    const saveNotice = notice ? <div className="game-save-notice" role="status">{notice}</div> : null;
    const hunt=getHunt(active.id);
    if(hunt) return <main className="game-page"><SceneHuntPlayer key={active.id} pack={hunt} onBack={()=>setActiveId(null)} onFinish={finishLevel}/>{saveNotice}</main>;
    if (active.engine === 'configured-v1') return <main className="game-page"><ConfiguredPlayer key={active.id} pack={getPackage(active.id)!} onBack={() => setActiveId(null)} onFinish={finishLevel} />{saveNotice}</main>;
    if (active.engine === 'kitchen-v1') return <main className="game-page"><KitchenPlayer totalFlowers={totalFlowers} onBack={() => setActiveId(null)} onFinish={finishLevel} />{saveNotice}</main>;
    if (active.engine === 'typhoon-v2') return <main className="game-page"><TyphoonPlayer totalFlowers={totalFlowers} onBack={() => setActiveId(null)} onFinish={finishLevel} onNext={() => setActiveId(null)} />{saveNotice}</main>;
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
            if (next) startLevel(next.id); else setActiveId(null);
          }}
        />
        {saveNotice}
      </main>
    );
  }

  if (showLeaderboard) return <main className="game-page"><LeaderboardPage board={board} onBack={() => setShowLeaderboard(false)} /></main>;
  return <main className="game-page"><LevelHub completed={completed} onStart={startLevel} onReset={resetProgress} onLeaderboard={() => setShowLeaderboard(true)} playerName={board.snapshot.current.name} />{notice && <div className="game-save-notice" role="status">{notice}</div>}</main>;
}
