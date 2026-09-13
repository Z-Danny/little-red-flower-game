import art from '@/content/placement/e07-art.json';
import type { Pose } from '../runtime/schema';
import type { BatchPlan, LevelPlan, ProductionAction } from './production';
import { objectSounds, sound } from './sample-audio';

const p = (
  asset: string,
  x: number,
  y: number,
  w: number,
  h: number,
  depth = 6,
): Pose => ({ asset, x, y, w, h, depth });
const poses: Record<string, Pose> = {
  cabinet: {
    ...p('cabinet', 20, 87, 100, 292, 2),
    pivot: { x: 0.5, y: 1 },
    blockInput: false,
  },
  table: { ...p('table', 185, 580, 400, 267, 8), blockInput: false },
  person: p('standing', 485, 508, 108, 360, 10),
  cushion: p('cushion', 55, 378, 108, 86, 9),
  shoes: p('shoes', 500, 967, 108, 72, 9),
  bag: p('bag', 605, 950, 88, 98, 9),
  grip: p('badge', 193, 766, 120, 62, 12),
  look: p('badge', 350, 984, 125, 62, 12),
  gas: p('gas', 648, 267, 42, 44, 9),
  elevator: p('badge', 607, 437, 99, 70, 12),
  valuables: p('badge', 607, 534, 99, 70, 12),
  lamp: {
    ...p('lamp', 447, 20, 150, 260, 11),
    pivot: { x: 0.5, y: 0 },
    blockInput: false,
  },
  flame: { ...p('flame', 638, 232, 45, 52, 9), blockInput: false },
  outdoor: {
    ...p('outdoor', 0, 0, 720, 1280, 30),
    opacity: 0,
    blockInput: false,
  },
};
const snap = (pose: Pose, anchor = { x: 0.5, y: 0.75 }) => ({
  anchor,
  snap: pose,
  via: [],
});
function correct(
  id: string,
  source: string,
  target: string | undefined,
  goal: string,
  label: string,
  pose: Pose,
  requires: string[],
  audio: ReturnType<typeof sound>,
  feedback: string,
  durationMs = 650,
): ProductionAction {
  return {
    id,
    source,
    mode: target ? 'drop' : 'tap',
    ...(target ? { target } : {}),
    goals: [{ id: goal, label }],
    outcome: 'correct',
    requires,
    feedback,
    durationMs,
    placement: snap(pose),
    sounds: [{ at: 0.85, sound: audio }],
  };
}
function danger(
  id: string,
  source: string,
  target: string | undefined,
  feedback: string,
  material: Parameters<typeof sound>[0],
  gesture: Parameters<typeof sound>[1] = 'reject',
): ProductionAction {
  return {
    id,
    source,
    mode: target ? 'drop' : 'tap',
    ...(target ? { target } : {}),
    goals: [],
    outcome: 'danger',
    feedback,
    durationMs: 750,
    riskDelta: 8,
    sounds: [
      {
        at: 0.08,
        sound: sound(material, gesture, feedback.split('。')[0], 0.65),
      },
    ],
  };
}
const actions: ProductionAction[] = [
  correct(
    'protect',
    'cushion',
    'head',
    'protected',
    '护住头颈',
    p('cushion', 465, 500, 104, 82, 9),
    [],
    sound('cloth', 'place', '坐垫贴住头颈的轻柔织物摩擦'),
    '用身边坐垫保护头颈，立即就近躲到牢固桌下。不要为了取物延误避险。',
  ),
  correct(
    'shelter',
    'person',
    'under-table',
    'sheltered',
    '伏地到桌下',
    p('crouch', 210, 675, 270, 171, 6),
    ['protected'],
    sound('cloth', 'place', '人物跪伏时衣物与地面的摩擦'),
    '低姿进入桌下；按住桌腿 1.5 秒练习抓牢。',
  ),
  correct(
    'hold',
    'grip',
    undefined,
    'held',
    '手抓牢并保持',
    poses.grip,
    ['sheltered'],
    sound('wood', 'place', '手握住木质桌腿，短促木响'),
    '已抓牢，请保持低姿，等待晃动停止。',
    500,
  ),
  correct(
    'inspect',
    'look',
    undefined,
    'checked',
    '观察周围安全',
    poses.look,
    ['held'],
    sound('wood', 'turn', '观察周围完成的轻提示'),
    '本情境：通道暂无明显坠物、没有燃气异味，开关近身且安全可达。穿好鞋，取身边轻便应急包。',
  ),
  correct(
    'shutoff',
    'gas',
    undefined,
    'gas-off',
    '安全可达时关火',
    { ...poses.gas, rotation: -Math.PI / 2 },
    ['checked'],
    sound('switch', 'turn', '燃气旋钮关到位的咔嗒声'),
    '本情境火源已关闭。若现实现场不安全，不冒险返回关阀。',
  ),
  correct(
    'wear-shoes',
    'shoes',
    'feet',
    'shoes-on',
    '穿好鞋',
    p('shoes', 465, 820, 112, 70, 10),
    ['checked'],
    sound('steps', 'place', '穿好鞋后鞋底轻落地'),
    '鞋已穿好，避开地面碎片。',
  ),
  correct(
    'take-bag',
    'bag',
    'body',
    'bag-on',
    '带轻便应急包',
    p('bag', 550, 669, 85, 95, 10),
    ['checked'],
    sound('cloth', 'lift', '应急包背带拉紧和织物沙沙声'),
    '只携带身边轻便应急包，不返回寻找贵重物品。',
  ),
  correct(
    'stairs',
    'person',
    'stairs',
    'escaped',
    '楼梯撤离到开阔地',
    p('standing', 421, 169, 110, 140, 6),
    ['checked', 'gas-off', 'shoes-on', 'bag-on'],
    sound('steps', 'walk', '有序下楼的连续脚步声'),
    '沿楼梯有序撤离，到开阔地后远离外墙、玻璃幕墙和电线杆。',
    1200,
  ),
  {
    ...danger(
      'early-stairs',
      'person',
      'stairs',
      '晃动中不要盲目冲向楼梯。吊灯和高柜存在坠落、倾倒风险；操作中断并回位，仍可就近避险。',
      'wood',
      'place',
    ),
    unless: ['held'],
  },
  danger(
    'doorframe',
    'person',
    'doorframe',
    '普通门框并非统一安全区。返回并就近寻找牢固物体遮挡。',
    'wood',
  ),
  danger(
    'balcony',
    'person',
    'balcony',
    '阳台玻璃存在碎裂风险。远离窗户和阳台，返回室内就近避险。',
    'ceramic',
    'place',
  ),
  danger(
    'wardrobe',
    'person',
    'wardrobe',
    '不要钻进高柜。柜体可能倾倒，内部视野受阻，不利于移动。',
    'wood',
    'place',
  ),
  {
    ...danger(
      'elevator',
      'elevator',
      undefined,
      '震后不要乘电梯。电梯已标红停用，请选择楼梯。',
      'switch',
    ),
    requires: ['held'],
  },
  {
    ...danger(
      'return-valuables',
      'valuables',
      undefined,
      '不要返回取贵重物品。余震风险仍在，应有序撤离。',
      'metal',
    ),
    requires: ['held'],
  },
];
// Returning a moved actor uses their current shelter pose, not their initial standing position.
for (const action of actions.filter((a) => a.outcome !== 'correct')) {
  const home = poses[action.source];
  action.motion = [
    {
      object: action.source,
      fromDrop: action.mode === 'drop',
      keyframes: [
        { at: 0.35, rotation: -0.055 },
        {
          at: 1,
          x: home.x,
          y: home.y,
          w: home.w,
          h: home.h,
          rotation: home.rotation ?? 0,
        },
      ],
    },
  ];
}
for (const action of actions.filter((a) =>
  ['early-stairs', 'wardrobe'].includes(a.id),
)) {
  for (const object of ['lamp', 'cabinet']) {
    const pose = poses[object];
    action.motion!.push({
      object,
      keyframes: [
        {
          at: 0.4,
          rotation: object === 'lamp' ? 0.15 : 0.1,
          y: pose.y + (object === 'lamp' ? 25 : 0),
        },
        { at: 1, rotation: 0, y: pose.y },
      ],
    });
  }
}
export const e07Plan: LevelPlan = {
  id: 'e07-shaking-begins',
  title: 'E07《晃动开始了》',
  kind: 'response',
  location: '高层住宅客厅',
  description: '强震突然到来。震时就近避险，震后观察环境，再有序撤离。',
  briefing:
    '先拖坐垫护头颈 → 拖人物到桌下 → 按住“手抓牢”1.5 秒；等 12 秒晃动结束，再观察周围、关火、穿鞋、带包走楼梯。',
  safety:
    '12 秒与 45 秒是训练节奏，不代表真实地震时长或安全倒计时。现实中按现场情况与官方指引行动；不为拿取物品延误避险，不冒险关阀，不乘电梯。',
  objects: [
    ...(
      [
        ['cushion', '坐垫', 'drag', 'cloth', ['protected']],
        ['person', '人物', 'drag', 'steps', ['escaped']],
        ['grip', '手抓牢（长按）', 'tap', 'wood', ['held']],
        ['look', '观察周围', 'tap', 'wood', ['checked']],
        ['gas', '关闭燃气', 'tap', 'switch', ['gas-off']],
        ['shoes', '鞋', 'drag', 'steps', ['shoes-on']],
        ['bag', '应急包', 'drag', 'cloth', ['bag-on']],
        ['elevator', '电梯', 'tap', 'switch', []],
        ['valuables', '回去取贵重物', 'tap', 'metal', []],
      ] as const
    ).map(([id, label, input, material, disabledWhen]) => ({
      id,
      label,
      input,
      disabledWhen: [...disabledWhen],
      support:
        id === 'person'
          ? '初始站在地板，桌下跪伏；完成观察后起身，脚底始终接地。'
          : '实物由沙发、地板或固定家具支撑；标牌为明确的交互按钮。',
      sounds: objectSounds(material, label),
    })),
  ],
  scene: {
    world: { width: 720, height: 1280 },
    assets: {
      ...Object.fromEntries(
        Object.entries(art).map(([id, src]) => [
          id,
          {
            src,
            alpha: !['room', 'outdoor'].includes(id),
            ...(id === 'standing'
              ? { frame: { x: 340, y: 41, w: 405, h: 1344 } }
              : id === 'crouch'
                ? { frame: { x: 42, y: 112, w: 1362, h: 860 } }
                : {}),
          },
        ]),
      ),
      bag: { src: 'builtin:kit-bag', alpha: true },
      gas: { src: 'builtin:gas', alpha: true },
      flame: { src: 'builtin:flame', alpha: true },
      badge: {
        src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
        alpha: true,
      },
    },
    background: 'room',
    poses,
    states: [
      { object: 'grip', when: { all: ['held'] }, pose: { opacity: 0 } },
      { object: 'flame', when: { all: ['gas-off'] }, pose: { opacity: 0 } },
      { object: 'outdoor', when: { all: ['escaped'] }, pose: { opacity: 1 } },
    ],
    effects: [],
    labels: [
      {
        object: 'grip',
        text: '手抓牢\n长按 1.5 秒',
        x: 0.5,
        y: 0.5,
        size: 19,
        color: '#fff7df',
        background: '#32645b',
      },
      {
        object: 'look',
        text: '观察周围',
        x: 0.5,
        y: 0.5,
        size: 22,
        color: '#fff7df',
        background: '#32645b',
      },
      {
        object: 'elevator',
        text: '电梯',
        x: 0.5,
        y: 0.5,
        size: 24,
        color: '#fff7df',
        background: '#657785',
      },
      {
        object: 'valuables',
        text: '取贵重物',
        x: 0.5,
        y: 0.5,
        size: 20,
        color: '#fff7df',
        background: '#736777',
      },
    ],
  },
  targets: [
    { id: 'head', label: '头颈部', box: { x: 448, y: 495, w: 145, h: 136 } },
    {
      id: 'under-table',
      label: '牢固桌下',
      box: { x: 210, y: 680, w: 270, h: 180 },
    },
    { id: 'body', label: '人物背部', box: { x: 498, y: 650, w: 140, h: 145 } },
    { id: 'feet', label: '人物脚部', box: { x: 490, y: 815, w: 140, h: 95 } },
    {
      id: 'stairs',
      label: '楼梯方向',
      box: { x: 424, y: 149, w: 102, h: 172 },
    },
    { id: 'doorframe', label: '门框', box: { x: 551, y: 141, w: 54, h: 183 } },
    { id: 'balcony', label: '阳台', box: { x: 139, y: 181, w: 182, h: 145 } },
    {
      id: 'wardrobe',
      label: '高柜内部',
      box: { x: 30, y: 100, w: 94, h: 235 },
    },
  ],
  actions,
  risk: {
    mode: 'elapsed',
    seconds: 57,
    initial: 0,
    warningAt: 65,
    peakFeedback: '保持低姿并保护头颈，按现场情况避险。',
  },
  completion: {
    settleMs: 1400,
    summary:
      '已到开阔地。远离外墙、玻璃幕墙、电线杆和广告牌，留意余震及官方消息。',
  },
  review: {
    spatial:
      '人物应完整位于桌面下，膝盖落地；桌腿在人物手前形成接触。坐垫随人物移动；鞋、应急包不能悬空。',
    causality:
      '第一阶段限时 12 秒。需完成护头、伏地、长按抓牢并保持到结束；未完成可重新练习。第二阶段观察后解锁近身安全可达的关火与随身物品，走楼梯撤离。',
    safety:
      '依据应急管理部与中国地震局“伏地、遮挡、手抓牢”原则；本关只模拟通道与开关安全可达，不将取物或关火作为所有真实地震的强制前置条件。',
    visual:
      '低饱和冷灰蓝环境，减弱阳光；可交互物保持清晰。检查桌面遮头、桌腿与手接触、震后碎屑、门框与楼梯区不重叠。',
  },
  flow: {
    debris: [
      { x: 190, y: 345, w: 17, h: 9 },
      { x: 243, y: 359, w: 12, h: 14 },
      { x: 145, y: 374, w: 16, h: 8 },
      { x: 355, y: 470, w: 13, h: 9 },
      { x: 365, y: 493, w: 9, h: 11 },
    ],
    poseStates: [
      {
        object: 'person',
        when: { all: ['checked'], not: ['escaped'] },
        pose: poses.person,
      },
    ],
    disableAfter: { elevator: ['elevator'] },
    stages: [
      {
        id: 'shaking',
        title: '强烈晃动中',
        durationMs: 12000,
        requires: ['protected', 'sheltered', 'held'],
        freezeWhenReady: ['person', 'cushion', 'grip'],
        actions: [
          'protect',
          'shelter',
          'hold',
          'early-stairs',
          'doorframe',
          'balcony',
          'wardrobe',
        ],
        instruction:
          '伏地、遮挡、手抓牢。不要盲目向外冲；抓牢后保持到晃动停止。',
        shake: { pixels: 3, objects: { lamp: 0.075, cabinet: 0.015 } },
      },
      {
        id: 'after',
        title: '晃动停止后',
        recommendedMs: 45000,
        requires: [],
        actions: [
          'inspect',
          'shutoff',
          'wear-shoes',
          'take-bag',
          'stairs',
          'elevator',
          'return-valuables',
        ],
        instruction:
          '先观察周围。安全可达时关火，穿鞋、带轻便包，沿楼梯到开阔地。',
      },
    ],
    holds: {
      hold: {
        ms: 1500,
        instruction:
          '持续按住桌腿 1.5 秒；中途松开会重新计时。完成后保持低姿，等待晃动结束。',
      },
    },
    attachments: [
      {
        object: 'cushion',
        follows: 'person',
        when: ['protected'],
        unless: ['sheltered'],
        offset: { x: -0.05, y: -0.02, w: 1, h: 0.23 },
      },
      {
        object: 'cushion',
        follows: 'person',
        when: ['sheltered'],
        unless: ['checked'],
        offset: { x: 0.2, y: -0.02, w: 0.42, h: 0.3 },
      },
      {
        object: 'cushion',
        follows: 'person',
        when: ['checked'],
        offset: { x: -0.05, y: -0.02, w: 1, h: 0.23 },
      },
      {
        object: 'shoes',
        follows: 'person',
        when: ['shoes-on'],
        offset: { x: 0, y: 0.89, w: 1.05, h: 0.12 },
      },
      {
        object: 'bag',
        follows: 'person',
        when: ['bag-on'],
        offset: { x: 0.9, y: 0.4, w: 0.55, h: 0.26 },
      },
    ],
  },
  stageSounds: {
    shaking: sound('rumble', 'turn', '低沉震动和家具轻颤的连续环境声', 0.35),
    after: sound('wood', 'place', '晃动停止，阶段转换轻提示', 0.3),
  },
};
export const examplePlan: BatchPlan = {
  format: 'placement-plan-v1',
  id: 'e07-first-trial',
  style: {
    name: '小红花 · 冷调灾害绘本',
    notes:
      '保留纸纹绘本语言；环境冷灰蓝、低饱和、无强烈阳光；前景物品轮廓清晰。同关视角、尺度、阴影方向一致。',
  },
  levels: [e07Plan],
};
