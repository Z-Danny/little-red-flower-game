/** Versioned data boundary: rules never contain art paths or hit coordinates. */
import type { SceneFraming } from '../display/camera';
export type Box = { x: number; y: number; w: number; h: number };
export type Point = { x: number; y: number };
export type Action = {
  id: string;
  source: string;
  target: string;
  input: 'tap' | 'drop';
  goal?: string;
  requires?: string[];
  duration: number;
  outcome: 'correct' | 'danger' | 'escape';
  feedback: string;
  motion: 'mark' | 'move' | 'pack' | 'switch' | 'call' | 'assemble' | 'exit';
};
export type DisasterRules = {
  version: 1;
  id: string;
  title: string;
  order: number;
  kind: 'prevention' | 'response';
  seconds: number;
  missPenalty: number;
  goals: { id: string; label: string; lesson: string }[];
  actions: Action[];
  summary: string;
  opening: string;
  safety: string;
  timeout: string;
  finishTitle: string;
  revealMs: number;
};
export type Sprite = {
  src: string;
  box: Box;
  color: number[];
  input?: 'drag' | 'tap';
  label: string;
  fixed?: boolean;
  icon?: string;
  repair?: { src: string; box: Box };
};
export type DisasterSkin = {
  width: number;
  height: number;
  framing?: SceneFraming & { backdrop?: string };
  scene: string;
  clean: string;
  ending: string;
  mask: string;
  sprites: Record<string, Sprite>;
  zones: Record<string, { box: Box; label: string; danger?: boolean }>;
  poses: Record<string, Box>;
  weather: Point[][];
  faces?: Record<string, string>;
};
export type DisasterPack = { rules: DisasterRules; skin: DisasterSkin };
export function validateDisaster(p: DisasterPack) {
  const r = p.rules,
    s = p.skin;
  if (
    r.version !== 1 ||
    r.goals.length !== 7 ||
    new Set(r.goals.map((g) => g.id)).size !== 7
  )
    throw Error('新关必须有七个唯一目标');
  if (r.seconds <= 0 || r.revealMs < 1000 || s.width <= 0 || s.height <= 0)
    throw Error('无效关卡时间/画布');
  if (s.framing) {
    const f = s.framing, b = f.sceneBounds;
    const validBox = (v: Box) => v && [v.x,v.y,v.w,v.h].every(Number.isFinite) && v.w > 0 && v.h > 0;
    if (Object.keys(f).some(k => !['sceneBounds','critical','criticalRegions','backdrop'].includes(k)) || !validBox(b)
      || b.x > 0 || b.y > 0 || b.x+b.w < s.width || b.y+b.h < s.height) throw Error('无效灾害场景扩画范围');
    if (f.critical && (!validBox(f.critical) || f.critical.x < b.x || f.critical.y < b.y
      || f.critical.x+f.critical.w > b.x+b.w || f.critical.y+f.critical.h > b.y+b.h)) throw Error('无效灾害关键范围');
    if (f.criticalRegions && (!Array.isArray(f.criticalRegions) || f.criticalRegions.length > 128
      || f.criticalRegions.some(c => !validBox(c) || c.x < b.x || c.y < b.y || c.x+c.w > b.x+b.w || c.y+c.h > b.y+b.h)))
      throw Error('无效灾害关键物件范围');
    if ((b.x < 0 || b.y < 0 || b.x+b.w > s.width || b.y+b.h > s.height) && !f.backdrop) throw Error('扩画必须配置真实背景');
    if (f.backdrop && !/^\/levels\/[a-zA-Z0-9_./-]+\.(png|webp)$/.test(f.backdrop)
      && !/^data:image\/(png|webp);base64,/.test(f.backdrop)) throw Error('非本地灾害扩画背景');
  }
  const ids = new Set<string>();
  for (const a of r.actions) {
    if (ids.has(a.id)) throw Error(`重复动作 ${a.id}`);
    ids.add(a.id);
    if (!s.sprites[a.source]) throw Error(`缺少可见物 ${a.source}`);
    if (a.target !== a.source && !s.zones[a.target] && !s.sprites[a.target])
      throw Error(`缺少目标区 ${a.target}`);
    if (a.duration < 500 || a.duration > 1500)
      throw Error('处置动画必须为 0.5–1.5 秒');
    if (a.goal && !r.goals.some((g) => g.id === a.goal))
      throw Error(`未知进度 ${a.goal}`);
    if ((a.requires ?? []).some((id) => !r.goals.some((g) => g.id === id)))
      throw Error('未知前提');
  }
  for (const g of r.goals)
    if (!r.actions.some((a) => a.goal === g.id))
      throw Error(`不可达目标 ${g.id}`);
  for (const a of Object.values(s.sprites))
    if (
      a.box.w <= 0 ||
      a.box.h <= 0 ||
      a.box.x < 0 ||
      a.box.y < 0 ||
      a.box.x + a.box.w > s.width + 1 ||
      a.box.y + a.box.h > s.height + 1
    )
      throw Error('物品坐标超出原图');
  return p;
}
