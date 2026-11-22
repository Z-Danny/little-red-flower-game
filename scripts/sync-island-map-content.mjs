import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = file => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
const source = read('art-source/island-level-maps/seven-islands.json');
const originalIds = new Set(read('content/journey-map.json').regions.flatMap(region => region.nodes.map(node => node.id)));
const drafts = new Set(read('content/scenes/catalog.json').filter(entry => !entry.enabled).map(entry => entry.id));
const copy = read('content/journey-copy.json').levels;
// Entrance surveys keep the return corner and neighboring title cards clear.
const landings = {
  'home-food-storage-v1': [65, 91],
  'first-aid-fainting': [24, 76.5],
};
const maps = source.maps.map(map => {
  const revision = map.file?.includes('staggered-v2') ? 'v2-staggered' : 'v1';
  return {
    id: map.id, name: map.title,
    image: `/levels/journey-map/${map.id}-island-${revision}.png`,
    width: map.width ?? source.width, height: map.height ?? source.height,
    sha256: map.sha256,
    stops: map.stops.map(([id, x, y, preview]) => ({
      id,
      title: drafts.has(id) ? read(`content/scenes/${id}/rules.json`).title : copy[id].title,
      preview,
      placeholder: drafts.has(id),
      x: Math.round((landings[id]?.[0] ?? x) * (map.width ?? source.width) / 100),
      y: Math.round(Math.min(landings[id]?.[1] ?? y, 94) * (map.height ?? source.height) / 100),
    })),
  };
});
const previous = [
  {
    id: 'network', name: '网络安全', image: '/levels/journey-map/network-v1-handpainted.png',
    sha256: '04e1049c80a3dcdecdb8931c190937e43b43e710be27c75200a0a74c7bfe2cdf',
    stops: [
      ['network-chat-privacy-v1', 371, 454, '在聊天小屋识别索取住址、学校等个人信息的模拟消息。'],
      ['network-link-check-v1', 378, 772, '在核验亭辨认未经核实的通知，再选择从已知官方入口核实。'],
      ['network-account-check-v1', 398, 1076, '在锁盒小屋识别虚构设置中的密码和验证码风险。'],
      ['network-device-share-v1', 323, 1392, '在图书角查看模拟共用终端，学会退出自己的账号。'],
      ['network-purchase-check-v1', 389, 1710, '在游戏小铺识别可疑充值退款消息，不点击、不付款。'],
      ['network-message-check-v1', 471, 2040, '在公告亭对照学校公告和群聊消息，未经核实先不转。'],
    ],
  },
  {
    id: 'food', name: '食品安全', image: '/levels/journey-map/food-v1-handpainted.png',
    sha256: 'd54093d2e1a0c341d9704639bdfeb827c506e5487f016c9bb12afed40e744d99',
    stops: [
      ['food-table-check-v1', 409, 416, '在团圆餐厅辨认合餐时的卫生问题，对比分餐和公筷公勺。'],
      ['food-fridge-check-v1', 345, 737, '在冷藏小屋观察生熟食物有没有分开存放。'],
      ['food-market-check-v1', 398, 1047, '在市集比较食品包装、标签和保质期。'],
      ['food-picnic-check-v1', 274, 1340, '在野餐棚看物资卡和保存记录，选安全的食物与饮水。'],
      ['food-leftovers-check-v1', 437, 1668, '在剩菜厨房对比保存记录，不靠闻或尝来判断。'],
      ['food-school-lunch-check-v1', 471, 2034, '在学校食堂检查模拟餐盒封装和食用时限。'],
    ],
  },
];
for (const map of previous) maps.push({
  ...map, width: 724, height: 2172,
  stops: map.stops.map(([id, x, y, preview]) => ({
    id, title: read(`content/scenes/${id}/rules.json`).title, preview, placeholder: true, x, y,
  })),
});
const order = ['campus', 'home', 'traffic', 'water', 'network', 'emergency', 'social', 'food', 'outdoor'];
maps.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
// Number from the lowest surveyed entrance upward without moving any house or changing unlocks.
for (const map of maps) map.stops.sort((a, b) => b.y - a.y || a.x - b.x);
const ids = maps.flatMap(map => map.stops.map(stop => stop.id));
assert.deepEqual(maps.map(map => map.id), order);
assert.equal(new Set(ids).size, ids.length, 'A level can only appear on one island');
assert.deepEqual([...ids].sort(), [...originalIds, ...drafts].sort(), 'Every original node and draft must appear');
for (const map of maps) {
  const bytes = readFileSync(path.join(root, 'public', map.image));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), map.sha256, map.id);
  assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [map.width, map.height], map.id);
  for (const stop of map.stops) {
    assert.equal(stop.placeholder, drafts.has(stop.id), stop.id);
    assert(stop.x > 0 && stop.x < map.width && stop.y > 0 && stop.y < map.height, stop.id);
  }
}
writeFileSync(path.join(root, 'content/island-level-maps.json'), JSON.stringify({ version: 2, direction: 'bottom-to-top', maps }, null, 2) + '\n');
console.log(`Synced ${maps.length} island maps, ${ids.length} stops, ${drafts.size} disabled placeholders.`);
