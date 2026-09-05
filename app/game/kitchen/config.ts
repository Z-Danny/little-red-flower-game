/** Art, placement and timing are independent of the state machine. Logical pixels. */
// Background is 720 × 960; the unused bottom 110px of floor is outside the viewport.
export const WORLD = { width: 720, height: 850 } as const;
export const assets = {
  room: '/levels/kitchen-v1/room.png', pan: '/levels/kitchen-v1/pan.png',
  lid: '/levels/kitchen-v1/lid.png', water: '/levels/kitchen-v1/water.png',
  cloth: '/levels/kitchen-v1/cloth.png', extinguisher: '/levels/kitchen-v1/extinguisher.png',
  gas: '/levels/kitchen-v1/gas.png', plate: '/levels/kitchen-v1/plate.png', knife: '/levels/kitchen-v1/knife.png',
  flame: '/levels/kitchen-v1/flame.png', worried: '/levels/kitchen-v1/worried.png',
  panicked: '/levels/kitchen-v1/panicked.png', focused: '/levels/kitchen-v1/focused.png', relieved: '/levels/kitchen-v1/relieved.png',
} as const;
export type AssetId = keyof typeof assets;
export type ItemId = 'lid' | 'gas' | 'person' | 'water' | 'cloth' | 'extinguisher' | 'plate' | 'knife';
export type ZoneId = 'pan' | 'off' | 'exit' | 'miss';
export type GoalId = 'covered' | 'gasOff' | 'evacuated';
export type Emotion = 'worried' | 'panicked' | 'focused' | 'relieved';
export type Point = { x: number; y: number };
export type Box = Point & { w: number; h: number };
export const level = {
  id: 'oil-fire', title: '厨房着火了', riskSeconds: 85,
  summary: '油锅起火时，先关火，再用锅盖盖住，切勿直接泼水。',
  safety: '这是初起油锅火的模拟训练。现实中若火势失控，请立即撤离并拨打 119；儿童不要尝试灭火。',
  cooling: '火灭后保持锅盖覆盖，等待充分冷却，不要急着揭盖。',
} as const;
export const items: Record<ItemId, { label: string; asset: AssetId; w: number; h: number; detail: string }> = {
  lid: { label: '锅盖', asset: 'lid', w: 200, h: 93, detail: '拖到油锅上，完整盖住锅口' },
  gas: { label: '燃气开关', asset: 'gas', w: 73, h: 73, detail: '点击后原位旋转关闭' },
  person: { label: '人物', asset: 'worried', w: 170, h: 352, detail: '关火、盖锅盖后，拖到门外安全区' },
  water: { label: '水杯', asset: 'water', w: 94, h: 83, detail: '油锅起火不能泼水' },
  cloth: { label: '小湿抹布', asset: 'cloth', w: 112, h: 63, detail: '本关为小块化纤抹布，不能完整盖住锅口' },
  extinguisher: { label: '灭火器', asset: 'extinguisher', w: 84, h: 137, detail: '本关为厨房适用型，练习对准火焰根部' },
  plate: { label: '餐盘', asset: 'plate', w: 111, h: 65, detail: '无关物品，不能代替匹配的锅盖' },
  knife: { label: '菜刀', asset: 'knife', w: 95, h: 94, detail: '无关物品，不能用来灭火' },
};
export const trayItems: ItemId[] = ['lid', 'water', 'cloth', 'extinguisher', 'plate', 'knife'];
export const goals: { id: GoalId; label: string; item: ItemId }[] = [
  { id: 'gasOff', label: '关闭火源', item: 'gas' },
  { id: 'covered', label: '盖住油锅', item: 'lid' },
  { id: 'evacuated', label: '安全撤离', item: 'person' },
];
export const layout = {
  pan: { x: 87, y: 390, w: 267, h: 94 },
  lid: { x: 87, y: 376, w: 193, h: 80 },
  gas: { x: 180, y: 505, w: 73, h: 73 },
  person: { x: 344, y: 282, w: 310, h: 470 },
  evacuated: { x: 490, y: 275, w: 207, h: 324 },
  flame: { x: 103, y: 238, w: 168, h: 202 },
  // Drop regions are intentionally explicit, not inferred from PNG rectangles.
  zones: {
    pan: { x: 75, y: 370, w: 285, h: 130 },
    off: { x: 277, y: 506, w: 101, h: 73 },
    exit: { x: 520, y: 335, w: 142, h: 300 },
  },
} satisfies Record<string, unknown>;
export const timing = { lid: 1000, gas: 800, person: 1200, wrong: 1050, bounce: 450, spray: 950, settling: 1800, reaction: 2500 } as const;
export const emotionLabels: Record<Emotion, string> = {
  worried: '紧张 · 需要你的帮助', panicked: '惊慌 · 火势正在威胁安全', focused: '镇定一些 · 做对了', relieved: '安心 · 处置已完成',
};
