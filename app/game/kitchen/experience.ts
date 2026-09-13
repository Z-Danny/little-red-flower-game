import { controlled, type Run } from './model';
import { responsePressure } from '../response/pressure';
import experience from '@/content/response/kitchen-experience.json';
export const kitchenTempo = (intensity: number) => experience.timing.musicRate[0] + (experience.timing.musicRate[1] - experience.timing.musicRate[0]) * Math.max(0, Math.min(1, intensity));
/** The adapter is the only place the reusable presentation knows kitchen flags. */
export const kitchenPressure = (r: Run) => responsePressure({ risk: r.risk / 100, impulse: r.boost, suppression: r.suppression, sealed: r.covered, sourceOff: r.gasOff, resolved: controlled(r), settleMs: r.settlingAge });
