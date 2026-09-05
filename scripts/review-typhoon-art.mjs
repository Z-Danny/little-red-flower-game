/** Deterministic asset/placement review. These are composites, not browser screenshots. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
function dependency(name) {
  const path = readdirSync(join(root, 'node_modules/.pnpm')).filter(n => n.startsWith(name + '@')).map(n => join(root, 'node_modules/.pnpm', n, 'node_modules', name)).find(p => existsSync(join(p, 'package.json')));
  return require(path);
}
const { build } = dependency('esbuild');
const sharp = dependency('sharp');
const result = await build({ absWorkingDir: root, stdin: { contents: `
  import { assets, actions, goals, level, powerVisuals } from './app/game/typhoon/config';
  import { createRun, reduceRun } from './app/game/typhoon/model';
  import { sceneSprites, powerStatus } from './app/game/typhoon/animation';
  let run = reduceRun(createRun(),{type:'start'});
  const frame = (state) => ({ poses: sceneSprites(state,0), power: powerStatus(state) });
  const frames = {initial: frame(run)};
  const cushion = reduceRun(run,{type:'hit',id:'cushion'});
  frames.cushionHalf = frame(reduceRun(cushion,{type:'tick',ms:375}));
  run = reduceRun(cushion,{type:'tick',ms:750});
  frames.revealed = frame(run);
  const unplug = reduceRun(run,{type:'hit',id:'plug'});
  frames.unplugEarly = frame(reduceRun(unplug,{type:'tick',ms:125}));
  frames.disconnected = frame(reduceRun(unplug,{type:'tick',ms:550}));
  for(const id of goals) {run=reduceRun(run,{type:'hit',id});run=reduceRun(run,{type:'tick',ms:actions[id].duration});}
  run=reduceRun(run,{type:'tick',ms:level.settleMs});
  frames.safe = frame(run);
  export { assets, frames, powerVisuals };
`, resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
const { assets, frames, powerVisuals } = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
const output = join(root, 'outputs', '分层验收'); mkdirSync(output, { recursive: true });
const urls = {}, checks = [];
for (const [name, path] of Object.entries(assets)) {
  const bytes = readFileSync(join(root, 'public', path.slice(1)));
  const image = sharp(bytes), metadata = await image.metadata();
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let transparent = 0, opaque = 0, borderMax = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const a = data[(y * info.width + x) * 4 + 3];
    if (a === 0) transparent++; if (a === 255) opaque++;
    if (x === 0 || y === 0 || x === info.width - 1 || y === info.height - 1) borderMax = Math.max(borderMax, a);
  }
  if (name !== 'room') { assert.equal(metadata.hasAlpha, true, name + ' must have alpha'); assert.ok(transparent > 0 && opaque > 0); assert.equal(borderMax, 0, name + ' has an opaque border'); }
  urls[name] = 'data:image/png;base64,' + bytes.toString('base64');
  checks.push({ name, width: metadata.width, height: metadata.height, hasAlpha: metadata.hasAlpha, transparent, opaque, borderMax });
}
const frameNames = { initial: '初始场景', cushionHalf: '坐垫移开中', revealed: '坐垫收起电源接通', unplugEarly: '插头拔出中', disconnected: '插头已拔状态变红', safe: '安全场景' };
for (const [name, { poses, power }] of Object.entries(frames)) {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="960"><image href="${urls.room}" width="720" height="960"/>`;
  for (const p of poses) {
    if (p.opacity <= 0) continue;
    const px = p.w * p.anchorX, py = p.h * p.anchorY;
    const clipId = `clip-${p.key}`;
    svg += `<defs><clipPath id="${clipId}"><rect x="${-px}" y="${-py}" width="${p.w * p.clipRight}" height="${p.h}"/></clipPath></defs><g opacity="${p.opacity}" transform="translate(${p.x + px},${p.y + py}) rotate(${p.rotation * 180 / Math.PI}) matrix(${p.scaleX},${p.shear},0,1,0,0)" clip-path="url(#${clipId})"><image href="${urls[p.asset]}" x="${-px}" y="${-py}" width="${p.w}" height="${p.h}" preserveAspectRatio="none"/></g>`;
    if (p.key === 'powerstrip') {
      const lamp = powerVisuals.indicator;
      svg += `<rect x="${p.x + p.w * lamp.x}" y="${p.y + p.h * lamp.y}" width="${p.w * lamp.w}" height="${p.h * lamp.h}" fill="${power.color}"/>`;
    }
  }
  svg += '</svg>';
  await sharp(Buffer.from(svg)).png().toFile(join(output, frameNames[name] + '.png'));
}
writeFileSync(join(output, '透明通道验收.json'), JSON.stringify({ reviewType: 'asset alpha and deterministic layer composition, not browser QA', checks }, null, 2));
console.log(JSON.stringify({ output, checkedAssets: checks.length, alphaSprites: checks.length - 1, renderedFrames: Object.keys(frames).length }, null, 2));
