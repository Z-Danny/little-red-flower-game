import preset from '@/content/presets/kitchen/skin.json';
import { kitchenCues } from '../response/audio-cues';
import type { LevelPackage, Pose } from '../runtime/schema';
import type { PlacementProject } from './model';
import { objectSounds, sound } from './sample-audio';

const pose = (
  asset: string,
  b: { x: number; y: number; w: number; h: number },
  depth: number,
): Pose => ({ ...b, asset, depth });
const lid = pose('lid', preset.layout.lid, 8);
const person = pose('worried', { x: 375, y: 400, w: 330, h: 421 }, 6);
const gas = pose('gas', preset.layout.gas, 4);
const pack: LevelPackage = {
  rules: {
    schemaVersion: 1,
    id: 'placement-kitchen-test',
    kind: 'response',
    title: '厨房着火了 · 放置测试',
    order: 1,
    location: '厨房',
    description:
      '练习关闭火源、盖住油锅和撤离；在编辑模式检查每一步的接收区域与落位。',
    safety:
      '这是初起油锅火的模拟训练。现实中若火势失控，请立即撤离并拨打 119；儿童不要尝试灭火。',
    briefing:
      '点击燃气开关，拖锅盖到油锅，再将人物拖到右侧门外。关火与盖锅盖支持交换顺序。',
    objects: [
      { id: 'gas', label: '燃气开关', input: 'tap', disabledWhen: ['gas-off'] },
      { id: 'lid', label: '锅盖', input: 'drag', disabledWhen: ['covered'] },
      {
        id: 'person',
        label: '人物',
        input: 'drag',
        disabledWhen: ['evacuated'],
      },
      { id: 'water', label: '水杯', input: 'drag' },
      { id: 'cloth', label: '小化纤抹布', input: 'drag' },
      { id: 'plate', label: '餐盘', input: 'drag' },
    ],
    goals: [
      { id: 'gas-off', label: '关闭火源', object: 'gas' },
      { id: 'covered', label: '盖住油锅', object: 'lid' },
      { id: 'evacuated', label: '安全撤离', object: 'person' },
    ],
    interactions: [
      {
        id: 'shutoff',
        source: 'gas',
        mode: 'tap',
        grants: ['gas-off'],
        outcome: 'correct',
        animation: 'shutoff',
        feedback: '火源已关闭；油锅仍需盖严。',
      },
      {
        id: 'cover',
        source: 'lid',
        mode: 'drop',
        target: 'pan',
        grants: ['covered'],
        outcome: 'correct',
        animation: 'cover',
        feedback: '保持锅盖覆盖，确认燃气已经关闭。',
      },
      {
        id: 'evacuate',
        source: 'person',
        mode: 'drop',
        target: 'exit',
        requires: ['covered', 'gas-off'],
        grants: ['evacuated'],
        outcome: 'correct',
        animation: 'evacuate',
        feedback: '人物已撤离；火灭后保持覆盖，等待充分冷却。',
      },
      {
        id: 'water',
        source: 'water',
        mode: 'drop',
        target: 'pan',
        unless: ['covered'],
        grants: [],
        outcome: 'danger',
        animation: 'water',
        riskDelta: 15,
        feedback: '油锅起火不能泼水！火势升高，仍可继续正确处置。',
      },
      {
        id: 'cloth',
        source: 'cloth',
        mode: 'drop',
        target: 'pan',
        unless: ['covered'],
        grants: [],
        outcome: 'danger',
        animation: 'cloth',
        riskDelta: 15,
        feedback: '这块小化纤抹布无法盖严锅口，请用匹配的锅盖。',
      },
    ],
    risk: {
      seconds: 85,
      initial: 22,
      warningAt: 65,
      peakFeedback: '训练仍可继续；现实中火势失控应立即撤离并拨打 119。',
    },
    completion: {
      requires: ['gas-off', 'covered', 'evacuated'],
      settleMs: 1400,
      summary: '处置完成。火灭后保持覆盖，等待充分冷却，不要急着揭盖。',
    },
  },
  skin: {
    schemaVersion: 1,
    id: 'placement-paperbook-kitchen',
    world: { width: 720, height: 1440 },
    assets: Object.fromEntries(
      Object.keys(preset.assets).map((id) => [
        id,
        { src: `builtin:${id}`, alpha: id !== 'room' },
      ]),
    ),
    background: 'room',
    poses: {
      pan: pose('pan', preset.layout.pan, 3),
      gas,
      lid: pose('lid', preset.layout.props.lid, 8),
      person,
      water: pose('water', preset.layout.props.water, 5),
      cloth: pose('cloth', preset.layout.props.cloth, 5),
      plate: pose('plate', preset.layout.props.plate, 5),
      flame: { ...pose('flame', preset.layout.flame, 4), blockInput: false },
    },
    zones: { pan: preset.layout.zones.pan, exit: preset.layout.zones.exit },
    zoneLabels: { pan: '油锅接收区', exit: '门外安全区' },
    states: [
      ...(['worried', 'panicked', 'focused', 'relieved'] as const).map((e) => ({
        object: 'person',
        when: { emotion: e },
        pose: { asset: e },
      })),
      {
        object: 'person',
        when: { all: ['covered', 'gas-off'] },
        pose: { asset: 'relieved' },
      },
      { object: 'flame', when: { all: ['covered'] }, pose: { opacity: 0 } },
    ],
    animations: {
      cover: {
        durationMs: 1000,
        tracks: [
          {
            object: 'lid',
            fromDrop: true,
            keyframes: [{ at: 1, x: lid.x, y: lid.y, w: lid.w, h: lid.h }],
          },
        ],
      },
      shutoff: {
        durationMs: 800,
        tracks: [
          { object: 'gas', keyframes: [{ at: 1, rotation: -Math.PI / 2 }] },
        ],
      },
      evacuate: {
        durationMs: 1200,
        tracks: [
          {
            object: 'person',
            fromDrop: true,
            keyframes: [{ at: 1, ...preset.layout.evacuated }],
          },
        ],
      },
      water: {
        durationMs: 1000,
        tracks: [
          {
            object: 'water',
            fromDrop: true,
            keyframes: [
              { at: 0.4, rotation: -0.7 },
              { at: 1, ...preset.layout.props.water, rotation: 0 },
            ],
          },
        ],
      },
      cloth: {
        durationMs: 1000,
        tracks: [
          {
            object: 'cloth',
            fromDrop: true,
            keyframes: [
              { at: 0.4, rotation: 0.2 },
              { at: 1, ...preset.layout.props.cloth, rotation: 0 },
            ],
          },
        ],
      },
    },
    effects: [{ object: 'flame', kind: 'fire', until: ['covered'] }],
    response: {
      kind: 'fire',
      actor: 'person',
      smokeOrigin: { x: 241, y: 474 },
      smokeDepth: 4,
      sealed: 'covered',
      sourceOff: 'gas-off',
      controlledBy: ['covered', 'gas-off'],
      cues: {
        ...kitchenCues,
        actions: Object.fromEntries(
          Object.entries(kitchenCues.actions).filter(
            ([id]) => !['spray', 'miss-spray'].includes(id),
          ),
        ),
      },
    },
  },
};
export const kitchenProject: PlacementProject = {
  schemaVersion: 1,
  audio: {
    objects: {
      gas: objectSounds('switch', '燃气开关'),
      lid: objectSounds('metal', '锅盖'),
      person: objectSounds('steps', '人物'),
      water: objectSounds('liquid', '水杯'),
      cloth: objectSounds('cloth', '小化纤抹布'),
      plate: objectSounds('ceramic', '餐盘'),
    },
    actions: {
      shutoff: [{ at: 0.05, sound: sound('switch', 'turn', '燃气旋钮咔嗒') }],
      cover: [
        { at: 0.9, sound: sound('metal', 'place', '金属锅盖与锅口盖合') },
      ],
      evacuate: [{ at: 0.08, sound: sound('steps', 'walk', '撤离脚步') }],
      water: [{ at: 0.14, sound: sound('liquid', 'pour', '泼水与飞溅') }],
      cloth: [{ at: 0.14, sound: sound('cloth', 'place', '抹布摩擦') }],
    },
  },
  pack,
  placements: {
    cover: {
      anchor: { x: 0.5, y: 0.75 },
      snap: lid,
      via: [],
      frontOf: 'pan',
      cover: { x: 158, y: 480, w: 151, h: 33 },
      minCoverage: 1,
    },
    shutoff: {
      anchor: { x: 0.5, y: 0.5 },
      snap: { ...gas, rotation: -Math.PI / 2 },
      via: [],
    },
    evacuate: {
      anchor: { x: 0.5, y: 0.8 },
      snap: pose('relieved', preset.layout.evacuated, 6),
      via: [],
    },
  },
  style: {
    name: '小红花 · 温暖绘本厨房',
    notes:
      '复用当前厨房同一批背景、物品、人物表情与音效。替换素材后重新检查透明边缘、光线方向、尺寸和落位。',
  },
  review: {
    spatial:
      '锅盖应完整覆盖锅口并绘制在油锅之上；物品有桌面支撑，人物落地，门外可站立。',
    causality:
      '关火与盖锅盖可以交换；两项完成后才发放本训练的撤离目标。水和小化纤抹布错误后可恢复。',
    safety:
      '沿用当前厨房训练说明。撤离前置条件只是关卡目标，不能解读为现实中危险时禁止撤离。',
    visual:
      '需人工看盖锅、撤离与错误操作全过程；自动几何检查不能证明透明图像严丝合缝。',
  },
};
