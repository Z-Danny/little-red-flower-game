import type {
  Box,
  Interaction,
  Motion,
  ObjectSpec,
  Rules,
  Skin,
} from '../runtime/schema';
import {
  clone,
  compileProject,
  inspectProject,
  simulateProject,
  type Issue,
  type Placement,
  type PlacementProject,
  type Simulation,
} from './model';
import type { ActionSound, ObjectSounds } from './sound';
import type { Sound } from './sound';
import { simulateFlow, type PlacementFlow } from './flow';

export type ProductionAction = Omit<Interaction, 'animation' | 'grants'> & {
  goals: { id: string; label: string }[];
  durationMs: number;
  placement?: Placement;
  motion?: Motion['tracks'];
  sounds: ActionSound[];
};
export type LevelPlan = {
  id: string;
  title: string;
  kind: Rules['kind'];
  location: string;
  description: string;
  briefing: string;
  safety: string;
  objects: (ObjectSpec & { support: string; sounds?: ObjectSounds })[];
  scene: Omit<
    Skin,
    'schemaVersion' | 'id' | 'zones' | 'zoneLabels' | 'animations'
  >;
  targets: { id: string; label: string; box: Box }[];
  actions: ProductionAction[];
  risk: Rules['risk'];
  completion: { settleMs: number; summary: string };
  review: PlacementProject['review'];
  flow?: PlacementFlow;
  stageSounds?: Record<string, Sound>;
};
export type BatchPlan = {
  format: 'placement-plan-v1';
  id: string;
  style: PlacementProject['style'];
  levels: LevelPlan[];
};
export type ProductionResult = {
  id: string;
  title: string;
  status: 'ready' | 'blocked';
  issues: Issue[];
  simulation: Simulation[];
  project?: PlacementProject;
};
export type PlacementBatch = {
  format: 'placement-batch-v1';
  id: string;
  results: ProductionResult[];
};
function shape(value: any, allowed: string[], name: string) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !allowed.includes(k))
  )
    throw new Error(`${name}: 缺少对象或包含未知字段`);
}
function text(value: unknown, name: string) {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`${name}: 必须填写，不能留空`);
}
function id(value: string, name: string) {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(value))
    throw new Error(
      `${name}: 使用小写字母开头的字母、数字或连字符，最多 64 字符`,
    );
}
export function compilePlan(
  plan: LevelPlan,
  style: PlacementProject['style'],
  order = 1,
): PlacementProject {
  shape(
    plan,
    [
      'id',
      'title',
      'kind',
      'location',
      'description',
      'briefing',
      'safety',
      'objects',
      'scene',
      'targets',
      'actions',
      'risk',
      'completion',
      'review',
      'flow',
      'stageSounds',
    ],
    'level',
  );
  id(plan.id, 'level.id');
  for (const k of [
    'title',
    'location',
    'description',
    'briefing',
    'safety',
  ] as const)
    text(plan[k], k);
  shape(style, ['name', 'notes'], 'style');
  text(style.name, 'style.name');
  text(style.notes, 'style.notes');
  shape(plan.review, ['spatial', 'causality', 'safety', 'visual'], 'review');
  for (const k of ['spatial', 'causality', 'safety', 'visual'] as const)
    text(plan.review[k], `review.${k}`);
  shape(plan.completion, ['settleMs', 'summary'], 'completion');
  text(plan.completion.summary, 'completion.summary');
  if (
    !Array.isArray(plan.objects) ||
    !plan.objects.length ||
    plan.objects.length > 40 ||
    !Array.isArray(plan.actions) ||
    !plan.actions.length ||
    plan.actions.length > 100 ||
    !Array.isArray(plan.targets) ||
    plan.targets.length > 40
  )
    throw new Error(
      '需提供物品、目标区、动作清单；最多 40 物品、40 区域、100 动作',
    );
  const project: PlacementProject = {
    schemaVersion: 1,
    style: clone(style),
    review: clone(plan.review),
    placements: {},
    audio: { objects: {}, actions: {} },
    pack: {
      rules: {
        schemaVersion: 1,
        id: plan.id,
        kind: plan.kind,
        title: plan.title,
        location: plan.location,
        description: plan.description,
        briefing: plan.briefing,
        safety: plan.safety,
        order,
        objects: [],
        goals: [],
        interactions: [],
        risk: clone(plan.risk),
        completion: { ...plan.completion, requires: [] },
      },
      skin: {
        ...clone(plan.scene),
        schemaVersion: 1,
        id: plan.id + '-skin',
        zones: {},
        zoneLabels: {},
        animations: {},
      },
    },
  };
  if (plan.flow) project.flow = clone(plan.flow);
  if (plan.stageSounds) project.audio!.stages = clone(plan.stageSounds);
  if (project.pack.skin.id.length > 64) project.pack.skin.id = plan.id;
  shape(
    plan.scene,
    [
      'world',
      'framing',
      'assets',
      'background',
      'poses',
      'states',
      'effects',
      'labels',
      'response',
    ],
    'scene',
  );
  for (const object of plan.objects) {
    shape(
      object,
      ['id', 'label', 'input', 'requires', 'disabledWhen', 'support', 'sounds'],
      'object',
    );
    text(object.support, `objects.${object.id}.support`);
    const { sounds, support: _support, ...spec } = object;
    project.pack.rules.objects.push(clone(spec));
    if (spec.input !== 'none') {
      if (!sounds)
        throw new Error(`objects.${object.id}.sounds: 该物品没有音效表`);
      project.audio!.objects[object.id] = clone(sounds);
    }
  }
  for (const target of plan.targets) {
    shape(target, ['id', 'label', 'box'], 'target');
    id(target.id, 'target.id');
    text(target.label, 'target.label');
    if (project.pack.skin.zones[target.id])
      throw new Error(`重复目标区：${target.id}`);
    project.pack.skin.zones[target.id] = clone(target.box);
    project.pack.skin.zoneLabels![target.id] = target.label;
  }
  const seen = new Set<string>();
  for (const action of plan.actions) {
    shape(
      action,
      [
        'id',
        'source',
        'mode',
        'target',
        'requires',
        'unless',
        'outcome',
        'riskDelta',
        'feedback',
        'goals',
        'durationMs',
        'placement',
        'motion',
        'sounds',
      ],
      'action',
    );
    id(action.id, 'action.id');
    text(action.feedback, `actions.${action.id}.feedback`);
    if (seen.has(action.id)) throw new Error(`重复动作：${action.id}`);
    seen.add(action.id);
    if (!Array.isArray(action.goals))
      throw new Error(`${action.id}.goals 需要数组`);
    const { goals, durationMs, placement, motion, sounds, ...rule } = action;
    for (const goal of goals) {
      shape(goal, ['id', 'label'], 'goal');
      project.pack.rules.goals.push({ ...goal, object: action.source });
    }
    project.pack.rules.interactions.push({
      ...rule,
      animation: action.id,
      grants: goals.map((g) => g.id),
    });
    const home = project.pack.skin.poses[action.source];
    if (!home) throw new Error(`${action.source}: 缺少初始图层与坐标`);
    const {
      depth: _depth,
      blockInput: _block,
      pivot: _pivot,
      ...homeFrame
    } = home;
    project.pack.skin.animations[action.id] = {
      durationMs,
      tracks: motion
        ? clone(motion)
        : [
            {
              object: action.source,
              fromDrop: action.mode === 'drop',
              keyframes: [{ at: 1, ...homeFrame }],
            },
          ],
    };
    if (action.outcome === 'correct') {
      if (!placement)
        throw new Error(`${action.id}: 正确动作必须填写最终落位、锚点、路径`);
      if (motion)
        throw new Error(
          `${action.id}: 正确动作动画由 placement 生成，请勿同时填写 motion`,
        );
      project.placements[action.id] = clone(placement);
    } else {
      if (placement)
        throw new Error(`${action.id}: 错误动作应在 motion 定义回位`);
      for (const track of project.pack.skin.animations[action.id].tracks) {
        const base = project.pack.skin.poses[track.object];
        if (!base) throw new Error(`${action.id}: 动画物品不存在`);
        const final = Object.assign({}, base, ...track.keyframes);
        for (const key of [
          'x',
          'y',
          'w',
          'h',
          'asset',
          'rotation',
          'opacity',
        ] as const)
          if (
            (final[key] ??
              (key === 'opacity' ? 1 : key === 'rotation' ? 0 : undefined)) !==
            (base[key] ??
              (key === 'opacity' ? 1 : key === 'rotation' ? 0 : undefined))
          )
            throw new Error(
              `${action.id}: 错误/无关操作动画必须回到初始 ${key}`,
            );
      }
    }
    project.audio!.actions[action.id] = clone(sounds ?? []);
  }
  project.pack.rules.completion.requires = project.pack.rules.goals.map(
    (g) => g.id,
  );
  // One contact anchor per object prevents action order from changing drop detection.
  for (const o of plan.objects) {
    const placements = plan.actions
      .filter((a) => a.source === o.id && a.placement)
      .map((a) => a.placement!);
    if (
      placements.some(
        (p) =>
          p.anchor.x !== placements[0].anchor.x ||
          p.anchor.y !== placements[0].anchor.y,
      )
    )
      throw new Error(`${o.id}: 同物品的动作必须共用判定锚点`);
  }
  const errors = inspectProject(project).filter((i) => i.severity === 'error');
  if (errors.length)
    throw new Error(errors.map((i) => `${i.path}: ${i.message}`).join('\n'));
  return project;
}
export function buildBatch(input: unknown): PlacementBatch {
  const plan = input as BatchPlan;
  shape(plan, ['format', 'id', 'style', 'levels'], 'batch');
  if (plan.format !== 'placement-plan-v1')
    throw new Error('需要 format=placement-plan-v1 的策划案生产卡');
  id(plan.id, 'batch.id');
  if (
    !Array.isArray(plan.levels) ||
    !plan.levels.length ||
    plan.levels.length > 20
  )
    throw new Error('单批支持 1～20 关；更多关卡请分批');
  const counts = new Map<string, number>();
  plan.levels.forEach((p) => counts.set(p?.id, (counts.get(p?.id) ?? 0) + 1));
  return {
    format: 'placement-batch-v1',
    id: plan.id,
    results: plan.levels.map((level, index) => {
      const base = {
        id: String(level?.id ?? `invalid-${index + 1}`),
        title: String(level?.title ?? `第 ${index + 1} 关`),
      };
      try {
        if (counts.get(level?.id)! > 1)
          throw new Error(
            `重复关卡 ID：${level.id}；为避免覆盖，同名关全部阻止导出`,
          );
        const project = compilePlan(level, plan.style, index + 1),
          issues = inspectProject(project),
          simulation = [
            ...simulateProject(project),
            ...simulateFlow(project, compileProject(project)),
          ];
        if (simulation.some((s) => !s.passed))
          return {
            ...base,
            status: 'blocked',
            issues: [
              ...issues,
              {
                severity: 'error',
                path: 'simulation',
                message: '规则仿真未通过',
              },
            ],
            simulation,
          };
        return { ...base, status: 'ready', issues, simulation, project };
      } catch (e) {
        return {
          ...base,
          status: 'blocked',
          issues: [
            {
              severity: 'error',
              path: `levels[${index}]`,
              message: String(e instanceof Error ? e.message : e),
            },
          ],
          simulation: [],
        };
      }
    }),
  };
}
export function parseBatch(text: string): PlacementBatch {
  if (text.length > 64 * 1024 * 1024)
    throw new Error('单批超过 64 MB，请拆批或压缩素材');
  const value = JSON.parse(text.replace(/^\uFEFF/, ''));
  if (value.format === 'placement-plan-v1') return buildBatch(value);
  shape(value, ['format', 'id', 'results'], 'batch');
  if (
    value.format !== 'placement-batch-v1' ||
    !Array.isArray(value.results) ||
    !value.results.length ||
    value.results.length > 20
  )
    throw new Error('不支持的批量包');
  id(value.id, 'batch.id');
  const seen = new Set();
  for (const result of value.results) {
    if (seen.has(result.id)) throw new Error('批量包 ID 重复');
    seen.add(result.id);
    if (result.status === 'ready') {
      if (!result.project?.audio) throw new Error('批量关卡缺少逐物品音效');
      const issues = inspectProject(result.project);
      if (issues.some((i) => i.severity === 'error'))
        throw new Error(`关卡 ${result.id} 检查不通过`);
      if (result.project.pack.rules.id !== result.id)
        throw new Error('批量包和项目 ID 不一致');
      result.issues = issues;
      result.simulation = [
        ...simulateProject(result.project),
        ...simulateFlow(result.project, compileProject(result.project)),
      ];
      if (result.simulation.some((s: Simulation) => !s.passed))
        throw new Error(`关卡 ${result.id} 仿真不通过`);
    } else if (result.status !== 'blocked') throw new Error('未知批量状态');
  }
  return value;
}
