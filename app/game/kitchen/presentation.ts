import { level } from './config';
import { type Run } from './model';
/** Gameplay elapsed time is the sole clock; hazard rewards cannot refill it. */
export function countdown(r: Run) {
  const remaining = Math.max(0, level.riskSeconds - r.elapsed / 1000);
  return { seconds: Math.ceil(remaining), ratio: remaining / level.riskSeconds, expired: remaining === 0 };
}
/** Default HUD never discloses goals or repeats action narration. */
export function riskClock(r: Run) {
  const seconds = countdown(r).seconds;
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
export function briefFeedback(r: Run): string | null {
  if (r.notice.tone === 'danger') {
    if (/不能泼水/.test(r.notice.text)) return '油锅起火不能泼水';
    if (/化纤抹布/.test(r.notice.text)) return '这块抹布不能盖严锅口';
    return '火势危险，现实中请立即撤离';
  }
  if (/喷射偏移/.test(r.notice.text)) return '请对准火焰根部';
  if (/训练目标尚未/.test(r.notice.text)) return '火源尚未受控';
  return null;
}
import thermometer from '@/content/response/kitchen-thermometer.json';

/** The pictorial gauge represents urgency, not elapsed time or real Celsius. */
export function thermometerState(heat:number,safe:boolean){
 const ratio=safe?0:Math.max(0,Math.min(1,Number.isFinite(heat)?heat:0));
 const tone=safe?'safe':ratio>=thermometer.critical?'critical':ratio>=thermometer.warning?'warning':'steady';
 const label=safe?'火势已受控':tone==='critical'?'十分紧急':tone==='warning'?'危险正在增加':'需要及时处置';
 return{ratio,tone,label} as const;
}
