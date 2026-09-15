import { Medal, Trophy } from 'lucide-react';
import {
  flowerTotal,
  plantedTotal,
  type Progress,
} from '@/app/game/journey/progress';
import { Flower } from './flower';
import { GardenDialog } from './dialog';
import {
  journeyCategories,
  categoryProgress,
} from '@/app/game/journey/categories';
export function JourneyArchive({
  archive,
  setArchive,
  playerName,
  completed,
  onLeaderboard,
}: {
  archive: boolean;
  setArchive: (value: boolean) => void;
  playerName: string;
  completed: Progress;
  onLeaderboard: () => void;
}) {
  return (
    <>
      {archive && (
        <GardenDialog title="我的守护档案" onClose={() => setArchive(false)}>
          <small className="garden-overline">{playerName} 的安全旅程</small>
          <h2>小小的花，认真的守护</h2>
          <div className="garden-archive-count">
            <Flower />
            <strong>{flowerTotal(completed)}</strong>
            <span>
              累计小红花
              <br />
              已完成 {plantedTotal(completed)} 个关卡
            </span>
          </div>
          <div className="garden-medals">
            {journeyCategories.map((category) => {
              const progress = categoryProgress(category, completed);
              return (
                <div
                  key={category.id}
                  className={progress.earned ? 'earned' : ''}
                >
                  <Medal />
                  <strong>{category.name}</strong>
                  <small>
                    {progress.open
                      ? `${progress.completed} / ${progress.total} 处已守护`
                      : '待开放'}
                  </small>
                </div>
              );
            })}
          </div>
          <p className="garden-footnote">
            每关首次完成可获得 3 朵小红花，重玩不重复获得。
          </p>
          <button
            className="garden-secondary"
            aria-label="打开排行榜"
            onClick={() => {
              setArchive(false);
              onLeaderboard();
            }}
          >
            红人榜
            <Trophy />
          </button>
        </GardenDialog>
      )}
    </>
  );
}
