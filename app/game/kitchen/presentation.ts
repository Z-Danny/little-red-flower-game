import { level } from './config';
import { controlled, type Run } from './model';
/** Default HUD never discloses goals or repeats action narration. */
export function riskClock(r: Run) {
  const seconds = controlled(r) ? 0 : Math.ceil((100 - r.risk) * level.riskSeconds / 100);
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
