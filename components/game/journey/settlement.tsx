'use client';
import { rewardRuleLabel, rewardSecondsLabel, type TimeReward } from '@/app/game/journey/time-reward';
import { useRef } from 'react';
import { Flower } from './flower';
import { GardenDialog } from './dialog';
import type { LevelConfig } from '@/app/game/types';
import type { CompletionReceipt } from '@/app/game/leaderboard/model';
import { journeyTiming } from '@/app/game/journey/presentation';
import { lessonFor } from '@/app/game/journey/knowledge';

export function Settlement({
  level,
  receipt,
  result,
  persistence,
  onMap,
  onRetry,
  error,
  practice,
}: {
  level: Pick<LevelConfig, 'id' | 'title'>;
  /** Reuse the same artwork for isolated practices without pretending to save rewards. */
  practice?: { title: string; summary: string; status?: string; onReplay: () => void };
  receipt: CompletionReceipt | undefined;
  result?: TimeReward;
  persistence?: 'saved' | 'session';
  onMap: () => void;
  onRetry: () => void;
  error: string;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const lesson = practice ? { message: practice.summary, points: [], sources: [] } : lessonFor(level.id);
  const replay = receipt?.reward === 0;
  const awarded = !!receipt && receipt.reward > 0;
  const saveFailed = !!error && !receipt;

  return (
    <GardenDialog
      title={`${level.title}完成结算`}
      onClose={() => {
        if (receipt || practice) onMap();
      }}
      settlement
      className="painted-settlement"
      initialFocus={titleRef}
    >
      <section
        className="painted-settlement-card"
        data-level-id={level.id}
        data-replay={replay}
        data-awarded={awarded} data-practice={Boolean(practice)}
        data-rating={result?.flowers}
        data-score-ms={result?.elapsedMs}
      >
        <header className="painted-settlement-header">
          <img
            src="/ui/painted-settlement-v1/header.webp"
            alt=""
            aria-hidden="true"
            draggable={false}
          />
          <h2 ref={titleRef} tabIndex={-1} data-testid="settlement-title">
            {practice ? practice.title : '还得是你！'}
          </h2>
        </header>
        <div className="painted-settlement-body">
          <div className="painted-settlement-inner">
            <h3
              className="painted-settlement-level"
              data-testid="settlement-level"
            >
              {level.title}
            </h3>
            <p className="painted-settlement-message">{practice?.summary ?? lesson.message}</p>
            <div className="painted-settlement-reward" aria-hidden="true">
              {Array.from({ length: result?.flowers ?? receipt?.score ?? 0 }, (_, i) => (
                <Flower
                  key={i}
                  className={`settlement-flower-${i}`}
                  style={{
                    animationDelay: `${i * journeyTiming.rewardStep}ms`,
                  }}
                />
              ))}
              {awarded && (
                <img
                  className="painted-settlement-petal"
                  src="/ui/painted-v1/petal.webp"
                  alt=""
                  draggable={false}
                />
              )}
            </div>
            <strong
              className="painted-settlement-reward-label"
              data-testid="settlement-reward"
              role="status"
            >
              {practice ? '演练完成 · 不写入正式成绩' : saveFailed
                ? '记录尚未保存'
                : !receipt
                  ? '正在保存…'
                  : replay
                    ? `本次${result?.flowers ?? receipt.score}朵 · 最佳${receipt.best}朵（不重复发放）`
                    : `+${receipt.reward} 朵小红花${receipt.before[level.id] ? ' · 已补发进步奖励' : ''}`}
            </strong>
            {receipt && <p className="settlement-save-status" data-testid="settlement-save-status" data-persistence={persistence} role="status">{persistence === 'saved' ? '进度已保存 · 下次可继续游戏' : '仅暂存于当前页面，关闭可能丢失。请返回首页，在“存档管理”中导出备份。'}</p>}
            {result && <div className="settlement-time-rating" data-testid="settlement-time-rating">
              <strong>评分用时 {rewardSecondsLabel(result.elapsedMs)} 秒 · 本次 {result.flowers} 朵</strong>
              <span>{rewardRuleLabel(result.referenceSeconds)}</span>
              <small>含误操作扣时；暂停、结局演出不计时。每关保留最佳成绩，重玩仅补差额。</small>
            </div>}
            {practice ? <><p className="painted-settlement-message">{practice.status}</p><button className="garden-secondary" onClick={onMap}>返回关卡</button></> : <section
              className="painted-settlement-knowledge"
              data-testid="settlement-knowledge"
              aria-labelledby="settlement-knowledge-title"
            >
              <h3 id="settlement-knowledge-title">这招，记住了</h3>
              <ol>
                {lesson.points.map((point, i) => (
                  <li key={point.title} data-testid="settlement-point">
                    <span
                      className="painted-settlement-number"
                      aria-hidden="true"
                    >
                      {i + 1}
                    </span>
                    <div>
                      <strong>{point.title}</strong>
                      <span className="painted-settlement-explanation">
                        {point.body}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="painted-settlement-sources">
                <span>科普参考：</span>
                {lesson.sources.map((source) => (
                  <a
                    key={source.url}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {source.publisher}
                    <span className="garden-sr-only">（新窗口打开）</span>
                  </a>
                ))}
              </div>
            </section>}
            {saveFailed && (
              <p className="painted-settlement-error" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
        <div className="painted-settlement-footer">
          <img
            src="/ui/painted-settlement-v1/footer.webp"
            alt=""
            aria-hidden="true"
            draggable={false}
          />
          <button
            type="button"
            className="painted-settlement-primary"
            data-testid="settlement-primary"
            data-ui-sound="approved-button"
            disabled={!practice && !receipt && !saveFailed}
            onClick={practice ? practice.onReplay : saveFailed ? onRetry : onMap}
          >
            {practice ? '再练一次' : saveFailed
              ? '重试保存'
              : !receipt
                ? '正在保存…'
                : replay
                  ? '回到地图'
                  : '种下小红花'}
          </button>
        </div>
      </section>
    </GardenDialog>
  );
}
