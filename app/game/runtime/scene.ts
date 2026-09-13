import { enabled, hasAll, matches } from './engine';
import type { Box, LevelPackage, Point, Pose, Run } from './schema';
import { configuredPressure } from './response';
import { actorMotion } from '../response/pressure';
import { presentationActors } from './presentation';
import { createCoverCamera, clientToScene } from '../display/camera';

export type ScenePose = Pose & { id: string };
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const ease = (p: number) => p * p * (3 - 2 * p);
export function interpolate(a: Pose, b: Pose, p: number): Pose {
  const output: Pose = { ...a, asset: p >= 1 ? b.asset : a.asset, depth: b.depth };
  for (const key of ['x','y','w','h','rotation','opacity'] as const) output[key] = lerp(a[key] ?? (key === 'opacity' ? 1 : 0), b[key] ?? (key === 'opacity' ? 1 : 0), p);
  return output;
}
export function scenePoses(pack: LevelPackage, run: Run, reduced = false): ScenePose[] {
  const poses: Record<string, Pose> = Object.fromEntries(Object.entries(pack.skin.poses).map(([id, pose]) => [id, { ...pose }]));
  for (const state of pack.skin.states) if (matches(pack, run, state.when)) poses[state.object] = { ...poses[state.object], ...state.pose };
  // A staged input object is not a second visible copy of the same character.
  for (const object of pack.rules.objects) if (!hasAll(run.stages ?? [], object.stages)) {
    poses[object.id] = { ...poses[object.id], opacity: 0, blockInput: false };
  }
  for (const effect of pack.skin.effects) {
    if (hasAll(run.resolved, effect.until)) continue;
    const p = poses[effect.object];
    if (effect.kind === 'wobble' && !reduced && run.risk >= pack.rules.risk.warningAt) p.rotation = (p.rotation ?? 0) + Math.sin(run.elapsed / 95) * .035;
    if (effect.kind === 'fire') {
      const scale = (pack.skin.response ? configuredPressure(pack, run).flame : 1 + run.risk / 220 + run.boost) + (!reduced ? Math.sin(run.elapsed / 90) * .045 : 0);
      p.x -= p.w * (scale - 1) / 2; p.y -= p.h * (scale - 1); p.w *= scale; p.h *= scale;
    }
  }
  const terminalRule = run.failure?.rule ?? (run.escaped ? run.escapeRule : undefined);
  const terminal = terminalRule && pack.rules.interactions.find(rule => rule.id === terminalRule);
  const terminalDuration = terminal ? pack.skin.animations[terminal.animation].durationMs : 0;
  const action = run.action ?? (terminal ? { rule: terminal.id, source: terminal.source,
    age: run.failure?.age ?? terminalDuration, duration: run.failure?.duration ?? terminalDuration, point: undefined } : null);
  if (action) {
    const rule = pack.rules.interactions.find(r => r.id === action.rule);
    const motion = rule && pack.skin.animations[rule.animation], time = Math.min(1, action.age / action.duration);
    if (motion) {
      for (const track of motion.tracks) {
        const home = { ...poses[track.object] };
        let previous = { ...home }, previousAt = 0;
        if (track.fromDrop && action.point && track.object === action.source) previous = { ...previous, x: action.point.x - previous.w / 2, y: action.point.y - previous.h / 2 };
        for (const frame of track.keyframes) {
          const { at, restoreHome, ...patch } = frame, next = { ...(restoreHome ? home : previous), ...patch };
          if (time <= at) { poses[track.object] = interpolate(previous, next, ease((time - previousAt) / (at - previousAt))); break; }
          previous = next; previousAt = at;
        }
      }
    } else {
      const home = poses[action.source];
      if (home) {
        const from = action.point ? { ...home, x: action.point.x - home.w / 2, y: action.point.y - home.h / 2 } : home;
        poses[action.source] = { ...interpolate(from, home, ease(time)), rotation: (home.rotation ?? 0) + (reduced ? 0 : Math.sin(time * Math.PI * 4) * .07) };
      }
    }
  }
  const response = pack.skin.response;
  if (response && !action && run.phase === 'playing') {
    const actor = poses[response.actor], pose = actorMotion(actor, run.elapsed, configuredPressure(pack, run).fear, reduced);
    poses[response.actor] = { ...actor, ...pose.box, rotation: (actor.rotation ?? 0) + pose.angle, pivot: { x: .5, y: 1 } };
  }
  // A fatal reveal owns its full authored pose; idle micro-motion must not distort it.
  if (run.phase !== 'failed') presentationActors(pack, run, poses, reduced);
  return Object.entries(poses).map(([id, pose]) => ({ ...pose, id })).sort((a, b) => a.depth - b.depth);
}
export const contains = (box: Box, point: Point) => point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h;
export function localPoint(pose: Pose, point: Point): Point {
  const pivot = pose.pivot ?? { x: .5, y: .5 }, dx = point.x - pose.x - pose.w * pivot.x, dy = point.y - pose.y - pose.h * pivot.y;
  const c = Math.cos(pose.rotation ?? 0), s = Math.sin(pose.rotation ?? 0);
  return { x: (c * dx + s * dy) / pose.w + pivot.x, y: (-s * dx + c * dy) / pose.h + pivot.y };
}
export function pickObject(pack: LevelPackage, run: Run, point: Point, alpha: (asset: string, point: Point) => boolean, reduced = false, includeDisabled = false) {
  for (const pose of scenePoses(pack, run, reduced).reverse()) {
    if ((pose.opacity ?? 1) <= .05) continue;
    const local = localPoint(pose, point);
    if (local.x < 0 || local.y < 0 || local.x > 1 || local.y > 1 || !alpha(pose.asset, local)) continue;
    const object = pack.rules.objects.find(o => o.id === pose.id);
    if (object && (includeDisabled || enabled(object, run))) return object.id;
    if (pose.blockInput !== false) return null;
  }
  return null;
}
export function pickZone(pack: LevelPackage, point: Point, run?: Run) {
  return Object.entries(pack.skin.zones).find(([id, box]) => contains(box, point)
    && (!pack.skin.zoneConditions?.[id] || (run && matches(pack, run, pack.skin.zoneConditions[id]))))?.[0];
}
/** One cover transform shared by painting, alpha picking and drag/drop. */
export function cameraFor(pack: LevelPackage, width: number, height: number, screenObstacles: Box[] = []) {
  if (pack.rules.kind === 'response') {
    return createCoverCamera(pack.skin.framing ?? { sceneBounds: { x: 0, y: 0, w: pack.skin.world.width, h: pack.skin.world.height } }, width, height, {}, screenObstacles);
  }
  const scale = width > 0 && height > 0 ? Math.min(width / pack.skin.world.width, height / pack.skin.world.height) : 1;
  return { scale, x: (width - pack.skin.world.width * scale) / 2, y: (height - pack.skin.world.height * scale) / 2 };
}
export function toWorld(pack: LevelPackage, point: Point, rect: { left: number; top: number; width: number; height: number }, screenObstacles: Box[] = []) {
  const camera = cameraFor(pack, rect.width, rect.height, screenObstacles);
  return clientToScene(camera, point, rect);
}
