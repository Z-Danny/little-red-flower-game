import type { LevelConfig } from './types';
import {levelTitle} from './journey/presentation';
import { configuredPackages } from './content/generated';
import { huntPacks } from './scene-hunt/registry';
import { disasterPacks } from './disaster/registry';
import { presentationOf } from './scene-hunt/presentation';
import { assets as kitchenAssets, level as kitchenLevel } from './kitchen/config';
import { assets as typhoonAssets } from './typhoon/config';
import { actions as typhoonActions, level as typhoonLevel, placement as typhoonPlacement, riskCues as typhoonRiskCues, type ActionId } from './typhoon/config';

// Compatibility metadata for the shared level catalog. The layered level owns its rules/art.
const typhoonObjectives: NonNullable<LevelConfig['objectives']> = (Object.keys(typhoonActions) as ActionId[]).map(id => {
  const action = typhoonActions[id];
  const box = typhoonPlacement[id === 'plug' ? 'powerstrip' : id];
  const cue = typhoonRiskCues.find(item => item.goal === id);
  const icon = { plant: 'plant', window: 'window', rail: 'shirt', plug: 'plug', cabinet: 'cabinet', cushion: 'cabinet' } as const;
  const kind = { plant: 'carry-in', window: 'close-window', rail: 'retract-rail', plug: 'unplug', cabinet: 'secure-cabinet', cushion: 'lift-cushion' } as const;
  return { id, label: action.label, icon: icon[id], position: { x: (box.x + box.w / 2) / 7.2, y: (box.y + box.h / 2) / 9.6 },
    resolvedText: action.done, hintText: action.hint, requires: [...action.requires],
    treatment: { kind: kind[id], caption: action.during, durationMs: action.duration },
    riskCue: cue ? { threshold: cue.at, text: cue.text, tone: 'neutral' } : undefined };
});

const builtInLevels: LevelConfig[] = [
  {
    id: 'typhoon-home', engine: 'typhoon-v2', order: 1, kind: 'prevention', title: '台风前的家', shortTitle: '风来之前', location: '客厅 · 阳台',
    knowledge: '台风来临前，及时收回阳台物品，关好门窗，并断开不必要的电源。', task: '找出并处理 5 处台风隐患',
    briefing: '风雨正在靠近。观察客厅和阳台，把可能坠落、进水或漏电的隐患逐一处理。', duration: '约 1 分钟', riskSeconds: typhoonLevel.riskSeconds, accent: '#e95349', sceneRoom: 'living', sceneMood: 'storm', playable: true,
    previewImage: typhoonAssets.room,
    goals: ['plant', 'window', 'rail', 'plug', 'cabinet'],
    objectives: typhoonObjectives,
  },
  {
    id: 'fire-patrol', order: 3, kind: 'prevention', title: '睡前防火巡查', shortTitle: '睡前五分钟', location: '卧室 · 客厅',
    knowledge: '睡前让取暖器远离可燃物，熄灭明火，关闭不必要的电源并保持出口畅通。', task: '排除 4 处睡前火灾隐患',
    briefing: '家人准备休息了。请在关灯之前完成一次快速防火巡查。', duration: '约 40 秒', riskSeconds: 65, accent: '#ee923f', sceneRoom: 'living', sceneMood: 'calm',
    goals: ['heater', 'candle', 'charger', 'exit-clear'],
    objectives: [
      { id: 'heater', label: '靠窗取暖器', icon: 'heater', position: { x: 18, y: 54 }, resolvedText: '取暖器已移离窗帘和沙发。' },
      { id: 'candle', label: '未熄蜡烛', icon: 'flame', position: { x: 50, y: 66 }, resolvedText: '明火已经完全熄灭。' },
      { id: 'charger', label: '闲置充电器', icon: 'plug', position: { x: 78, y: 72 }, resolvedText: '闲置电源已经断开。' },
      { id: 'exit-clear', label: '出口纸箱', icon: 'sandbag', position: { x: 90, y: 78 }, resolvedText: '逃生通道恢复畅通。' },
    ],
  },
  {
    id: 'rainstorm', order: 4, kind: 'prevention', title: '暴雨来临前', shortTitle: '雨夜准备', location: '玄关 · 阳台',
    knowledge: '暴雨来临前封堵低处入口，清理排水口，备好照明并关注预警信息。', task: '完成 4 项家庭防汛准备',
    briefing: '气象台发布了暴雨橙色预警。趁积水还没上涨，把关键准备做完。', duration: '约 55 秒', riskSeconds: 75, accent: '#3d82b2', sceneRoom: 'living', sceneMood: 'storm',
    goals: ['drain', 'door', 'flashlight', 'radio'],
    objectives: [
      { id: 'drain', label: '阳台排水口', icon: 'sink', position: { x: 64, y: 62 }, resolvedText: '落叶已清理，排水恢复顺畅。' },
      { id: 'door', label: '低处门缝', icon: 'sandbag', position: { x: 88, y: 68 }, resolvedText: '防水挡板已经固定。' },
      { id: 'flashlight', label: '应急手电', icon: 'flashlight', position: { x: 31, y: 66 }, resolvedText: '手电电量充足，放在随手可取处。' },
      { id: 'radio', label: '预警广播', icon: 'radio', position: { x: 79, y: 51 }, resolvedText: '已经打开本地预警信息。' },
    ],
  },
  {
    id: 'oil-fire', engine: 'kitchen-v1', order: 2, kind: 'response', title: '厨房着火了', shortTitle: '灶台十秒钟', location: '厨房',
    playable: true, previewImage: kitchenAssets.room,
    knowledge: '油锅起火时，先关火，再用锅盖盖住，切勿直接泼水。', task: '关火、盖锅盖，然后撤到安全处',
    briefing: '油锅突然起火。直接拿取厨房中的物品，点击旋钮关火；危险操作会展示后果，但不会阻止你继续。', duration: `${kitchenLevel.riskSeconds} 秒`, riskSeconds: kitchenLevel.riskSeconds, accent: '#d87c3f', sceneRoom: 'kitchen', sceneMood: 'fire',
    goals: ['gas-off', 'pan-covered', 'evacuated'],
    zones: [
      { id: 'pan', label: '起火油锅', icon: 'flame', position: { x: 30, y: 58 } },
      { id: 'gas-zone', label: '燃气开关', icon: 'gas', position: { x: 24, y: 68 } },
      { id: 'exit-zone', label: '门外安全区', icon: 'exit', position: { x: 90, y: 56 } },
    ],
    items: [
      { id: 'lid-item', label: '锅盖', icon: 'lid', tone: 'safe' }, { id: 'gas-item', label: '关火', icon: 'gas', tone: 'safe' },
      { id: 'water-item', label: '水杯', icon: 'water', tone: 'danger' }, { id: 'cloth-item', label: '湿抹布', icon: 'cloth', tone: 'danger' },
      { id: 'person-item', label: '人物', icon: 'person', tone: 'neutral' },
    ],
    actions: [
      { itemId: 'lid-item', zoneId: 'pan', outcome: 'correct', feedback: '锅盖隔绝空气，火势迅速减弱。', goalId: 'pan-covered' },
      { itemId: 'gas-item', zoneId: 'gas-zone', outcome: 'correct', feedback: '燃气已经关闭，热源停止。', goalId: 'gas-off' },
      { itemId: 'water-item', zoneId: 'pan', outcome: 'danger', feedback: '危险！水会让燃烧的油飞溅，火焰瞬间扩大。' },
      { itemId: 'cloth-item', zoneId: 'pan', outcome: 'danger', feedback: '这块小化纤抹布无法盖严锅口，不适合覆盖火焰。' },
      { itemId: 'person-item', zoneId: 'exit-zone', outcome: 'correct', feedback: '确认火源受控，人物已撤到门外。', goalId: 'evacuated', requires: ['gas-off', 'pan-covered'], blockedText: '先关掉火源并盖好锅盖，再撤离。' },
    ],
  },
  {
    id: 'gas-leak', order: 5, kind: 'response', title: '闻到煤气味', shortTitle: '看不见的危险', location: '厨房 · 楼道',
    knowledge: '发现燃气泄漏，应关闭阀门、开窗通风，禁止开关电器，并到室外求助。', task: '关阀、通风，安全撤离后求助',
    briefing: '厨房里有明显异味。不要制造任何火花，按安全顺序控制危险。', duration: '约 50 秒', riskSeconds: 60, accent: '#7d62a8', sceneRoom: 'kitchen', sceneMood: 'smoke',
    goals: ['valve-off', 'ventilated', 'outside'],
    zones: [
      { id: 'valve-zone', label: '燃气阀门', icon: 'gas', position: { x: 28, y: 65 } },
      { id: 'window-zone', label: '厨房窗户', icon: 'window', position: { x: 56, y: 31 } },
      { id: 'hall-zone', label: '室外安全区', icon: 'exit', position: { x: 90, y: 56 } },
    ],
    items: [
      { id: 'valve-item', label: '关闭阀门', icon: 'gas', tone: 'safe' }, { id: 'window-item', label: '打开窗户', icon: 'window', tone: 'safe' },
      { id: 'switch-item', label: '开排风扇', icon: 'spark', tone: 'danger' }, { id: 'phone-item', label: '室内打电话', icon: 'phone', tone: 'danger' },
      { id: 'leave-item', label: '撤到室外', icon: 'person', tone: 'neutral' },
    ],
    actions: [
      { itemId: 'valve-item', zoneId: 'valve-zone', outcome: 'correct', feedback: '阀门已关闭，燃气不再继续泄漏。', goalId: 'valve-off' },
      { itemId: 'window-item', zoneId: 'window-zone', outcome: 'correct', feedback: '窗户打开，保持自然通风。', goalId: 'ventilated' },
      { itemId: 'switch-item', zoneId: 'window-zone', outcome: 'danger', feedback: '危险！开关电器可能产生火花，引燃燃气。' },
      { itemId: 'phone-item', zoneId: 'valve-zone', outcome: 'danger', feedback: '先到室外安全处，再拨打电话求助。' },
      { itemId: 'leave-item', zoneId: 'hall-zone', outcome: 'correct', feedback: '已安全撤到室外，可以联系专业人员。', goalId: 'outside', requires: ['valve-off', 'ventilated'], blockedText: '先关闭阀门并打开窗户，再撤离。' },
    ],
  },
  {
    id: 'scald', order: 6, kind: 'response', title: '手被烫伤了', shortTitle: '冷静五步法', location: '厨房 · 水池',
    knowledge: '轻度烫伤应立即用流动凉水冲洗，去除饰物，再用干净敷料覆盖；不要涂牙膏。', task: '完成冲、脱、盖三步初步处理',
    briefing: '热汤洒到了手上。把合适的处理物品拖到对应位置，别使用民间偏方。', duration: '约 60 秒', riskSeconds: 80, accent: '#2aa189', sceneRoom: 'aid', sceneMood: 'calm',
    goals: ['cooled', 'ring-off', 'covered'],
    zones: [
      { id: 'hand-zone', label: '烫伤部位', icon: 'hand', position: { x: 48, y: 58 } },
      { id: 'sink-zone', label: '流动凉水', icon: 'sink', position: { x: 39, y: 42 } },
      { id: 'tray-zone', label: '置物处', icon: 'ring', position: { x: 70, y: 67 } },
    ],
    items: [
      { id: 'hand-item', label: '受伤的手', icon: 'hand', tone: 'safe' }, { id: 'ring-item', label: '摘下戒指', icon: 'ring', tone: 'safe' },
      { id: 'gauze-item', label: '干净纱布', icon: 'gauze', tone: 'safe' }, { id: 'paste-item', label: '牙膏', icon: 'toothpaste', tone: 'danger' },
      { id: 'ice-item', label: '冰块', icon: 'water', tone: 'danger' },
    ],
    actions: [
      { itemId: 'hand-item', zoneId: 'sink-zone', outcome: 'correct', feedback: '用流动凉水持续冲洗，帮助带走热量。', goalId: 'cooled' },
      { itemId: 'ring-item', zoneId: 'tray-zone', outcome: 'correct', feedback: '饰物已取下，避免肿胀后卡住。', goalId: 'ring-off' },
      { itemId: 'gauze-item', zoneId: 'hand-zone', outcome: 'correct', feedback: '已经用干净敷料轻轻覆盖。', goalId: 'covered', requires: ['cooled', 'ring-off'], blockedText: '先充分冲洗并去除饰物，再覆盖伤处。' },
      { itemId: 'paste-item', zoneId: 'hand-zone', outcome: 'danger', feedback: '不要涂牙膏，会污染创面并影响医生判断。' },
      { itemId: 'ice-item', zoneId: 'hand-zone', outcome: 'danger', feedback: '不要让冰块直接接触伤处，以免造成冻伤。' },
    ],
  },
];

export const getPackage = (id: string) => configuredPackages.find(pack => pack.rules.id === id);
const additionalHunts: LevelConfig[] = huntPacks.filter(p=>!builtInLevels.some(l=>l.id===p.rules.id)).map(p=>({
  id:p.rules.id, engine:'scene-hunt', order:p.rules.order, kind:'prevention', title:p.rules.title, shortTitle:p.rules.title,
  location:presentationOf(p).location, knowledge:p.rules.summary, task:presentationOf(p).opening,
  briefing:presentationOf(p).preview, duration:'从容观察 · 不限时', riskSeconds:p.rules.seconds, accent:'#d39559',
  sceneRoom:'living', sceneMood:'calm', goals:p.rules.targets.map(t=>t.id), playable:true, previewImage:p.skin.scene,
}));
const additionalDisasters:LevelConfig[]=disasterPacks.map(({rules:r,skin:s})=>({id:r.id,engine:'disaster-v1',order:r.order,kind:r.kind,title:r.title,shortTitle:r.title,location:r.kind==='prevention'?'街道 · 社区':'住宅 · 楼梯',knowledge:r.summary,task:r.opening,briefing:r.safety,duration:r.kind==='prevention'?'限时 90 秒':'约 2 分钟',riskSeconds:r.seconds,accent:'#d27a45',sceneRoom:'living',sceneMood:'storm',goals:r.goals.map(g=>g.id),playable:true,previewImage:s.scene}));
export const levels: LevelConfig[] = [...builtInLevels, ...additionalHunts, ...additionalDisasters, ...configuredPackages.map(({ rules: r, skin: s }): LevelConfig => ({
  id: r.id, engine: 'configured-v1', order: r.order, kind: r.kind, title: r.title, shortTitle: r.title,
  location: r.location, knowledge: r.completion.summary, task: r.description, briefing: r.description,
  duration: r.risk.mode === 'elapsed' ? '从容练习 · 不限时' : `约 ${r.risk.seconds} 秒`, riskSeconds: r.risk.seconds, accent: '#d7784e', sceneRoom: r.kind === 'prevention' ? 'living' : 'kitchen',
  sceneMood: r.kind === 'prevention' ? 'storm' : 'fire', goals: r.goals.filter(g => g.showTarget !== false).map(g => g.id),
  playable: true, previewImage: s.assets[s.background].src,
}))].map(level => ({...level, title:levelTitle(level.id,level.title)}));
export const getLevel = (id: string) => levels.find((level) => level.id === id);

function validateLevels(configs: LevelConfig[]) {
  const levelIds = new Set<string>();
  for (const level of configs) {
    if (levelIds.has(level.id)) throw new Error(`Duplicate level id: ${level.id}`);
    levelIds.add(level.id);
    if (level.engine === 'configured-v1' || level.engine === 'scene-hunt' || level.engine === 'disaster-v1') continue; // Full data validation happens at package registration.
    const goals = new Set(level.goals);
    if (goals.size !== level.goals.length) throw new Error(`Duplicate goal in ${level.id}`);
    if (level.kind === 'prevention') {
      const objectiveIds = new Set((level.objectives ?? []).map((item) => item.id));
      for (const goal of goals) if (!objectiveIds.has(goal)) throw new Error(`Missing objective ${goal}`);
    } else {
      const items = new Set((level.items ?? []).map((item) => item.id));
      const zones = new Set((level.zones ?? []).map((zone) => zone.id));
      const produced = new Set<string>();
      for (const action of level.actions ?? []) {
        if (!items.has(action.itemId) || !zones.has(action.zoneId)) throw new Error(`Invalid action in ${level.id}`);
        if (action.goalId) produced.add(action.goalId);
      }
      for (const goal of goals) if (!produced.has(goal)) throw new Error(`Unreachable goal ${goal}`);
    }
  }
}

validateLevels(levels);
