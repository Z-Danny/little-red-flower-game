import { countdownState } from '@/app/game/scene-hunt/tension';
export function CountdownBar({ elapsed, seconds, resolved, deadline = false, pending = false, training = false }: { elapsed: number; seconds: number; resolved: boolean; deadline?: boolean; pending?: boolean; training?: boolean }) {
  const c = countdownState(elapsed, seconds);
  const value = resolved ? 0 : c.secondsLeft;
  const remaining = resolved ? 0 : c.remaining;
  // The image's inner rail spans 3.9–96.1%; the game clock remains the only timer.
  const boundary = 3.9 + 92.2 * remaining;
  const text = resolved ? (training ? '本次训练已完成' : '隐患已全部识别') : value ? `${training ? '训练' : '寻找'}时间还剩${value}秒` : pending ? '已及时找到最后一处，正在完成标记' : deadline ? '寻找时间已用完' : '训练计时已结束，仍可继续练习';
  return <div className="hunt-countdown painted-countdown" data-stage={resolved ? 'resolved' : c.stage} data-remaining={remaining}>
    <div className="hunt-countdown-track" role="progressbar" aria-label="挑战剩余进度" aria-valuemin={0} aria-valuemax={seconds} aria-valuenow={value} aria-valuetext={text}>
      <div className="painted-timer-rail" aria-hidden="true">
        <img className="painted-timer-empty" src="/ui/painted-v1/timer-empty.webp" alt="" draggable={false} />
        <div className="painted-timer-window" style={{ clipPath: `inset(0 ${100 - boundary}% 0 0)`, visibility: remaining > 0 ? 'visible' : 'hidden' }}>
          <div className="painted-timer-inset">
            <img className="painted-timer-gold" src="/ui/painted-v1/timer-full.webp" alt="" draggable={false} />
          </div>
        </div>
        <img className="painted-timer-pointer" src="/ui/painted-v1/petal.webp" alt="" draggable={false} style={{ left: `${boundary}%` }} />
      </div>
    </div>
  </div>;
}
