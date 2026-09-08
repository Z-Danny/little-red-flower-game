import skin from '../../../content/presets/kitchen/skin.json';
/** Art, placement and timing are independent of the state machine. Logical pixels. */
// Full room includes a foreground prep counter; all tools live in this coordinate space.
export const WORLD = skin.WORLD;
export const assets = skin.assets;
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
export const sceneItems = ['lid', 'water', 'cloth', 'extinguisher', 'plate', 'knife'] as const;
export type SceneItemId = typeof sceneItems[number];
export const goals: { id: GoalId; label: string; item: ItemId }[] = [
  { id: 'gasOff', label: '关闭火源', item: 'gas' },
  { id: 'covered', label: '盖住油锅', item: 'lid' },
  { id: 'evacuated', label: '安全撤离', item: 'person' },
];
export const layout = skin.layout;
export const cameraSafe = skin.cameraSafe;
export const timing = { lid: 1000, gas: 800, person: 1200, wrong: 1050, bounce: 450, spray: 950, settling: 1800, reaction: 2500 } as const;
export const emotionLabels: Record<Emotion, string> = {
  worried: '紧张 · 需要你的帮助', panicked: '惊慌 · 火势正在威胁安全', focused: '镇定一些 · 做对了', relieved: '安心 · 处置已完成',
};
