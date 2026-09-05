/** Art placement uses a stable 720 × 960 design space, never viewport pixels. */
export type Rect = { x: number; y: number; w: number; h: number };
export type GoalId = 'plant' | 'window' | 'rail' | 'plug' | 'cabinet';
export type ActionId = GoalId | 'cushion';
export type AssetId = keyof typeof assets;

export const WORLD = { width: 720, height: 960 } as const;
export const assets = {
  room: '/levels/typhoon-v2/room.png',
  plant: '/levels/typhoon-v2/plant.png',
  window: '/levels/typhoon-v2/window.png',
  rail: '/levels/typhoon-v2/rail.png',
  cabinet: '/levels/typhoon-v2/cabinet.png',
  umbrella: '/levels/typhoon-v2/umbrella.png',
  cushion: '/levels/typhoon-v2/cushion.png',
  powerstrip: '/levels/typhoon-v2/powerstrip.png',
  plug: '/levels/typhoon-v2/plug.png',
  cable: '/levels/typhoon-v2/cable.png',
  socket: '/levels/typhoon-v2/socket.png',
  latchOpen: '/levels/typhoon-v2/latch-open.png',
  latchClosed: '/levels/typhoon-v2/latch-closed.png',
  strap: '/levels/typhoon-v2/strap.png',
  familyStanding: '/levels/typhoon-v2/family-standing.png',
  familySeated: '/levels/typhoon-v2/family-seated.png',
} as const;

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
export const placement = {
  window: { x: 352, y: 101, w: 211, h: 400 },
  windowClosed: { x: 133, y: 101, w: 222, h: 400 },
  outside: { x: 137, y: 112, w: 419, h: 380 },
  rainEntry: { x: 138, y: 390, w: 220, h: 250 },
  rail: { x: 157, y: 173, w: 196, h: 138 },
  railSafe: { x: 158, y: 252, w: 211, h: 149 },
  plant: { x: 223, y: 339, w: 101, h: 112 },
  plantSafe: { x: 485, y: 714, w: 115, h: 128 },
  umbrella: { x: 282, y: 392, w: 107, h: 108 },
  cabinet: { x: 600, y: 337, w: 98, h: 240 },
  drawer: { x: 605, y: 580, w: 88, h: 90 },
  strap: { x: 587, y: 449, w: 75, h: 23 },
  powerstrip: { x: 111, y: 722, w: 109, h: 41 },
  powerstripSafe: { x: 26, y: 798, w: 98, h: 37 },
  socket: { x: 323, y: 610, w: 36, h: 36 },
  plug: { x: 318, y: 613, w: 44, h: 42 },
  plugSafe: { x: 147, y: 767, w: 40, h: 38 },
  cushion: { x: 76, y: 709, w: 153, h: 80 },
  cushionSafe: { x: 48, y: 666, w: 146, h: 76 },
  family: { x: 366, y: 422, w: 152, h: 362 },
  familySafe: { x: 78, y: 449, w: 177, h: 310 },
} satisfies Record<string, Rect>;

/** Image-space anchors and game-only status colours; no physics is inferred from art. */
export const powerVisuals = {
  disconnectAt: .44,
  insertedVisibleWidth: .735,
  withdrawalDistance: 44,
  indicator: { x: .846, y: .345, w: .058, h: .18 },
  connected: { color: '#36ce7a', glow: '#70ee9e', label: '已接通' },
  disconnected: { color: '#ed5948', glow: '#f98970', label: '已断开' },
  // These anchors describe the actual endpoints of the existing transparent PNGs.
  boardCableAnchor: { x: .99, y: .56 },
  plugCableAnchor: { x: .25, y: .972 },
  cableStart: { x: .0073, y: .874 },
  cableEnd: { x: .991, y: .02 },
} as const;

export const riskCues = [
  { at: 36, goal: 'plant', text: '风变大了，窗台上的花盆开始晃动。' },
  { at: 62, goal: 'window', text: '雨水正从敞开的窗户飘进来。' },
  { at: 82, goal: 'cabinet', text: '风吹得柜门摇晃，及时把它固定好。' },
] as const;
