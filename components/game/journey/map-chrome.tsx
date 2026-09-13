/* oxlint-disable next/no-img-element -- Local thumbnails must work without an image server in the offline build. */
import {
  Check,
  HeartPulse,
  ShieldCheck,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  journeyCategories,
  mapsForCategory,
  categoryProgress,
  type JourneyCategory,
} from '@/app/game/journey/categories';
import { journeyCopy } from '@/app/game/journey/presentation';
import { Flower } from './flower';
import {
  nodeStatus,
  journeyTiming,
  type Region,
  type Progress,
  type Planting,
  type MapNode,
} from '@/app/game/journey/progress';
type Props = {
  region: Region;
  done: number;
  wallet: number;
  muted: boolean;
  onMute: () => void;
  onLeaderboard: () => void;
  onArchive: () => void;
  onHome: () => void;
  planting: Planting | null;
  age: number;
  current?: MapNode;
  focus: (id: string, smooth?: boolean, align?: number) => void;
  completed: Progress;
  onPendingCategory: (category: JourneyCategory) => void;
};
export function MapChrome({
  region,
  done,
  wallet,
  muted,
  onMute,
  onLeaderboard,
  onArchive,
  onHome,
  planting,
  age,
  focus,
  completed,
  onPendingCategory,
}: Props) {
  return (
    <>
      <header className="garden-header">
        <div className="garden-topline">
          <button
            className="garden-title-group garden-home-link"
            onClick={onHome}
            disabled={!!planting}
            aria-label="返回游戏首页"
          >
            <span>{journeyCopy.brand}</span>
            <h1>{region.short}</h1>
          </button>
          <div className="garden-top-actions">
            <button
              onClick={onMute}
              aria-label={muted ? '打开奖励声音' : '关闭奖励声音'}
            >
              {muted ? <VolumeX /> : <Volume2 />}
            </button>
            <button onClick={onLeaderboard} aria-label="打开排行榜">
              <Trophy />
            </button>
            <button
              className="garden-wallet"
              onClick={onArchive}
              aria-label={`累计${wallet}朵小红花，打开守护档案`}
            >
              <Flower />
              <strong data-wallet>{wallet}</strong>
            </button>
          </div>
        </div>
      </header>
      {planting && (
        <output className="garden-guide">
          {age < journeyTiming.bloom
            ? '把安心种在这里…'
            : age < journeyTiming.unlock
              ? '小红花开了'
              : done === region.nodes.length
                ? `${region.medal} · 区域已恢复`
                : '沿着花径，向上出发'}
        </output>
      )}
      <nav className="garden-tabs garden-footer" aria-label="选择分类">
        {journeyCategories.map((category) => {
          const r = mapsForCategory(category)[0];
          const { earned, open } = categoryProgress(category, completed);
          return (
            <button
              data-map-region={r?.id}
              data-category={category.id}
              data-region-complete={earned}
              key={category.id}
              aria-pressed={category.regionIds.includes(region.id)}
              aria-label={
                open
                  ? `${category.name}${earned ? '，已恢复' : ''}`
                  : `${category.name}，待开放`
              }
              disabled={!!planting}
              onClick={() => {
                if (!r || !open) {
                  onPendingCategory(category);
                  return;
                }
                focus(
                  (
                    r.nodes.find(
                      (n) => nodeStatus(n.id, completed) === 'available',
                    ) ?? r.nodes[0]
                  ).id,
                  false,
                  0.78,
                );
              }}
            >
              <span
                className={`garden-region-thumb ${open ? '' : 'garden-category-pending'}`}
              >
                {r ? (
                  <img src={r.image} alt="" />
                ) : category.icon === 'health' ? (
                  <HeartPulse />
                ) : (
                  <ShieldCheck />
                )}
                {earned && <Check />}
              </span>
              <span className="garden-tab-caption">{category.name}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
