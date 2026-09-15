'use client';
import { useEffect, useRef, useState } from 'react';

/** Start once only after the loaded scene has had a chance to paint. */
export function useLevelAutoStart(enabled: boolean, ready: boolean, begin: () => void, levelId: string) {
  const latest = useRef(begin);
  latest.current = begin;
  const started = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || !ready || started.current === levelId) return;
    let first = 0, second = 0, timer = 0;
    const cancel = () => { window.clearTimeout(timer); cancelAnimationFrame(first); cancelAnimationFrame(second); };
    const schedule = () => {
      cancel();
      if (document.hidden || started.current === levelId) return;
      const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220;
      timer = window.setTimeout(() => {
        first = requestAnimationFrame(() => {
          second = requestAnimationFrame(() => {
            if (document.hidden || started.current === levelId) return;
            started.current = levelId;
            latest.current();
          });
        });
      }, delay);
    };
    schedule();
    document.addEventListener('visibilitychange', schedule);
    return () => { cancel(); document.removeEventListener('visibilitychange', schedule); };
  }, [enabled, ready, levelId]);
}

/** Loading feedback is separate from the optional standalone level introduction. */
export function LevelLaunchStatus({ error, onRetry, onBack }: {
  error?: string;
  onRetry: () => void;
  onBack: () => void;
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 800);
    return () => window.clearTimeout(timer);
  }, []);
  return <div className="level-launch-status" data-load-state={error ? 'error' : 'loading'} data-visible={Boolean(error || slow)}>
    {(error || slow) && <>
    <p role="status">{error ? '场景暂时没有准备好，请重试。' : '正在准备场景…'}</p>
    <div className="level-launch-actions">
      {error && <button type="button" onClick={onRetry}>重新加载</button>}
      <button type="button" onClick={onBack}>返回地图</button>
    </div>
    </>}
  </div>;
}
