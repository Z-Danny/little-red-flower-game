import { hasAll, matches } from './engine';
import type { Box, LevelPackage, Pose, Run, Skin } from './schema';

export type PresentationSpec = NonNullable<Skin['presentation']>;
export type PresentationEffect = PresentationSpec['effects'][number];
export type EffectFrame = PresentationEffect & {
  intensity: number; time: number; reduced: boolean; inward: -1 | 1; danger: number;
};
/** Goal state changes only after an action; the scene asset can change mid-action. */
export function presentationSceneMatches(effect: PresentationEffect, poses: readonly (Pose & { id: string })[]) {
  if (!effect.whenScene) return true;
  const scene = poses.find(pose => pose.id === effect.whenScene!.object);
  return !!scene && scene.asset === effect.whenScene.asset && (scene.opacity ?? 1) > .0001;
}
export const unit = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
/** A visual curve, never a survival deadline, target counter, or physiology value. */
export function presentationPressure(pack: LevelPackage, run: Run) {
  const spec = pack.skin.presentation;
  if (!spec) return 0;
  // Stable ordinary lift failure must never simulate accelerating catastrophe.
  const stable = spec.audio?.theme === 'lift';
  return stable ? .12 : unit(run.elapsed / spec.durationMs);
}
export function presentationFrame(pack: LevelPackage, run: Run, reduced = false): EffectFrame[] {
  const spec = pack.skin.presentation; if (!spec) return [];
  const pressure = presentationPressure(pack, run);
  const wrong = run.action && pack.rules.interactions.find(rule => rule.id === run.action?.rule)?.outcome === 'danger';
  const danger = wrong && run.action ? Math.sin(Math.PI * unit(run.action.age / run.action.duration)) : 0;
  return spec.effects.filter(effect => !effect.when || matches(pack, run, effect.when)).map(effect => {
    const strength = effect.strength ?? 1;
    const reductions = (effect.reductions ?? []).filter(reduction => matches(pack, run, reduction.when));
    // After a correct mitigation, the corrected base cannot creep back up with
    // elapsed time. Sequential measures multiply; factor=0 stays truly off.
    const factor = reductions.reduce((value, reduction) => value * reduction.factor, 1);
    const base = reductions.length ? .3 : .3 + pressure * .7;
    const intensity = Math.min(2, strength * factor * (base + (reductions.length ? 0 : danger * .3)));
    return { ...effect, intensity, time: run.elapsed, reduced, danger,
      inward: effect.box.x + effect.box.w / 2 >= pack.skin.world.width / 2 ? -1 as const : 1 as const };
  }).sort((a, b) => a.depth - b.depth);
}
/** Whole-body micro-motion with fixed width, bottom and center: no sliding feet. */
export function practiceActorPose(home: Pose, elapsed: number, amplitude: number, reduced = false, danger = 0): Pose {
  if (reduced || amplitude <= 0) return { ...home };
  const amount = unit(amplitude);
  const stretch = Math.sin(elapsed / 330) * .006 * amount + danger * .004 * amount;
  const height = home.h * (1 + stretch);
  return { ...home, y: home.y + home.h - height, h: height };
}
export function presentationActors(pack: LevelPackage, run: Run, poses: Record<string, Pose>, reduced = false) {
  const action = run.action, wrong = action && pack.rules.interactions.find(rule => rule.id === action.rule)?.outcome === 'danger';
  const danger = wrong && action ? Math.sin(Math.PI * unit(action.age / action.duration)) : 0;
  for (const actor of pack.skin.presentation?.actors ?? []) {
    if (actor.until?.length && hasAll(run.resolved, actor.until)) continue;
    if (action && pack.skin.animations[pack.rules.interactions.find(rule => rule.id === action.rule)?.animation ?? '']?.tracks.some(track => track.object === actor.object)) continue;
    const home=poses[actor.object]; if(!home)continue;
    if(actor.performance){
      const perf=actor.performance,cough=perf.cough;
      let next={...home};
      const cycle=perf.cycle;
      if(cycle && !reduced && run.phase==='playing' && cycle.frames.includes(home.asset)
        && (!cycle.when || matches(pack,run,cycle.when))) {
        // Reuse the authored canvas bounds, foot pivot and picking geometry.
        // A state/action outside this frame family must never summon a prop back.
        const index=Math.floor(Math.max(0,run.elapsed)/cycle.periodMs*cycle.frames.length)%cycle.frames.length;
        next.asset=cycle.frames[index];
      }
      const coughing=run.phase==='playing' && cough && !hasAll(run.resolved,cough.until) && run.elapsed>=cough.everyMs && run.elapsed%cough.everyMs<cough.durationMs;
      if(coughing)next={...next,asset:cough.asset,x:home.x+(home.w-cough.w)/2,y:home.y+home.h-cough.h,w:cough.w,h:cough.h};
      if(!reduced && run.phase!=='failed') {
        // Foot-anchored lean, not anisotropic image stretching. The shared pose
        // is used for rendering AND inverse alpha picking.
        const pressure=presentationPressure(pack,run);
        const wobble=Math.sin(run.elapsed/perf.periodMs*Math.PI*2);
        next.rotation=(home.rotation??0)+wobble*perf.lean*(run.phase==='playing'?.55+pressure*.45:.25)+(coughing?Math.sin(run.elapsed/65)*.018:0);
        next.pivot={x:.5,y:1};
      }
      poses[actor.object]=next;
    }else poses[actor.object] = practiceActorPose(home, run.elapsed, actor.amplitude, reduced, danger);
  }
}
export const effectBox = (effect: EffectFrame): Box => ({ ...effect.box });
