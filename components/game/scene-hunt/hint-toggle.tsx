import type { useHintDisclosure } from './use-hint-disclosure';
import { PaintedIcon } from '../painted-ui';

/** Shared by circle, street and collection players; never changes the scene camera. */
export function HintToggle({ disclosure, disabled = false }: { disclosure: ReturnType<typeof useHintDisclosure>; disabled?: boolean }) {
  return <button data-ui-sound="hint" className="hunt-hint-toggle painted-hud-button" aria-label="物件剪影提示" title="展开或收起物件剪影" {...disclosure.buttonProps} disabled={disabled}>
    <PaintedIcon name="hint" />
  </button>;
}
