import { journeyMap, nodeStatus, type Progress } from './progress';

export type ArchipelagoSound = 'select' | 'land';
export const archipelagoArt = {
  entry: '/ui/archipelago-v1/entry-island.png',
  sky: '/ui/archipelago-v1/sky-background.png',
  cloud: '/ui/archipelago-v1/cloud.png',
  plaque: '/ui/archipelago-v1/wood-plaque.png',
} as const;

// One presentation-only assignment per stable level ID. Rules, prerequisites and
// saved scores remain owned by the original journey map and level packages.
// Literal paths are required by the self-contained HTML asset exporter.
export const archipelagoIslands = [
  { id: 'campus', name: '校园安全', art: '/ui/archipelago-nine-v1/01-campus-signed.png',
    description: '从课间小意外开始，学习照顾自己和同伴。',
    levelIds: ['first-aid-abrasion', 'first-aid-nosebleed'] },
  { id: 'home', name: '居家安全', art: '/ui/archipelago-nine-v1/02-home-signed.png',
    description: '留心厨房、充电和用火，让每一天安心回家。',
    levelIds: ['oil-fire', 'charging-bedroom', 'bedroom-night-check-v2', 'kitchen-before-cooking-v2', 'fire-shelter-practice', 'fire-stairs-practice', 'first-aid-burn'] },
  { id: 'traffic', name: '交通安全', art: '/ui/archipelago-nine-v1/03-traffic-signed.png',
    description: '观察街道路况，识别风雨与塌陷带来的危险。',
    levelIds: ['storm-street-check-v2', 'collapse-signal-practice'] },
  { id: 'water', name: '防溺水安全', art: '/ui/archipelago-nine-v1/04-water-signed.png',
    description: '认识涉水风险，练习车辆落水时的应对。',
    levelIds: ['car-window-practice'] },
  { id: 'network', name: '网络安全', art: '/ui/archipelago-nine-v1/05-network-signed.png',
    description: '守护个人信息，安全探索数字世界。', levelIds: [] },
  { id: 'emergency', name: '应急防灾', art: '/ui/archipelago-nine-v1/06-emergency-signed.png',
    description: '从灾前准备到避险与急救，一步一步学习应对。',
    levelIds: ['typhoon-home', 'flood-kit', 'quake-bedroom-v2', 'rain-street-preparation-v1', 'flood-house-response-v1', 'quake-cover-practice', 'quake-exit-practice', 'flood-highground-practice', 'first-aid-fainting', 'first-aid-airway', 'first-aid-cpr', 'first-aid-aed'] },
  { id: 'social', name: '人身社会安全', art: '/ui/archipelago-nine-v1/07-social-signed.png',
    description: '留心公共空间，遇到危险学会安全求助。',
    levelIds: ['clear-corridor', 'lift-wait', 'well-call', 'clear-corridor-check-v2', 'lift-contact-practice'] },
  { id: 'food', name: '食品安全', art: '/ui/archipelago-nine-v1/08-food-signed.png',
    description: '认识食材与饮食卫生，守护餐桌上的安全。', levelIds: [] },
  { id: 'outdoor', name: '文旅户外安全', art: '/ui/archipelago-nine-v1/09-outdoor-signed.png',
    description: '走进公园与山林，留意天气、火源和脚下。',
    levelIds: ['thunder-park-v2', 'forest-fire-sources-v2', 'first-aid-sprain'] },
] as const;
export type ArchipelagoCategoryId = (typeof archipelagoIslands)[number]['id'];
export function archipelagoCategory(id: string) {
  return archipelagoIslands.find(island => island.id === id) ?? archipelagoIslands[0];
}
export function islandForLevel(levelId: string) {
  return archipelagoIslands.find(island => (island.levelIds as readonly string[]).includes(levelId));
}
export function archipelagoDestinationId(categoryId: string, completed: Progress): string | null {
  const island = archipelagoIslands.find(item => item.id === categoryId);
  if (!island) return null;
  return island.levelIds.find(id => nodeStatus(id, completed) === 'available') ?? island.levelIds[0] ?? null;
}
export function islandNodes(categoryId: string) {
  const island = archipelagoIslands.find(item => item.id === categoryId);
  const nodes = journeyMap.regions.flatMap(region => region.nodes);
  return (island?.levelIds ?? []).map(id => nodes.find(node => node.id === id)!);
}
