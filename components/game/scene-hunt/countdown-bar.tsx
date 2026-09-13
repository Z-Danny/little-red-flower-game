import { countdownState } from '@/app/game/scene-hunt/tension';
export function CountdownBar({ elapsed, seconds, resolved, deadline = false, pending = false }: { elapsed: number; seconds: number; resolved: boolean; deadline?: boolean; pending?: boolean }) {
  const c = countdownState(elapsed, seconds);
  const value = resolved ? 0 : c.secondsLeft;
  const text = resolved ? '隐患已全部识别' : value ? `寻找时间还剩${value}秒` : pending ? '已及时找到最后一处，正在完成标记' : deadline ? '寻找时间已用完' : '风雨已达最强，仍可继续寻找';
  return <div className="hunt-countdown" data-stage={resolved ? 'resolved' : c.stage}>
    <div className="hunt-countdown-track" role="progressbar" aria-label="挑战剩余进度" aria-valuemin={0} aria-valuemax={seconds} aria-valuenow={value} aria-valuetext={text}>
      <span style={{ transform: `scaleX(${resolved ? 0 : c.remaining})`, backgroundColor: c.color }} />
    </div>
  </div>;
}
