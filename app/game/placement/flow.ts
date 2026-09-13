import type { LevelPackage, Pose, Run } from '../runtime/schema';
import type { PlacementProject } from './model';
import { matches, createRun, reduceRun, findRule } from '../runtime/engine';

export type PlacementFlow = {
  stages: {
    id: string;
    title: string;
    durationMs?: number;
    recommendedMs?: number;
    requires: string[];
    actions: string[];
    instruction: string;
    freezeWhenReady?: string[];
    shake?: { pixels: number; objects: Record<string, number> };
  }[];
  holds: Record<string, { ms: number; instruction: string }>;
  attachments?: {
    object: string;
    follows: string;
    when: string[];
    unless?: string[];
    offset: { x: number; y: number; w: number; h: number };
  }[];
  settledPoses?: Record<string, Partial<Pose>>;
  poseStates?: LevelPackage['skin']['states'];
  disableAfter?: Record<string, string[]>;
  debris?: { x: number; y: number; w: number; h: number }[];
};
export function validateFlow(pack: LevelPackage, flow: PlacementFlow) {
  const exact = (value: unknown, keys: string[]) => {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).some((k) => !keys.includes(k))
    )
      throw new Error('flow 包含未知字段或结构无效');
  };
  exact(flow, [
    'stages',
    'holds',
    'attachments',
    'settledPoses',
    'poseStates',
    'disableAfter',
    'debris',
  ]);
  if (
    !flow ||
    !Array.isArray(flow.stages) ||
    flow.stages.length < 2 ||
    flow.stages.length > 6 ||
    !flow.holds
  )
    throw new Error('flow: 需要 2～6 个阶段和 holds 表');
  const goals = new Set(pack.rules.goals.map((g) => g.id)),
    actions = new Set(pack.rules.interactions.map((r) => r.id));
  const stageIds = new Set<string>();
  for (const [i, stage] of flow.stages.entries()) {
    exact(stage, [
      'id',
      'title',
      'durationMs',
      'recommendedMs',
      'requires',
      'actions',
      'instruction',
      'freezeWhenReady',
      'shake',
    ]);
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(stage.id))
      throw new Error('阶段 ID 格式错误');
    if (
      !stage.id ||
      stageIds.has(stage.id) ||
      !stage.title?.trim() ||
      !stage.instruction?.trim()
    )
      throw new Error('flow: 阶段 ID 唯一，标题和引导不能为空');
    stageIds.add(stage.id);
    if (
      !Array.isArray(stage.requires) ||
      stage.requires.some((g) => !goals.has(g)) ||
      !Array.isArray(stage.actions) ||
      stage.actions.some((a) => !actions.has(a))
    )
      throw new Error(`flow.${stage.id}: 目标或动作引用错误`);
    if (
      i < flow.stages.length - 1 &&
      (!Number.isFinite(stage.durationMs) ||
        stage.durationMs! < 2000 ||
        stage.durationMs! > 120000)
    )
      throw new Error('限时阶段需要 2～120 秒的 durationMs');
    if (
      stage.recommendedMs !== undefined &&
      (!Number.isFinite(stage.recommendedMs) || stage.recommendedMs < 1000)
    )
      throw new Error('recommendedMs 无效');
    if (
      stage.freezeWhenReady?.some(
        (id) => !pack.rules.objects.some((o) => o.id === id),
      )
    )
      throw new Error('freezeWhenReady 引用不存在物品');
    if (stage.shake) {
      if (
        !Number.isFinite(stage.shake.pixels) ||
        stage.shake.pixels < 0 ||
        stage.shake.pixels > 8
      )
        throw new Error('晃动位移必须在 0～8 逻辑像素');
      for (const [object, amount] of Object.entries(stage.shake.objects))
        if (
          !pack.skin.poses[object] ||
          !Number.isFinite(amount) ||
          Math.abs(amount) > 0.15
        )
          throw new Error('晃动物体或角度无效');
    }
  }
  for (const action of actions)
    if (!flow.stages.some((s) => s.actions.includes(action)))
      throw new Error(`flow: ${action} 未分配阶段`);
  for (const [action, hold] of Object.entries(flow.holds)) {
    exact(hold, ['ms', 'instruction']);
    const rule = pack.rules.interactions.find((r) => r.id === action);
    if (
      !rule ||
      rule.mode !== 'tap' ||
      !Number.isFinite(hold.ms) ||
      hold.ms < 500 ||
      hold.ms > 5000 ||
      !hold.instruction?.trim()
    )
      throw new Error(
        `flow.holds.${action}: 长按须绑定点击动作，持续 500～5000 毫秒`,
      );
  }
  for (const a of flow.attachments ?? []) {
    exact(a, ['object', 'follows', 'when', 'unless', 'offset']);
    exact(a.offset, ['x', 'y', 'w', 'h']);
    if (
      !pack.skin.poses[a.object] ||
      !pack.skin.poses[a.follows] ||
      a.object === a.follows ||
      a.when.some((g) => !goals.has(g)) ||
      !['x', 'y', 'w', 'h'].every((k) => Number.isFinite(a.offset[k as 'x'])) ||
      a.offset.w <= 0 ||
      a.offset.h <= 0
    )
      throw new Error('flow.attachments: 跟随对象、目标或比例无效');
    if (
      a.unless?.some((g) => !goals.has(g)) ||
      flow.attachments?.some((b) => b.object === a.follows)
    )
      throw new Error('跟随条件无效或包含不支持的多级跟随');
  }
  if (
    (flow.debris?.length ?? 0) > 100 ||
    flow.debris?.some(
      (b) =>
        !['x', 'y', 'w', 'h'].every((k) => Number.isFinite(b[k as 'x'])) ||
        b.x < 0 ||
        b.y < 0 ||
        b.w <= 0 ||
        b.h <= 0 ||
        b.x + b.w > pack.skin.world.width ||
        b.y + b.h > pack.skin.world.height,
    )
  )
    throw new Error('碎屑位置越界或数量过多');
  for (const [action, objects] of Object.entries(flow.disableAfter ?? {}))
    if (
      !actions.has(action) ||
      !Array.isArray(objects) ||
      objects.some((id) => !pack.rules.objects.some((o) => o.id === id))
    )
      throw new Error('flow.disableAfter: 动作或物品不存在');
  for (const [key, pose] of Object.entries(flow.settledPoses ?? {})) {
    if (
      !pack.skin.poses[key] ||
      Object.keys(pose).some(
        (k) =>
          ![
            'x',
            'y',
            'w',
            'h',
            'asset',
            'depth',
            'rotation',
            'opacity',
            'pivot',
            'blockInput',
          ].includes(k),
      )
    )
      throw new Error('flow.settledPoses: 对象或字段无效');
    if (pose.asset && !pack.skin.assets[pose.asset])
      throw new Error('flow.settledPoses: 素材不存在');
    for (const k of [
      'x',
      'y',
      'w',
      'h',
      'depth',
      'rotation',
      'opacity',
    ] as const)
      if (pose[k] !== undefined && !Number.isFinite(pose[k]))
        throw new Error('flow.settledPoses: 非法数值');
  }
}
export function stageState(flow: PlacementFlow | undefined, run: Run) {
  if (!flow) return null;
  let start = 0;
  for (let i = 0; i < flow.stages.length; i++) {
    const stage = flow.stages[i],
      end = start + (stage.durationMs ?? Infinity);
    if (run.elapsed < end || i === flow.stages.length - 1)
      return { index: i, stage, age: run.elapsed - start, missed: false };
    if (!stage.requires.every((g) => run.resolved.includes(g)))
      return { index: i, stage, age: stage.durationMs!, missed: true };
    start = end;
  }
  return null;
}
export function flowPack(
  project: PlacementProject,
  pack: LevelPackage,
  run: Run,
  reduced = false,
): LevelPackage {
  const state = stageState(project.flow, run);
  if (!state) return pack;
  const poses = { ...pack.skin.poses };
  if (state.index > 0)
    for (const [key, patch] of Object.entries(project.flow?.settledPoses ?? {}))
      poses[key] = { ...poses[key], ...patch };
  if (!state.missed && !reduced && state.stage.shake)
    for (const [key, rotation] of Object.entries(state.stage.shake.objects))
      poses[key] = {
        ...poses[key],
        rotation:
          (poses[key].rotation ?? 0) + Math.sin(run.elapsed / 85) * rotation,
      };
  const states = [...pack.skin.states, ...(project.flow?.poseStates ?? [])];
  const resting = Object.fromEntries(
    Object.entries(poses).map(([id, pose]) => [id, { ...pose }]),
  );
  for (const s of states)
    if (matches(pack, run, s.when))
      resting[s.object] = { ...resting[s.object], ...s.pose };
  const animations = { ...pack.skin.animations };
  for (const rule of pack.rules.interactions.filter(
    (r) => r.outcome !== 'correct',
  )) {
    const animation = animations[rule.animation];
    animations[rule.animation] = {
      ...animation,
      tracks: animation.tracks.map((track) => {
        const {
          depth: _depth,
          pivot: _pivot,
          blockInput: _block,
          ...home
        } = resting[track.object];
        return {
          ...track,
          keyframes: track.keyframes.map((frame, i) =>
            i === track.keyframes.length - 1
              ? {
                  ...frame,
                  ...home,
                  at: 1,
                  rotation: home.rotation ?? 0,
                  opacity: home.opacity ?? 1,
                }
              : frame,
          ),
        };
      }),
    };
  }
  const freeze =
    state.stage.requires.length > 0 &&
    state.stage.requires.every((g) => run.resolved.includes(g));
  const interactions = pack.rules.interactions.filter((r) =>
    state.stage.actions.includes(r.id),
  );
  return {
    ...pack,
    rules: {
      ...pack.rules,
      objects: pack.rules.objects.map((o) =>
        (freeze && state.stage.freezeWhenReady?.includes(o.id)) ||
        !interactions.some((r) => r.source === o.id)
          ? { ...o, input: 'none' }
          : o,
      ),
      interactions,
    },
    skin: { ...pack.skin, poses, states, animations },
  };
}
export function simulateFlow(project: PlacementProject, pack: LevelPackage) {
  if (!project.flow) return [];
  let run = createRun(pack);
  for (let i = 0; i < 1600 && run.phase !== 'complete'; i++) {
    const stage = stageState(project.flow, run)!;
    if (stage.missed)
      return [
        {
          name: '分阶段通关',
          passed: false,
          detail: `${stage.stage.title} 在期限内无法完成`,
        },
      ];
    const current = flowPack(project, pack, run, true);
    if (!run.action && run.phase === 'playing') {
      const rule = current.rules.interactions.find(
        (r) =>
          r.outcome === 'correct' &&
          findRule(current, run, {
            source: r.source,
            mode: r.mode,
            target: r.target,
          })?.id === r.id,
      );
      if (rule) {
        const hold = project.flow.holds[rule.id];
        if (hold)
          for (let ms = 0; ms < hold.ms; ms += 100)
            run = reduceRun(current, run, {
              type: 'tick',
              ms: Math.min(100, hold.ms - ms),
            });
        run = reduceRun(current, run, {
          type: 'interact',
          input: { source: rule.source, mode: rule.mode, target: rule.target },
        });
      }
    }
    run = reduceRun(current, run, { type: 'tick', ms: 100 });
  }
  return [
    {
      name: '分阶段通关',
      passed: run.phase === 'complete',
      detail: `真实计时与阶段过滤下用时 ${run.elapsed / 1000} 秒；长按时长已计入，浏览器手势另测`,
    },
  ];
}
