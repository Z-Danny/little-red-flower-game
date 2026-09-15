import { useSyncExternalStore } from 'react';

const reducedMotionQuery = '(prefers-reduced-motion: reduce)';
const subscribeMotion = (update: () => void) => {
  const preference = matchMedia(reducedMotionQuery);
  preference.addEventListener('change', update);
  return () => preference.removeEventListener('change', update);
};
const readMotion = () => matchMedia(reducedMotionQuery).matches;
const serverMotion = () => true;

/** Keep one-shot map celebrations in sync with changes to the system preference. */
export function useReducedMotion() {
  return useSyncExternalStore(subscribeMotion, readMotion, serverMotion);
}
