// Read-only coordinate overlay; the game and preview consume the same surveyed route data.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { dependency, root } from './lib/dependencies.mjs';

const regionId = process.argv[2] || 'home';
const map = JSON.parse(
  fs.readFileSync(path.join(root, 'content/journey-map.json')),
);
const routes = JSON.parse(
  fs.readFileSync(path.join(root, 'content/journey-routes.json')),
);
const copy = JSON.parse(
  fs.readFileSync(path.join(root, 'content/journey-copy.json')),
);
const region = map.regions.find((r) => r.id === regionId);
const route = routes.regions[regionId];
if (
  !region ||
  !route ||
  route.image !== region.image ||
  route.width !== region.width ||
  route.height !== region.height
)
  throw new Error('No matching route annotation');
const built = await dependency('esbuild').build({
  absWorkingDir: root,
  entryPoints: ['app/game/journey/routes.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'silent',
});
const { roadPath } = await import(
  `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`
);
const art = fs.readFileSync(path.join(root, 'public', region.image));
const sha256 = createHash('sha256').update(art).digest('hex');
const output = path.join(root, 'outputs', `${regionId}-map-alignment`);
fs.mkdirSync(output, { recursive: true });
const escape = (text) =>
  String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('"', '&quot;');
const grid =
  Array.from(
    { length: Math.ceil(region.height / 100) },
    (_, i) =>
      `<path d="M0 ${i * 100}H${region.width}"/><text x="4" y="${i * 100 + 15}">${i * 100}</text>`,
  ).join('') +
  Array.from(
    { length: Math.ceil(region.width / 100) },
    (_, i) => `<path d="M${i * 100} 0V${region.height}"/>`,
  ).join('');
const lines = route.segments
  .map(
    (s) =>
      `<path class="route" d="${roadPath(s.points)}"/>${s.points.map(([x, y]) => `<circle class="point" cx="${x}" cy="${y}" r="3"><title>${x}, ${y}</title></circle>`).join('')}`,
  )
  .join('');
const flowers = region.nodes
  .map(
    (n, i) =>
      `<g><circle class="node" cx="${n.x}" cy="${n.y}" r="12"/><text class="number" x="${n.x}" y="${n.y + 5}">${i + 1}</text><text class="coord" x="${n.x + 18}" y="${n.y + 5}">(${n.x}, ${n.y})</text></g>`,
  )
  .join('');
const rows = region.nodes
  .map(
    (n, i) =>
      `<tr><td>${i + 1}</td><td>${escape(copy.levels[n.id].title)}</td><td>${n.x}, ${n.y}</td><td>${n.signSide === 'left' ? '左侧' : '右侧'}</td><td>${escape(n.place)}</td></tr>`,
  )
  .join('');
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${region.name} · 道路坐标标注</title><style>
*{box-sizing:border-box}body{margin:0;background:#f4f0e7;color:#28423b;font:15px/1.7 system-ui}main{display:grid;grid-template-columns:minmax(320px,720px) minmax(320px,1fr);max-width:1280px;margin:auto;gap:24px}.map{position:relative;line-height:0}svg{width:100%;height:auto}aside{padding:24px;align-self:start;position:sticky;top:0}h1{font-size:23px;margin:0 0 12px}p{margin:12px 0}table{border-collapse:collapse;width:100%;font-size:13px}td,th{padding:9px 5px;text-align:left;border-bottom:1px solid #cecabc}code{overflow-wrap:anywhere;font-size:11px}.grid path{stroke:#172d3660;stroke-width:1}.grid text{fill:#172d36;font-size:13px;paint-order:stroke;stroke:white;stroke-width:3px}.route{fill:none;stroke:#007b91;stroke-width:4}.point{fill:#ffdf68;stroke:#007b91;stroke-width:1.2}.node{fill:#bb3548;stroke:#fff;stroke-width:3}.number{fill:white;text-anchor:middle;font-weight:800;font-size:14px}.coord{font-weight:700;font-size:17px;fill:#9c2138;paint-order:stroke;stroke:#fff8e8;stroke-width:4px}.hide-grid .grid,.hide-points .point{display:none}label{display:block;margin:10px 0}output{display:block;font:700 18px monospace;padding:10px;background:#e2e9dd}@media(max-width:850px){main{display:flex;flex-direction:column-reverse}aside{position:static;padding:18px}.map{width:100%}}
</style><main><div class="map"><svg id="map" viewBox="0 0 ${region.width} ${region.height}"><image width="${region.width}" height="${region.height}" preserveAspectRatio="none" href="data:image/png;base64,${art.toString('base64')}"/><g class="grid">${grid}</g><g>${lines}</g><g>${flowers}</g></svg></div><aside><h1>${region.name}<br>道路与节点坐标标注</h1><p>蓝线：按底图标注的道路中心线<br>黄点：道路采样点 · 红点：花朵接地位置<br>顺序从地图底部向上。</p><label><input id="grid" type="checkbox" checked> 显示 100 单位网格</label><label><input id="points" type="checkbox" checked> 显示道路采样点</label><output id="position">点击地图查看坐标</output><p>坐标原点位于左上角，逻辑画布 ${region.width} × ${region.height}；使用与游戏一致的图片缩放。点击仅查看坐标，不修改配置。</p><table><thead><tr><th>#</th><th>关卡</th><th>花位 x,y</th><th>标牌</th><th>地物</th></tr></thead><tbody>${rows}</tbody></table><p>底图 SHA-256<br><code>${sha256}</code></p><p>数据：content/journey-routes.json<br>节点：content/journey-map.json</p></aside></main><script>
const svg=document.getElementById('map');svg.addEventListener('click',e=>{const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse());document.getElementById('position').textContent='x: '+Math.round(p.x)+' · y: '+Math.round(p.y)});for(const name of ['grid','points'])document.getElementById(name).addEventListener('change',e=>svg.classList.toggle('hide-'+name,!e.target.checked));
</script></html>`;
const file = path.join(output, '道路坐标标注.html');
fs.writeFileSync(file, html);
console.log(file);
