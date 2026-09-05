import { actions, placement as p, powerVisuals, type ActionId, type AssetId, type Rect } from './config';
import type { Run } from './model';

export type SpritePose = Rect & { asset: AssetId; key: string; opacity: number; rotation: number; scaleX: number; shear: number; anchorX: number; anchorY: number; clipRight: number; hit?: ActionId | 'umbrella'; };
export const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
export const smooth = (t: number) => { const n = clamp01(t); return n * n * (3 - 2 * n); };
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const blend = (a: Rect, b: Rect, t: number): Rect => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), w: mix(a.w, b.w, t), h: mix(a.h, b.h, t) });
export function progress(run: Run, id: ActionId) {
  return run.resolved.includes(id) ? 1 : run.action?.id === id ? clamp01(run.action.elapsed / actions[id].duration) : 0;
}
const sprite = (key: string, asset: AssetId, rect: Rect, extra: Partial<SpritePose> = {}): SpritePose => ({ key, asset, ...rect, opacity: 1, rotation: 0, scaleX: 1, shear: 0, anchorX: .5, anchorY: 1, clipRight: 1, ...extra });

export function powerStatus(run: Run) {
  const connected = progress(run, 'plug') < powerVisuals.disconnectAt;
  return { connected, ...(connected ? powerVisuals.connected : powerVisuals.disconnected) };
}

/** Forward transform, also used to keep the cable connected to the moving plug. */
export function worldPoint(pose: SpritePose, x: number, y: number) {
  const dx = x - pose.w * pose.anchorX, dy = y - pose.h * pose.anchorY;
  const ax = dx * pose.scaleX, ay = dy + dx * pose.shear;
  const c = Math.cos(pose.rotation), s = Math.sin(pose.rotation);
  return { x: pose.x + pose.w * pose.anchorX + c * ax - s * ay, y: pose.y + pose.h * pose.anchorY + s * ax + c * ay };
}

function cableBetween(board: SpritePose, plug: SpritePose): Rect {
  const a = worldPoint(board, board.w * powerVisuals.boardCableAnchor.x, board.h * powerVisuals.boardCableAnchor.y);
  const b = worldPoint(plug, plug.w * powerVisuals.plugCableAnchor.x, plug.h * powerVisuals.plugCableAnchor.y);
  const w = (b.x - a.x) / (powerVisuals.cableEnd.x - powerVisuals.cableStart.x);
  const h = (a.y - b.y) / (powerVisuals.cableStart.y - powerVisuals.cableEnd.y);
  return { x: a.x - powerVisuals.cableStart.x * w, y: b.y - powerVisuals.cableEnd.y * h, w, h };
}

/** Fixed per-object choreography. Shared by live rendering, preview, and tests. */
export function sceneSprites(run: Run, clock = run.elapsed): SpritePose[] {
  const safe = run.phase === 'settling' || run.phase === 'complete';
  const calm = safe ? smooth(run.settleElapsed / 1500) : 0;
  const tPlant = progress(run, 'plant');
  const plantRect = blend(p.plant, p.plantSafe, smooth(tPlant));
  plantRect.y -= Math.sin(tPlant * Math.PI) * 105;
  const flowerWobble = !run.resolved.includes('plant') && run.risk >= 36 && !tPlant ? Math.sin(clock / 100) * (.018 + run.risk / 2200) : 0;
  const tRail = progress(run, 'rail');
  const railRect = blend(p.rail, p.railSafe, smooth(tRail));
  const tWindow = progress(run, 'window');
  const windowRect = blend(p.window, p.windowClosed, smooth(tWindow / .74));
  const tCushion = progress(run, 'cushion');
  const cushionRect = blend(p.cushion, p.cushionSafe, smooth(tCushion));
  cushionRect.y -= Math.sin(tCushion * Math.PI) * 25;
  const tPlug = progress(run, 'plug');
  const stow = smooth((tPlug - .6) / .4);
  const pull = smooth(tPlug / powerVisuals.disconnectAt);
  const pulledPlug = { ...p.plug, x: p.plug.x - pull * powerVisuals.withdrawalDistance, y: p.plug.y };
  const boardPose = sprite('powerstrip', 'powerstrip', blend(p.powerstrip, p.powerstripSafe, stow), { hit: 'plug' });
  const plugPose = sprite('plug', 'plug', blend(pulledPlug, p.plugSafe, stow), {
    hit: 'plug', rotation: stow * -.24,
    // Metal prongs are inside the socket initially and reveal progressively on withdrawal.
    clipRight: clamp01(powerVisuals.insertedVisibleWidth + pull * powerVisuals.withdrawalDistance / p.plug.w),
  });
  const tCabinet = progress(run, 'cabinet');
  const doorAngle = (1 - smooth(tCabinet / .73)) * .64;
  const latchClosed = tWindow >= .87;
  const poses = [
    sprite('rail', 'rail', railRect, { hit: 'rail', opacity: 1 - smooth((tRail - .6) / .4), rotation: !tRail && !safe ? Math.sin(clock / 180) * .018 : 0, anchorX: 1, anchorY: 0 }),
    sprite('window', 'window', windowRect, { hit: 'window', rotation: !tWindow && !safe ? Math.sin(clock / 70) * .0025 * (1 + run.risk / 50) : 0 }),
    sprite('latch', latchClosed ? 'latchClosed' : 'latchOpen', { x: windowRect.x + windowRect.w - 34, y: 287, w: latchClosed ? 10 : 25, h: 31 }, { hit: 'window', anchorX: 0, anchorY: .5, rotation: tWindow > .74 && !latchClosed ? smooth((tWindow - .74) / .13) * 1.1 : 0 }),
    sprite('plant', 'plant', plantRect, { hit: 'plant', rotation: flowerWobble + Math.sin(tPlant * Math.PI * 2) * .04 }),
    sprite('cabinet', 'cabinet', p.cabinet, { hit: 'cabinet', anchorX: 1, anchorY: 0, scaleX: Math.cos(doorAngle), shear: -Math.sin(doorAngle) * .26, rotation: !tCabinet && run.risk >= 82 ? Math.sin(clock / 70) * .009 : 0 }),
    sprite('strap', 'strap', p.strap, { opacity: smooth((tCabinet - .74) / .26) }),
    sprite('cable', 'cable', cableBetween(boardPose, plugPose)),
    boardPose,
    sprite('socket', 'socket', p.socket),
    plugPose,
    sprite('cushion', 'cushion', cushionRect, { hit: 'cushion', opacity: 1 - smooth((tCushion - .25) / .75), rotation: -.09 * (1 - tCushion) - Math.sin(tCushion * Math.PI) * .11 }),
    sprite('family-standing', 'familyStanding', { ...p.family, x: mix(p.family.x, 210, calm), y: mix(p.family.y, 447, calm) }, { opacity: 1 - smooth((calm - .55) / .35), rotation: safe ? Math.sin(calm * Math.PI * 5) * .012 : Math.sin(clock / 1300) * .004 }),
    sprite('family-seated', 'familySeated', p.familySafe, { opacity: smooth((calm - .55) / .45) }),
  ];
  // Moving objects pass in front of room furnishings without covering any background pixels.
  if (tPlant > 0 && tPlant < 1) {
    const index = poses.findIndex(s => s.key === 'plant');
    poses.push(...poses.splice(index, 1));
  }
  return poses;
}

/** Inverse affine transform used by exact alpha hit-testing. */
export function localPoint(pose: SpritePose, x: number, y: number) {
  const dx = x - pose.x - pose.w * pose.anchorX;
  const dy = y - pose.y - pose.h * pose.anchorY;
  const c = Math.cos(pose.rotation), s = Math.sin(pose.rotation);
  const rx = c * dx + s * dy, ry = -s * dx + c * dy;
  const lx = rx / pose.scaleX;
  return { x: lx + pose.w * pose.anchorX, y: ry - pose.shear * lx + pose.h * pose.anchorY };
}
