// Render the production Canvas renderer to PNG without opening a browser or audio.
// Usage: node scripts/render-scene-hunt-qa.mjs [path-to-@napi-rs/canvas]
import { createRequire } from 'node:module';
import {
  existsSync,
  readdirSync,
  mkdtempSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
const root = resolve(import.meta.dirname, '..'),
  require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require(
  process.argv[2] || '@napi-rs/canvas',
);
const esbuildPath = readdirSync(join(root, 'node_modules/.pnpm'))
  .filter((n) => n.startsWith('esbuild@'))
  .map((n) => join(root, 'node_modules/.pnpm', n, 'node_modules/esbuild'))
  .find((p) => existsSync(join(p, 'lib/main.js')));
const temp = mkdtempSync(join(tmpdir(), 'hunt-render-')),
  entry = join(temp, 'renderer.mjs');
await require(esbuildPath).build({
  absWorkingDir: root,
  entryPoints: ['components/game/scene-hunt/renderer.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: entry,
  logLevel: 'silent',
});
const { drawHunt } = await import(pathToFileURL(entry).href);
const pack = {
  rules: JSON.parse(
    readFileSync(join(root, 'content/scenes/typhoon-home/rules.json')),
  ),
  skin: JSON.parse(
    readFileSync(join(root, 'content/scenes/typhoon-home/skin.json')),
  ),
};
const art = {};
for (const key of ['scene', 'clean', 'safe', 'family'])
  art[key] = await loadImage(join(root, 'public', pack.skin[key]));
const output = join(root, 'docs/typhoon-immersion-v2/qa');
mkdirSync(output, { recursive: true });
const base = {
  phase: 'playing',
  elapsed: 0,
  found: [],
  marking: null,
  revealAge: 0,
  miss: null,
  peak: false,
  stars: 0,
};
for (const [name, state] of Object.entries({
  initial: base,
  peak: { ...base, elapsed: 93000, peak: true },
  marked: {
    ...base,
    elapsed: 93000,
    peak: true,
    found: Object.keys(pack.skin.targets),
  },
  safe: {
    ...base,
    phase: 'complete',
    revealAge: 5500,
    found: Object.keys(pack.skin.targets),
    stars: 3,
  },
})) {
  const canvas = createCanvas(720, 1280);
  drawHunt(canvas.getContext('2d'), pack, art, state, false, null);
  writeFileSync(join(output, name + '.png'), canvas.toBuffer('image/png'));
}
console.log(
  'Rendered four production-renderer states (not browser/physical-device acceptance): ' +
    output,
);
