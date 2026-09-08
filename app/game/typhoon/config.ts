import skin from '../../../content/presets/typhoon/skin.json';
/** Art placement uses a stable 720 × 960 design space, never viewport pixels. */
export type Rect = { x: number; y: number; w: number; h: number };
export type GoalId = 'plant' | 'window' | 'rail' | 'plug' | 'cabinet';
export type ActionId = GoalId | 'cushion';
export type AssetId = keyof typeof assets;

export const WORLD = skin.WORLD;
export const assets = skin.assets;

export const level = {
  id: 'typhoon-home', title: '台风前的家', riskSeconds: 95,
  summary: '台风来临前，及时收回阳台物品，关好门窗，并断开不必要的电源。',
  safetyNote: '台风前完成准备；风雨已很大时，不要冒险到室外收物。电器进水后切勿触碰。',
  settleMs: 2800,
} as const;

export const goals: readonly GoalId[] = ['plant', 'window', 'rail', 'plug', 'cabinet'];
export type ActionConfig = {
  id: ActionId; label: string; sprite: AssetId; duration: number;
  during: string; done: string; hint: string; requires: readonly ActionId[];
};
export const actions: Record<ActionId, ActionConfig> = {
  plant: { id: 'plant', label: '花盆', sprite: 'plant', duration: 1100, requires: [], during: '把花盆搬回室内', done: '花盆已搬回室内，不再有坠落风险。', hint: '看看左侧窗台，红色花盆还放在外面。' },
  window: { id: 'window', label: '窗户', sprite: 'window', duration: 1200, requires: [], during: '关窗，再扣好窗锁', done: '窗户已经关好并上锁，雨水不再飘入。', hint: '窗户左半边还开着，检查右侧可滑动的窗扇。' },
  rail: { id: 'rail', label: '晾衣杆', sprite: 'rail', duration: 1000, requires: [], during: '收回晾衣杆和衣物', done: '晾衣杆已收回，衣物不再被风吹动。', hint: '白色衣服挂在窗外的哪件物品上？' },
  plug: { id: 'plug', label: '插线板', sprite: 'powerstrip', duration: 1250, requires: ['cushion'], during: '拔掉插头，状态灯变红后收好', done: '插头已拔下，状态灯由绿变红表示断开，插线板已收到侧边。', hint: '绿灯表示电源接通。先移开坐垫，再点击插线板拔掉插头。' },
  cabinet: { id: 'cabinet', label: '柜门', sprite: 'cabinet', duration: 1100, requires: [], during: '合上柜门，扣紧固定带', done: '柜门已合上并固定。易倾倒的家具也应提前固定牢靠。', hint: '右侧高柜：需要处理的是大柜门，不是下面的小抽屉。' },
  cushion: { id: 'cushion', label: '沙发坐垫', sprite: 'cushion', duration: 750, requires: [], during: '拿开并收起坐垫', done: '坐垫已收好。找到插线板了，点击它断开电源。', hint: '点击沙发前沿滑落的青色坐垫。', },
};

/** Only this table needs editing after replacing art or changing the room layout. */
export const placement = skin.placement;

/** Image-space anchors and game-only status colours; no physics is inferred from art. */
export const powerVisuals = skin.powerVisuals;

export const riskCues = [
  { at: 36, goal: 'plant', text: '风变大了，窗台上的花盆开始晃动。' },
  { at: 62, goal: 'window', text: '雨水正从敞开的窗户飘进来。' },
  { at: 82, goal: 'cabinet', text: '风吹得柜门摇晃，及时把它固定好。' },
] as const;
