import { existsSync, readFileSync, readdirSync, mkdtempSync, writeFileSync, renameSync, mkdirSync, statSync, realpathSync } from 'node:fs';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dependency, root } from './dependencies.mjs';
export const readJSON = path => JSON.parse(readFileSync(path, 'utf8'));
export const json = value => JSON.stringify(value, null, 2) + '\n';
export const hash = value => createHash('sha256').update(typeof value === 'string' ? value : json(value)).digest('hex');
export function writeAtomic(path, value) {
  mkdirSync(resolve(path, '..'), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`; writeFileSync(temp, value, 'utf8'); renameSync(temp, path);
}
export function inside(base, path) {
  const rel = relative(resolve(base), resolve(path));
  if (isAbsolute(rel) || rel === '..' || rel.startsWith('..\\') || rel.startsWith('../')) throw new Error(`路径越界：${path}`);
  if (existsSync(path)) { const actual = relative(realpathSync(base), realpathSync(path)); if (isAbsolute(actual) || actual.startsWith('..')) throw new Error(`符号链接越界：${path}`); }
  return path;
}
let runtime;
export async function getRuntime() {
  if (runtime) return runtime;
  const dir = mkdtempSync(join(tmpdir(), 'flower-package-validation-')), outfile = join(dir, 'runtime.mjs');
  await dependency('esbuild').build({ absWorkingDir: root, stdin: { contents: "export * from './app/game/runtime/validate'; export * from './app/game/runtime/engine';", resolveDir: root }, bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent' });
  runtime = await import(pathToFileURL(outfile).href); return runtime;
}
export function catalog(base = root) {
  const entries = readJSON(join(base, 'content/catalog.json'));
  if (!Array.isArray(entries)) throw new Error('catalog.json 必须是数组');
  const ids = new Set();
  for (const entry of entries) {
    if (!entry || Object.keys(entry).some(k => !['id','skin','enabled'].includes(k)) || !/^[a-z][a-z0-9-]{0,63}$/.test(entry.id) || !/^[a-z][a-z0-9-]{0,63}$/.test(entry.skin) || typeof entry.enabled !== 'boolean') throw new Error('catalog.json 条目格式错误');
    if (ids.has(entry.id) || ['typhoon-home','oil-fire','fire-patrol','rainstorm','gas-leak','scald'].includes(entry.id)) throw new Error(`关卡 ID 重复/保留：${entry.id}`);
    ids.add(entry.id);
  }
  return entries;
}
export async function readPackage(entry, base = root) {
  const path = inside(join(base, 'content'), join(base, 'content/levels', entry.id));
  const rules = readJSON(join(path, 'level.json')), skin = readJSON(join(path, 'skins', entry.skin + '.json'));
  if (rules.id !== entry.id || skin.id !== entry.skin) throw new Error(`${entry.id}: 目录/清单/文件内部 ID 不一致`);
  return (await getRuntime()).validatePackage(rules, skin);
}
export async function checkArt(pack, base = root) {
  const sharp = dependency('sharp'), result = [];
  const publicRoot = join(base, 'public');
  for (const [key, asset] of Object.entries(pack.skin.assets)) {
    const path = inside(publicRoot, join(publicRoot, asset.src.slice(1)));
    if (!existsSync(path)) throw new Error(`${pack.rules.id}.assets.${key}: 文件不存在 ${asset.src}`);
    if (statSync(path).size > 12 * 1024 * 1024) throw new Error(`${key}: 单图超过 12 MB`);
    const image = sharp(path), info = await image.metadata();
    if (!info.width || !info.height || info.width > 4096 || info.height > 4096) throw new Error(`${key}: 尺寸超过 4096 或无效`);
    const painted = asset.sceneBounds ?? { w: pack.skin.world.width, h: pack.skin.world.height };
    if (key === pack.skin.background && Math.abs(info.width / info.height - painted.w / painted.h) > .015) throw new Error(`${key}: 背景长宽比与声明绘制范围不符，会拉伸`);
    if (asset.alpha) {
      if (!info.hasAlpha) throw new Error(`${key}: 需要真正透明通道`);
      const { data, info: raw } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let clear = 0, visible = 0, edgeMax = 0;
      for (let y = 0; y < raw.height; y++) for (let x = 0; x < raw.width; x++) {
        const alpha = data[(y * raw.width + x) * 4 + 3]; clear += Number(alpha === 0); visible += Number(alpha > 35);
        if (!x || !y || x === raw.width - 1 || y === raw.height - 1) edgeMax = Math.max(edgeMax, alpha);
      }
      if (!clear || !visible || edgeMax > 0) throw new Error(`${key}: 缺少透明空白/内容，或外边缘被裁断`);
    }
    result.push({ id: key, src: asset.src, width: info.width, height: info.height, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') });
  }
  return result;
}
export async function validateCatalog({ art = true, base = root } = {}) {
  const entries = catalog(base), results = [], orders = new Set([1,2,3,4,5,6]);
  for (const entry of entries) {
    const selected = await readPackage(entry, base);
    if (orders.has(selected.rules.order)) throw new Error(`${entry.id}: 关卡编号重复 ${selected.rules.order}`);
    orders.add(selected.rules.order);
    const skinDir = join(base, 'content/levels', entry.id, 'skins');
    // Validate every skin, not only the selected one. Switching skins never silently edits rules.
    for (const filename of readdirSync(skinDir).filter(n => n.endsWith('.json'))) {
      const pack = await readPackage({ ...entry, skin: filename.slice(0, -5) }, base);
      results.push({ id: entry.id, skin: pack.skin.id, enabled: entry.enabled, rulesHash: hash(pack.rules), assets: art ? await checkArt(pack, base) : undefined });
    }
  }
  return results;
}
export async function checkPresets({ art = true, base = root } = {}) {
  const specs = {
    kitchen: { engine: 'kitchen-v1', keys: ['room','pan','lid','water','cloth','extinguisher','gas','plate','knife','flame','worried','panicked','focused','relieved'], boxes: ['pan','lid','gas','person','evacuated','flame'] },
    typhoon: { engine: 'typhoon-v2', keys: ['room','plant','window','rail','cabinet','umbrella','cushion','powerstrip','plug','cable','socket','latchOpen','latchClosed','strap','familyStanding','familySeated'], boxes: ['window','windowClosed','outside','rainEntry','rail','railSafe','plant','plantSafe','umbrella','cabinet','drawer','strap','powerstrip','powerstripSafe','socket','plug','plugSafe','cushion','cushionSafe','family','familySafe'] },
  };
  const results = [];
  for (const [id, spec] of Object.entries(specs)) {
    const skin = readJSON(join(base, 'content/presets', id, 'skin.json'));
    if (skin.schemaVersion !== 1 || skin.engine !== spec.engine) throw new Error(`${id}: 原关卡皮肤版本/引擎不匹配`);
    if (JSON.stringify(Object.keys(skin.assets).sort()) !== JSON.stringify([...spec.keys].sort())) throw new Error(`${id}: 不可增删稳定资源 ID，只能更换路径`);
    if (!(skin.WORLD.width > 0 && skin.WORLD.height > 0)) throw new Error(`${id}: 世界尺寸错误`);
    const boxes = id === 'kitchen' ? skin.layout : skin.placement;
    const checkBox = (box, key) => { if (!box || !['x','y','w','h'].every(k => Number.isFinite(box[k])) || box.w <= 0 || box.h <= 0) throw new Error(`${id}.${key}: 布局矩形无效`); };
    for (const key of spec.boxes) checkBox(boxes[key], key);
    if (id === 'kitchen') {
      for (const key of ['lid','water','cloth','extinguisher','plate','knife']) checkBox(boxes.props[key], `props.${key}`);
      for (const key of ['pan','off','exit']) checkBox(boxes.zones[key], `zones.${key}`);
      if (!(skin.cameraSafe.width > 0 && skin.cameraSafe.height > 0)) throw new Error('cameraSafe 无效');
    }
    const assets = Object.fromEntries(Object.entries(skin.assets).map(([key, src]) => {
      if (typeof src !== 'string' || !/^\/levels\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.(png|webp)$/.test(src)) throw new Error(`${id}.${key}: 非法资源路径`);
      return [key, { src, alpha: key !== 'room' }];
    }));
    results.push({ preset: id, assets: art ? await checkArt({ rules: { id }, skin: { assets, background: 'room', world: skin.WORLD } }, base) : undefined });
  }
  return results;
}
export function registrySource(entries) {
  const enabled = entries.filter(e => e.enabled);
  return '// Generated by pnpm levels:sync. Do not edit by hand.\nimport { validatePackage } from \'../runtime/validate\';\nimport type { LevelPackage } from \'../runtime/schema\';\n' + enabled.map((e, i) => `import rules${i} from '../../../content/levels/${e.id}/level.json';\nimport skin${i} from '../../../content/levels/${e.id}/skins/${e.skin}.json';`).join('\n') + '\nexport const configuredPackages: LevelPackage[] = [\n' + enabled.map((_, i) => `  validatePackage(rules${i}, skin${i}, { embedded: true }),`).join('\n') + '\n];\n';
}
