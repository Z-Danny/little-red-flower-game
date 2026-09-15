'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GardenDialog } from './journey/dialog';

type FailureProps = {
  levelId: string;
  levelTitle: string;
  kind: 'timeout' | 'unsafe-action';
  reason: string;
  hint: string;
  progress: string;
  missed?: { count: number; unit: '处' | '件' };
  journey?: boolean;
  onRetry: () => void;
  onBack: () => void;
};

/** Presents an existing terminal failure; never decides whether a run failed. */
export function PaintedFailure({
  levelId,
  levelTitle,
  kind,
  reason,
  hint,
  progress,
  missed,
  journey = false,
  onRetry,
  onBack,
}: FailureProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const callbacks = useRef({ onRetry, onBack });
  callbacks.current = { onRetry, onBack };
  const locked = useRef(false);
  const pending = useRef<'retry' | 'back' | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [leaving, setLeaving] = useState<'retry' | 'back' | null>(null);
  const finish = useCallback(() => {
    const action = pending.current;
    if (!action) return;
    pending.current = null;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    callbacks.current[action === 'retry' ? 'onRetry' : 'onBack']();
  }, []);
  const leave = (action: 'retry' | 'back') => {
    // A synchronous lock covers double taps before React disables both buttons.
    if (locked.current) return;
    locked.current = true;
    pending.current = action;
    setLeaving(action);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finish();
      return;
    }
    // The engine stays failed until the card has left. The fallback also covers
    // an interrupted/disabled animation; unmounting cancels it below.
    timer.current = setTimeout(finish, 240);
  };
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => { if (media.matches) finish(); };
    media.addEventListener('change', changed);
    return () => {
      media.removeEventListener('change', changed);
      if (timer.current !== null) clearTimeout(timer.current);
      pending.current = null;
    };
  }, [finish]);
  const count = missed ? Math.max(0, Math.floor(missed.count)) : 0;
  const roast = kind === 'unsafe-action'
    ? ['这操作，', '小红花都看愣了。']
    : count > 0
      ? missed?.unit === '件'
        ? [`还剩 ${count} 件，`, '这就收工了？']
        : [`漏了 ${count} 处，`, '还想领花？']
      : ['时间可不等人，', '这局先交卷！'];
  return (
    <GardenDialog
      title={`${levelTitle}挑战失败`}
      settlement
      className="painted-failure"
      initialFocus={titleRef}
      onClose={() => {}}
    >
      <section
        className="painted-failure-card"
        data-level-id={levelId}
        data-failure-kind={kind}
        data-motion={leaving ? 'leaving' : 'ready'}
        data-exit-action={leaving ?? undefined}
        aria-busy={Boolean(leaving)}
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget && event.animationName === 'failure-card-out') finish();
        }}
      >
        <header className="painted-failure-header">
          <img
            src="/ui/painted-failure-v2/header.webp"
            alt=""
            aria-hidden="true"
            draggable={false}
          />
          <img
            className="painted-failure-mascot"
            src="/ui/painted-failure-v2/mascot.webp"
            alt=""
            aria-hidden="true"
            draggable={false}
          />
          <h2 ref={titleRef} tabIndex={-1} data-testid="failure-title">
            怎么回事！
          </h2>
        </header>
        <div className="painted-failure-body">
          <div className="painted-failure-inner">
            <h3 className="painted-failure-level" data-testid="failure-level">
              {levelTitle}
            </h3>
            <p className="painted-failure-roast" data-testid="failure-roast">
              {roast.map((line) => <span key={line}>{line}</span>)}
            </p>
            <div className="painted-failure-review">
              <div className="painted-failure-review-heading">
                <strong>
                  {kind === 'timeout' ? '时间到！' : '这步踩雷了！'}
                </strong>
                <span data-testid="failure-progress">{progress}</span>
              </div>
              <p
                className="painted-failure-reason"
                data-testid="failure-reason"
              >
                {reason}
              </p>
              <p className="painted-failure-hint" data-testid="failure-hint">
                {hint}
              </p>
            </div>
            <p
              className="painted-failure-no-reward"
              data-testid="failure-no-reward"
            >
              本局小红花：<strong>0</strong> 朵
            </p>
            <div className="painted-failure-actions">
              <button
                type="button"
                className="painted-failure-retry"
                data-testid="failure-retry"
                data-ui-sound="approved-button"
                disabled={Boolean(leaving)}
                onClick={() => leave('retry')}
              >
                <span>不服，再来！</span>
              </button>
              <button
                type="button"
                className="painted-failure-back"
                data-testid="failure-back"
                data-ui-sound="approved-button"
                disabled={Boolean(leaving)}
                onClick={() => leave('back')}
              >
                <span>{journey ? '返回地图' : '返回关卡'}</span>
              </button>
            </div>
          </div>
        </div>
        <div className="painted-failure-footer">
          <img
            src="/ui/painted-failure-v2/footer.webp"
            alt=""
            aria-hidden="true"
            draggable={false}
          />
        </div>
      </section>
    </GardenDialog>
  );
}
