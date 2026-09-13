import type {
  Box,
  Input,
  LevelPackage,
  Point,
  Pose,
  Run,
} from '../runtime/schema';
import { createRun, findRule, reduceRun } from '../runtime/engine';
import { validatePackage } from '../runtime/validate';
import preset from '@/content/presets/kitchen/skin.json';
import kitSkin from '@/content/levels/flood-kit/skins/paperbook.json';
import { validateSounds, type PlacementSounds } from './sound';
import { validateFlow, type PlacementFlow } from './flow';

export type Placement = {
  anchor: Point;
  snap: Pose;
  via: Point[];
  frontOf?: string;
  cover?: Box;
  minCoverage?: number;
};
export type PlacementProject = {
  schemaVersion: 1;
  audio?: PlacementSounds;
  flow?: PlacementFlow;
  pack: LevelPackage;
  placements: Record<string, Placement>;
  style: { name: string; notes: string };
  review: {
    spatial: string;
    causality: string;
    safety: string;
    visual: string;
  };
};
export type Issue = {
  severity: 'error' | 'review';
  path: string;
  message: string;
};
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export const assetLibrary: Record<string, string> = {
  ...preset.assets,
  ...Object.fromEntries(
    Object.entries(kitSkin.assets).map(([id, a]) => [`kit-${id}`, a.src]),
  ),
};
export function compileProject(project: PlacementProject): LevelPackage {
  const pack = clone(project.pack);
  for (const asset of Object.values(pack.skin.assets)) {
    if (asset.src.startsWith('builtin:')) {
      const src = assetLibrary[asset.src.slice(8)];
      if (!src) throw new Error(`未知内置素材：${asset.src}`);
      asset.src = src;
    }
  }
  for (const [id, placement] of Object.entries(project.placements)) {
    const rule = pack.rules.interactions.find((r) => r.id === id);
    if (!rule) throw new Error(`placements.${id}: 动作不存在`);
    const { snap, via } = placement;
    const motion = pack.skin.animations[rule.animation];
    if (!motion) throw new Error(`placements.${id}: 动画不存在`);
    const { depth: _depth, pivot: _pivot, blockInput: _block, ...frame } = snap;
    motion.tracks = [
      {
        object: rule.source,
        fromDrop: rule.mode === 'drop',
        keyframes: [
          ...via.map((point, i) => ({
            at: (i + 1) / (via.length + 1),
            x: point.x,
            y: point.y,
          })),
          { at: 1, ...frame },
        ],
      },
    ];
    if (rule.outcome === 'correct')
      pack.skin.states.push({
        object: rule.source,
        when: { all: rule.grants },
        pose: snap,
      });
  }
  return pack;
}
const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const record = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const intersection = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
export function inspectProject(input: unknown): Issue[] {
  const issues: Issue[] = [];
  const error = (path: string, message: string) =>
    issues.push({ severity: 'error', path, message });
  try {
    if (
      !record(input) ||
      input.schemaVersion !== 1 ||
      !record(input.pack) ||
      !record(input.placements)
    )
      throw new Error('需要 schemaVersion=1、pack 和 placements');
    if (
      Object.keys(input).some(
        (k) =>
          ![
            'schemaVersion',
            'pack',
            'placements',
            'style',
            'review',
            'audio',
            'flow',
          ].includes(k),
      )
    )
      throw new Error('项目包含未知顶层字段');
    if (
      !record(input.style) ||
      typeof input.style.name !== 'string' ||
      typeof input.style.notes !== 'string'
    )
      throw new Error('style 需要 name 和 notes');
    if (
      !record(input.review) ||
      ['spatial', 'causality', 'safety', 'visual'].some(
        (k) => typeof input.review[k] !== 'string',
      )
    )
      throw new Error('review 需要空间、因果、安全、画面检查说明');
    const project = input as PlacementProject;
    if (project.audio) validateSounds(project.pack, project.audio);
    else
      issues.push({
        severity: 'review',
        path: 'audio',
        message: '旧版配置尚无逐物品音效表；批量生产必须补全音效。',
      });
    if (project.flow) validateFlow(project.pack, project.flow);
    // Validate the uncompiled contract too: compilation must never hide a malformed base package.
    const raw = clone(project.pack);
    for (const a of Object.values(raw.skin.assets)) {
      if (
        typeof a.src !== 'string' ||
        (!a.src.startsWith('builtin:') &&
          !/^data:image\/(png|webp);base64,[A-Za-z0-9+/=]+$/.test(a.src))
      )
        throw new Error(
          '素材只接受 builtin:名称 或内嵌 PNG/WebP，请通过素材上传导入新图',
        );
      if (a.src.startsWith('builtin:')) {
        const src = assetLibrary[a.src.slice(8)];
        if (!src) throw new Error('未知内置素材');
        a.src = src;
      }
    }
    validatePackage(raw.rules, raw.skin, { embedded: true });
    if (project.flow?.poseStates)
      validatePackage(
        raw.rules,
        {
          ...raw.skin,
          states: [...raw.skin.states, ...project.flow.poseStates],
        },
        { embedded: true },
      );
    const used = new Set<string>();
    for (const [id, p] of Object.entries(project.placements)) {
      const path = `placements.${id}`;
      if (
        !record(p) ||
        Object.keys(p).some(
          (k) =>
            ![
              'anchor',
              'snap',
              'via',
              'frontOf',
              'cover',
              'minCoverage',
            ].includes(k),
        )
      )
        throw new Error(`${path}: 放置字段错误`);
      if (
        !record(p.anchor) ||
        !['x', 'y'].every(
          (k) =>
            finite(p.anchor[k as 'x']) &&
            p.anchor[k as 'x'] >= 0 &&
            p.anchor[k as 'x'] <= 1,
        )
      )
        throw new Error(`${path}.anchor: 必须是 0～1 的归一化坐标`);
      const rule = raw.rules.interactions.find((r) => r.id === id);
      if (!rule || rule.outcome !== 'correct')
        throw new Error(`${path}: 只绑定正确动作`);
      if (used.has(rule.animation))
        throw new Error(`${path}: 可编辑动作必须有独立动画`);
      used.add(rule.animation);
      if (
        !Array.isArray(p.via) ||
        p.via.length > 12 ||
        p.via.some((v) => !record(v) || !finite(v.x) || !finite(v.y))
      )
        throw new Error(`${path}.via: 最多 12 个有效路径点`);
      const box = p.snap;
      if (
        !record(box) ||
        typeof box.asset !== 'string' ||
        !raw.skin.assets[box.asset] ||
        !finite(box.depth) ||
        !(box.w > 0) ||
        !(box.h > 0)
      )
        throw new Error(`${path}.snap: 必须提供有效素材、正数尺寸和绘制层级`);
      if (
        !record(box) ||
        !['x', 'y', 'w', 'h'].every((k) => finite(box[k as 'x']))
      )
        throw new Error(`${path}.snap: 缺少落位矩形`);
      const { width, height } = raw.skin.world;
      if (
        box.x < 0 ||
        box.y < 0 ||
        box.x + box.w > width ||
        box.y + box.h > height
      )
        error(path + '.snap', '最终落位超出画布');
      if (p.frontOf) {
        const back = raw.skin.poses[p.frontOf];
        if (!back) error(path + '.frontOf', '被遮挡对象不存在');
        else if (
          box.depth <= back.depth ||
          raw.skin.poses[rule.source].depth <= back.depth
        )
          error(
            path + '.snap.depth',
            `必须在 ${p.frontOf} 上方绘制，当前层级会导致穿模`,
          );
      }
      if (p.cover) {
        if (
          !['x', 'y', 'w', 'h'].every((k) => finite(p.cover![k as 'x'])) ||
          p.cover.w <= 0 ||
          p.cover.h <= 0 ||
          !finite(p.minCoverage) ||
          p.minCoverage! < 0 ||
          p.minCoverage! > 1
        )
          throw new Error(`${path}.cover: 覆盖区域或比例无效`);
        if (
          intersection(box, p.cover) / (p.cover.w * p.cover.h) <
          p.minCoverage!
        )
          error(path + '.snap', '落位矩形未覆盖要求区域，请调整尺寸或位置');
      }
      const zone = rule.target && raw.skin.zones[rule.target];
      if (zone && intersection(box, zone) === 0)
        error(path + '.snap', '最终落位与接收区完全分离');
      for (const v of p.via)
        if (v.x < 0 || v.y < 0 || v.x + box.w > width || v.y + box.h > height)
          error(path + '.via', '路径点会使物体越出画布');
    }
    const pack = compileProject(project);
    validatePackage(pack.rules, pack.skin, { embedded: true });
    for (const r of pack.rules.interactions)
      if (r.outcome === 'correct' && !project.placements[r.id])
        error(`placements.${r.id}`, '正确动作缺少独立的最终落位与锚点');
    const zones = Object.entries(pack.skin.zones);
    zones.forEach(([a, ab], i) =>
      zones.slice(i + 1).forEach(([b, bb]) => {
        if (intersection(ab, bb) > 0)
          error(`skin.zones.${a}`, `与 ${b} 重叠，会导致接收目标歧义`);
      }),
    );
    if (!project.style.name.trim())
      issues.push({
        severity: 'review',
        path: 'style.name',
        message: '请写明统一美术风格',
      });
    issues.push({
      severity: 'review',
      path: 'review.visual',
      message:
        '矩形覆盖不代表像素遮挡正确；请查看盖锅后的实际画面、透明边缘、人物脚底和移动路径。',
    });
    issues.push({
      severity: 'review',
      path: 'review.safety',
      message:
        '常理与安全说明需人工复核；自动检查只验证配置、可达性与几何约束。',
    });
  } catch (e) {
    error('project', e instanceof Error ? e.message : String(e));
  }
  return issues;
}
export function parseProject(text: string): PlacementProject {
  if (text.length > 48 * 1024 * 1024)
    throw new Error('配置超过 48 MB，请压缩图片后重试');
  const project = JSON.parse(text),
    errors = inspectProject(project).filter((i) => i.severity === 'error');
  if (errors.length)
    throw new Error(errors.map((i) => `${i.path}: ${i.message}`).join('\n'));
  return project;
}
export function dropInput(
  project: PlacementProject,
  source: string,
  box: Box,
): Input {
  const entry = Object.entries(project.placements).find(
    ([id]) =>
      project.pack.rules.interactions.find((r) => r.id === id)?.source ===
      source,
  );
  const anchor = entry?.[1].anchor ?? { x: 0.5, y: 0.5 };
  const p = { x: box.x + box.w * anchor.x, y: box.y + box.h * anchor.y };
  const target = Object.entries(project.pack.skin.zones).find(
    ([, z]) => p.x >= z.x && p.y >= z.y && p.x <= z.x + z.w && p.y <= z.y + z.h,
  )?.[0];
  return {
    source,
    mode: 'drop',
    target,
    point: { x: box.x + box.w / 2, y: box.y + box.h / 2 },
  };
}
export function explainInput(pack: LevelPackage, run: Run, input: Input) {
  const rule = findRule(pack, run, input);
  if (rule)
    return {
      status: rule.outcome,
      message: rule.feedback ?? rule.id,
      rule: rule.id,
    };
  const candidate = pack.rules.interactions.find(
    (r) =>
      r.source === input.source &&
      r.mode === input.mode &&
      r.target === input.target,
  );
  const missing = candidate?.requires?.filter((g) => !run.resolved.includes(g));
  return {
    status: missing?.length ? 'blocked' : 'miss',
    rule: '',
    message: missing?.length
      ? `前置条件未完成：${missing.map((g) => pack.rules.goals.find((x) => x.id === g)?.label ?? g).join('、')}。本训练仍可继续。`
      : '未命中可执行的目标，物品返回原位。',
  };
}
export type Simulation = { name: string; passed: boolean; detail: string };
/** Runs the real reducer over all reachable goal states, without claiming visual or audio acceptance. */
export function simulateProject(project: PlacementProject): Simulation[] {
  const issues = inspectProject(project).filter((i) => i.severity === 'error');
  if (issues.length)
    return [{ name: '配置可运行', passed: false, detail: issues[0].message }];
  const pack = compileProject(project),
    output: Simulation[] = [];
  const advance = (run: Run) => {
    for (let n = 0; n < 80 && (run.action || run.phase === 'settling'); n++)
      run = reduceRun(pack, run, { type: 'tick', ms: 100 });
    return run;
  };
  const queue = [createRun(pack)],
    seen = new Set(['']);
  let transitions = 0,
    completed = 0;
  while (queue.length) {
    const run = queue.shift()!;
    if (run.phase === 'complete') {
      completed++;
      continue;
    }
    for (const r of pack.rules.interactions.filter(
      (r) => r.outcome === 'correct',
    )) {
      const input: Input = { source: r.source, mode: r.mode, target: r.target };
      if (findRule(pack, run, input)?.id !== r.id) continue;
      const next = advance(reduceRun(pack, run, { type: 'interact', input }));
      transitions++;
      const key = next.resolved.slice().sort().join('|');
      if (!seen.has(key)) {
        seen.add(key);
        queue.push(next);
      }
    }
  }
  output.push({
    name: '目标与顺序可达',
    passed: completed > 0,
    detail: `${seen.size} 个状态，${transitions} 条正确转换，${completed} 个通关状态`,
  });
  for (const r of pack.rules.interactions.filter((r) => r.requires?.length)) {
    const before = createRun(pack),
      next = advance(
        reduceRun(pack, before, {
          type: 'interact',
          input: { source: r.source, mode: r.mode, target: r.target },
        }),
      );
    output.push({
      name: `前置条件：${r.id}`,
      passed: !r.grants.some((g) => next.resolved.includes(g)),
      detail: '初始状态不会提前发放该动作的目标',
    });
  }
  for (const r of pack.rules.interactions.filter(
    (r) => r.outcome === 'danger' && !r.requires?.length,
  )) {
    const wrong = advance(
      reduceRun(pack, createRun(pack), {
        type: 'interact',
        input: { source: r.source, mode: r.mode, target: r.target },
      }),
    );
    let current = wrong;
    for (let i = 0; i < 20 && current.phase === 'playing'; i++) {
      const valid = pack.rules.interactions.find(
        (a) =>
          a.outcome === 'correct' &&
          findRule(pack, current, {
            source: a.source,
            mode: a.mode,
            target: a.target,
          })?.id === a.id,
      );
      if (!valid) break;
      current = advance(
        reduceRun(pack, current, {
          type: 'interact',
          input: {
            source: valid.source,
            mode: valid.mode,
            target: valid.target,
          },
        }),
      );
    }
    output.push({
      name: `错误后恢复：${r.id}`,
      passed: wrong.mistakes === 1 && current.phase === 'complete',
      detail: '危险操作计错，之后仍可完成训练',
    });
  }
  return output;
}
