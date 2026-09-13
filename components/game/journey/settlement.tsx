'use client';
import { ArrowRight, Check, ShieldCheck } from 'lucide-react';
import { Flower } from './flower';
import { GardenDialog } from './dialog';
import type { LevelConfig } from '@/app/game/types';
import type { CompletionReceipt } from '@/app/game/leaderboard/model';
import { journeyTiming } from '@/app/game/journey/presentation';
import { lessonFor } from '@/app/game/journey/knowledge';
export function Settlement({
  level,
  receipt,
  onMap,
  onRetry,
  error,
}: {
  level: LevelConfig;
  receipt: CompletionReceipt | undefined;
  onMap: () => void;
  onRetry: () => void;
  error: string;
}) {
  const lesson = lessonFor(level.id),
    replay = receipt?.reward === 0;
  return (
    <GardenDialog
      title={`${level.title}完成结算`}
      onClose={() => {
        if (receipt) onMap();
      }}
      settlement
    >
      <small className="garden-overline">
        <ShieldCheck />
        {lesson.result ??
          (level.kind === 'prevention' ? '风险已识别' : '危机已解除')}
      </small>
      <h2>{level.title}</h2>
      <p className="garden-result-message">
        {replay
          ? '这一处安心，因为你的守护而延续。'
          : '你让地图上的一处，多了一份安心。'}
      </p>
      <div
        className={`garden-reward ${replay ? 'already-planted' : ''}`}
        aria-label={
          replay
            ? '本关花朵已种下'
            : receipt
              ? '本关获得3朵小红花'
              : '正在保存完成记录'
        }
      >
        {[0, 1, 2].map((i) => (
          <Flower
            key={i}
            className={`reward-${i}`}
            style={{ animationDelay: `${i * journeyTiming.rewardStep}ms` }}
          />
        ))}
      </div>
      <strong className="garden-reward-label">
        {!receipt ? '正在保存…' : replay ? '本关花朵已种下' : '+3 朵小红花'}
      </strong>
      <div className="garden-lesson">
        <small>
          <Check />
          记住这一件事
        </small>
        <p>{lesson.summary}</p>
        <a href={lesson.url} target="_blank" rel="noreferrer">
          依据：{lesson.publisher} ↗
        </a>
      </div>
      {error && !receipt ? (
        <>
          <p role="alert">{error}</p>
          <button className="garden-primary" onClick={onRetry}>
            重试保存
          </button>
        </>
      ) : (
        <button className="garden-primary" disabled={!receipt} onClick={onMap}>
          返回地图{!replay && <span>· 种下小红花</span>}
          <ArrowRight />
        </button>
      )}
      <small className="garden-footnote">
        {replay
          ? '再次训练不会重复累计奖励。'
          : level.kind === 'prevention'
            ? '背景展示规范处置后的效果示意。'
            : '本关完成的是应急训练，请遵循现实安全条件。'}
      </small>
    </GardenDialog>
  );
}
