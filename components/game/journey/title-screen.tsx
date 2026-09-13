/* oxlint-disable next/no-img-element -- Artwork must embed in the standalone offline game. */
import { ArrowRight, Play, Trophy, Volume2, VolumeX } from 'lucide-react';
import type { CSSProperties } from 'react';
import home from '@/content/journey-home.json';
type Props = {
  playerName: string;
  flowers: number;
  canContinue: boolean;
  muted: boolean;
  onMute: () => void;
  onStart: () => void;
  onContinue: () => void;
  onLeaderboard: () => void;
  regionName?: string;
  busy: boolean;
  error: string;
};
export function TitleScreen({
  playerName,
  flowers,
  canContinue,
  muted,
  onMute,
  onStart,
  onContinue,
  onLeaderboard,
  regionName,
  busy,
  error,
}: Props) {
  const start = (
    <button
      key="start"
      className={canContinue ? 'title-secondary' : 'title-primary'}
      onClick={onStart}
      data-home-start
      disabled={busy}
    >
      <Play aria-hidden="true" />
      <span>{home.start}</span>
      <ArrowRight aria-hidden="true" />
    </button>
  );
  const resume = (
    <button
      key="continue"
      className={canContinue ? 'title-primary' : 'title-secondary'}
      onClick={onContinue}
      disabled={!canContinue || busy}
      data-home-continue
    >
      <span>{home.continue}</span>
      <ArrowRight aria-hidden="true" />
    </button>
  );
  return (
    <section
      className="title-screen"
      data-title-screen
      style={
        {
          '--home-ink': home.colors.ink,
          '--home-accent': home.colors.accent,
          '--home-paper': home.colors.paper,
        } as CSSProperties
      }
      aria-label="小红花应急行动首页"
    >
      <img
        className="title-art"
        src={home.image}
        alt=""
        fetchPriority="high"
        draggable={false}
      />
      <div className="title-wash" aria-hidden="true" />
      <div className="title-tools">
        <button
          onClick={onMute}
          aria-label={muted ? '打开奖励声音' : '关闭奖励声音'}
          title="结算与种花音效"
        >
          {muted ? <VolumeX /> : <Volume2 />}
        </button>
      </div>
      <header className="title-heading">
        <p className="title-kicker">一朵花，一份守护</p>
        <h1>
          <span>{home.title[0]}</span>
          <span>{home.title[1]}</span>
        </h1>
        <p className="title-tagline">{home.tagline}</p>
      </header>
      <div className="title-menu">
        {canContinue ? (
          <p className="title-progress">
            <span>{playerName}</span>
            <i aria-hidden="true" />
            <span>
              已收获 <strong data-home-flowers>{flowers}</strong> 朵小红花
            </span>
          </p>
        ) : (
          <p className="title-welcome">{home.emptyHint}</p>
        )}
        <div className="title-buttons">
          {canContinue ? [resume, start] : [start, resume]}
        </div>
        <p className="title-resume-hint">
          {canContinue ? (
            <>
              {home.continueHint}
              {regionName && <span> · {regionName}</span>}
            </>
          ) : (
            '完成关卡后，小红花会留在你的地图上'
          )}
        </p>
        {error && (
          <p className="title-error" role="alert">
            {error}
          </p>
        )}
        <button className="title-board" onClick={onLeaderboard} disabled={busy}>
          <Trophy aria-hidden="true" />
          本机排行榜
        </button>
      </div>
      <footer className="title-footer">{home.footer}</footer>
    </section>
  );
}
