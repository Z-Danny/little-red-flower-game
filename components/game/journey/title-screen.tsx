/* oxlint-disable next/no-img-element -- Artwork must embed in the standalone offline game. */
import { useEffect, useState, type CSSProperties } from 'react';
import home from '@/content/journey-home.json';

export const COVER_DEPARTURE_MS = 360;

type Props = {
  canContinue: boolean;
  onStart: () => void;
  onContinue: () => void;
  busy: boolean;
  error: string;
  departing?: boolean;
};
export function TitleScreen({
  canContinue,
  onStart,
  onContinue,
  busy,
  error,
  departing = false,
}: Props) {
  const [paused, setPaused] = useState(false);
  const [artReady, setArtReady] = useState(false);
  useEffect(() => {
    let active = true;
    // Start every decorative layer together, from the bud, even on a cold load.
    const images = [home.image, ...Object.values(home.art)].map((src) => {
      const image = new Image();
      image.src = src;
      return image.decode();
    });
    void Promise.allSettled(images).then(() => {
      if (active) setArtReady(true);
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const updateVisibility = () => setPaused(document.hidden);
    updateVisibility();
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, []);
  const buttonArt = (primary: boolean) => (
    <>
      <img
        className="title-button-art"
        src={primary ? home.art.primary : home.art.secondary}
        data-cover-layer={primary ? 'button-primary' : 'button-secondary'}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      {primary && <span className="title-button-beacon" aria-hidden="true" />}
    </>
  );
  const start = (
    <button
      key="start"
      className={canContinue ? 'title-secondary' : 'title-primary'}
      onClick={onStart}
      data-home-start
      disabled={busy}
    >
      {buttonArt(!canContinue)}
      <span>{canContinue ? home.restart : home.start}</span>
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
      {buttonArt(canContinue)}
      <span>{home.continue}</span>
    </button>
  );
  return (
    <section
      className="title-screen"
      data-title-screen
      data-cover-paused={paused || !artReady}
      data-cover-ready={artReady}
      data-cover-departing={departing}
      style={
        {
          '--home-ink': home.colors.ink,
          '--home-accent': home.colors.accent,
          '--home-paper': home.colors.paper,
          '--cover-flower-art': `url("${home.art.flower}")`,
          '--cover-title-art': `url("${home.art.title}")`,
          '--cover-primary-art': `url("${home.art.primary}")`,
          '--cover-departure-ms': `${COVER_DEPARTURE_MS}ms`,
        } as CSSProperties
      }
      aria-label={`${home.title.join('')}首页`}
    >
      <div className="title-landscape" aria-hidden="true">
        <img
          className="title-art"
          data-cover-layer="background"
          src={home.image}
          alt=""
          fetchPriority="high"
          draggable={false}
        />
        <div className="title-lake-light">
          {[0, 1, 2, 3, 4, 5].map((glint) => <i key={glint} />)}
        </div>
      </div>
      <div className="title-wash" aria-hidden="true" />
      <div className="title-falling-leaves" data-cover-layer="falling-leaves" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((leaf) => (
          <span className="title-leaf-flight" data-depth={leaf % 3 === 0 ? 'near' : 'far'} key={leaf}>
            <span className="title-leaf-gust">
              <img src={home.art.leaf} alt="" width={192} height={192} draggable={false} />
            </span>
          </span>
        ))}
      </div>
      <header className="title-heading">
        <h1>
          <span className="title-accessible-name">{home.title.join('')}</span>
          <span className="title-logo-motion" aria-hidden="true">
            <span className="title-logo-stage">
              <img
                className="title-logo"
                data-cover-layer="title"
                src={home.art.title}
                width={1200}
                height={691}
                alt=""
                draggable={false}
              />
              <span className="title-logo-sheen" />
            </span>
          </span>
        </h1>
      </header>
      <div className="title-flower" data-cover-flower aria-hidden="true">
        {['bud', 'opening', 'half-open', 'bloom'].map((frame) => (
          <span
            key={frame}
            className={`title-flower-frame title-flower-${frame}`}
            data-cover-layer={frame}
          />
        ))}
        <div className="title-pollen">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((pollen) => <i key={pollen} />)}
        </div>
      </div>
      <div className="title-motes" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="title-menu">
        <div className="title-buttons">
          {canContinue ? [resume, start] : start}
        </div>
        {error && (
          <p className="title-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
