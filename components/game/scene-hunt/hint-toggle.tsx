import type { useHintDisclosure } from './use-hint-disclosure';

/** Shared by circle, street and collection players; never changes the scene camera. */
export function HintToggle({ disclosure }: { disclosure: ReturnType<typeof useHintDisclosure> }) {
  return <button className="hunt-hint-toggle" aria-label="物件剪影提示" title="展开或收起物件剪影" {...disclosure.buttonProps}>
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 18h6M10 21h4M9 15c0-2-4-3-4-7a7 7 0 0 1 14 0c0 4-4 5-4 7z"/>
    </svg>
  </button>;
}
