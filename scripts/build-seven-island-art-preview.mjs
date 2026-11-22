import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'outputs/island-level-maps/seven-islands');
const json = file => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
const manifest = json('art-source/island-level-maps/seven-islands.json');
const graph = json('content/journey-map.json');
const existingIds = new Set(graph.regions.flatMap(region => region.nodes.map(node => node.id)));
const draftIds = new Set(json('content/scenes/catalog.json')
  .filter(entry => !entry.enabled && !/^(network|food)-/.test(entry.id)).map(entry => entry.id));
const copy = json('content/journey-copy.json').levels;
const firstAidPreviews = new Set(json('content/journey-first-aid.json').levels
  .map(level => level.id).filter(id => !['first-aid-cpr', 'first-aid-aed'].includes(id)));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const previous = [
  ['network', '04e1049c80a3dcdecdb8931c190937e43b43e710be27c75200a0a74c7bfe2cdf'],
  ['food', 'd54093d2e1a0c341d9704639bdfeb827c506e5487f016c9bb12afed40e744d99'],
];
for (const [id, digest] of previous) {
  assert.equal(hash(readFileSync(path.join(root, `public/levels/journey-map/${id}-v1-handpainted.png`))), digest);
}
const imageHashes = new Set(previous.map(([, digest]) => digest));
const seen = new Set();
assert.deepEqual(manifest.maps.map(map => map.id), ['campus', 'home', 'traffic', 'water', 'emergency', 'social', 'outdoor']);
const maps = manifest.maps.map(map => {
  const file = map.file ?? `${map.id}.png`;
  assert.equal(path.basename(file), file, 'Artwork must be a sibling PNG');
  const bytes = readFileSync(path.join(out, file));
  const width = map.width ?? manifest.width, height = map.height ?? manifest.height;
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', file);
  assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [width, height], file);
  assert.equal(hash(bytes), map.sha256, file);
  assert(!imageHashes.has(map.sha256), `Repeated artwork: ${file}`);
  imageHashes.add(map.sha256);
  if (map.source) {
    assert.equal(hash(readFileSync(path.join(out, map.source.file))), map.source.sha256, 'Original artwork must remain intact');
    for (const [, x, y] of map.stops) assert(Number.isFinite(x) && Number.isFinite(y));
    for (let i = 1; i < map.stops.length; i++) {
      assert(map.stops[i][2] > map.stops[i - 1][2], 'Staggered stations must descend individually');
      assert.notEqual(map.stops[i][1] < 50, map.stops[i - 1][1] < 50, 'Staggered stations must alternate sides');
    }
  }
  return { id: map.id, title: map.title, theme: map.theme, file, width, height, stops: map.stops.map(([id, x, y, landmark]) => {
    assert(!seen.has(id), `Repeated stop: ${id}`);
    seen.add(id);
    assert(existingIds.has(id) || draftIds.has(id), id);
    assert(x >= 10 && x <= 90 && y >= 4 && y <= 95, id);
    const draft = draftIds.has(id);
    const title = draft ? json(`content/scenes/${id}/rules.json`).title : copy[id]?.title;
    assert(title && landmark, id);
    return { id, x, y, title, landmark, preview: draft || firstAidPreviews.has(id) };
  }) };
});
assert.deepEqual([...seen].sort(), [...existingIds, ...draftIds].sort());
const data = JSON.stringify(maps).replaceAll('<', '\\u003c');

const html = `<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>小红花 · 七岛选关地图美术预览</title>
<style>
:root{--ink:#263d35;--muted:#425c52;--paper:#fff7e6;--leaf:#214b3e;--gold:#ffd991;--line:#cbb696;font-family:"Microsoft YaHei","PingFang SC",sans-serif;color:var(--ink);background:#e9e4cf;}
*{box-sizing:border-box}
body{margin:0;background:radial-gradient(ellipse at 0 0,#fff9e8,transparent 48rem),linear-gradient(130deg,#eae0c6,#d6e4d3);}
header,main,footer{width:min(100% - 2rem,64rem);margin-inline:auto}
header{padding:2rem 0 1.1rem}
h1,h2,h3{font-family:KaiTi,"STKaiti",serif;margin:0;line-height:1.2}
h1{font-size:clamp(2rem,5vw,3.4rem)}
.eyebrow{font-size:.8rem;font-weight:800;letter-spacing:.16em;color:#84501e;margin:0 0 .65rem}
p{line-height:1.65}
nav{display:flex;flex-wrap:wrap;gap:.48rem;margin-top:1rem}
button{font:inherit;color:inherit;cursor:pointer}
button:focus-visible,a:focus-visible{outline:3px solid #a44613;outline-offset:3px}
nav button{min-height:44px;padding:.55rem .8rem;border:1px solid var(--line);border-radius:.4rem;background:var(--paper);font-weight:700}
nav button[aria-pressed="true"]{color:var(--paper);border-color:var(--leaf);background:var(--leaf)}
.map-head{display:flex;align-items:start;justify-content:space-between;gap:1rem;border-top:1px solid var(--line);padding:1rem 0}
.map-head p{margin:.4rem 0 0;color:var(--muted)}
.count{color:var(--leaf);font-weight:800;flex:none}
.layout{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,.75fr);align-items:start;gap:1.1rem}
figure{margin:0;min-width:0}
.map{position:relative;aspect-ratio:1/3;box-shadow:0 8px 26px #314b3744;overflow:hidden;background:#ddd1b6}
.map img{display:block;width:100%;height:100%}
.pin{position:absolute;left:var(--x);top:var(--y);transform:translate(-50%,-50%);width:44px;height:44px;border-radius:50%;border:2px solid var(--gold);background:var(--leaf);color:var(--paper);box-shadow:0 2px 6px #151b18aa;font-weight:850}
.pin:hover{background:#733f20}
figcaption,footer{color:var(--muted);font-size:.86rem;padding:.72rem 0}
.legend{padding:1rem;background:var(--paper);border:1px solid var(--line);border-radius:.65rem}
ol{list-style:none;padding:0;margin:.7rem 0 0}
.legend button{width:100%;min-height:49px;text-align:left;border:0;border-top:1px solid #dfd0b7;background:transparent;padding:.45rem .12rem;line-height:1.35}
.legend button:hover{background:#f2e7cd}
.legend small{display:block;margin:.3rem 0 0 2.05em;color:var(--muted)}
.legend b{color:#805224;margin-right:.55em}
dialog{width:min(90vw,26rem);border:1px solid var(--line);border-radius:.7rem;padding:1.2rem;background:var(--paper);color:var(--ink)}
dialog::backdrop{background:#14251eb5}
dialog button{min-height:44px;padding:.4rem .75rem;color:var(--paper);background:var(--leaf);border:0;border-radius:.35rem}
footer a{color:var(--leaf);font-weight:700}
@media(max-width:650px){header,main,footer{width:calc(100% - 1rem)}header{padding-top:1.1rem}.layout{grid-template-columns:1fr}.map-head{gap:.45rem}}
</style>
<header id="top">
  <p class="eyebrow">小红花应急行动 / 地图美术预览</p>
  <h1>七座岛，七张新地图</h1>
  <p>选一座岛，再点画里的编号看对应场景。这里只验看选关地图，不进入游戏、不保存进度。</p>
  <nav aria-label="选择预览地图"></nav>
</header>
<main>
  <div class="map-head"><div><h2 id="map-title"></h2><p id="theme"></p></div><span class="count"></span></div>
  <div class="layout">
    <figure><div class="map"></div><figcaption>编号是预览标记，可独立调整；原始 PNG 不含按钮和文字。</figcaption></figure>
    <aside class="legend" aria-label="地标对应关卡"><h3>从地图上方到下方</h3><ol></ol></aside>
  </div>
</main>
<footer>网络安全岛和食品安全岛沿用上一批产物，不在本预览中重复。 <a href="#top">返回选岛</a></footer>
<dialog aria-labelledby="stop-title" aria-describedby="landmark">
  <p class="eyebrow" id="stop-meta"></p><h2 id="stop-title"></h2><p id="landmark"></p>
  <form method="dialog"><button>返回地图</button></form>
</dialog>
<script>
const maps = ${data};
const find = (selector) => document.querySelector(selector);
const nav = find('nav'), world = find('.map'), legend = find('ol'), dialog = find('dialog');
const ordinal = index => String(index + 1).padStart(2, '0');
function openStop(map, stop, index) {
  dialog.dataset.stop = stop.id;
  find('#stop-meta').textContent = map.title + ' · ' + ordinal(index) + ' · ' + (stop.preview ? '关卡预告' : '原游戏关卡');
  find('#stop-title').textContent = stop.title;
  find('#landmark').textContent = stop.landmark;
  dialog.showModal();
}
function choose(map) {
  find('main').dataset.map = map.id;
  find('#map-title').textContent = map.title;
  find('#theme').textContent = map.theme;
  find('.count').textContent = map.stops.length + ' 处';
  for (const option of nav.children) option.setAttribute('aria-pressed', String(option.dataset.choose === map.id));
  const art = new Image(map.width, map.height);
  art.src = map.file;
  art.alt = map.title + '绘本地图。' + map.theme;
  world.style.aspectRatio = map.width + '/' + map.height;
  world.replaceChildren(art);
  legend.replaceChildren();
  map.stops.forEach((stop, index) => {
    const pin = document.createElement('button');
    pin.className = 'pin';
    pin.dataset.stop = stop.id;
    pin.textContent = ordinal(index);
    pin.setAttribute('aria-label', ordinal(index) + ' ' + stop.title + (stop.preview ? '，关卡预告' : ''));
    pin.style.setProperty('--x', stop.x + '%');
    pin.style.setProperty('--y', stop.y + '%');
    pin.onclick = () => openStop(map, stop, index);
    world.append(pin);
    const row = document.createElement('li');
    const button = document.createElement('button');
    const number = document.createElement('b');
    const detail = document.createElement('small');
    number.textContent = ordinal(index);
    detail.textContent = stop.landmark;
    button.append(number, stop.title, detail);
    button.onclick = () => openStop(map, stop, index);
    row.append(button);
    legend.append(row);
  });
}
for (const map of maps) {
  const button = document.createElement('button');
  button.dataset.choose = map.id;
  button.textContent = map.title;
  button.onclick = () => choose(map);
  nav.append(button);
}
choose(maps[0]);
</script>
</html>
`;

const file = path.join(out, 'index.html');
writeFileSync(file, html);
console.log(JSON.stringify({ file, sha256: hash(html), maps: maps.length, stops: seen.size }, null, 2));
