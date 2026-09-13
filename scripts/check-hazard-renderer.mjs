/** Native Canvas pixel checks, not browser QA or asset approval. No sound context. */
import { createRequire } from 'node:module';
import { existsSync, readdirSync, mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const root = resolve(import.meta.dirname, '..'),
  require = createRequire(import.meta.url);
const canvasModule = process.argv[2];
if (!canvasModule)
  throw Error(
    'Usage: node scripts/check-hazard-renderer.mjs <installed @napi-rs/canvas directory>',
  );
const { createCanvas } = require(resolve(canvasModule));
const esbuildFolder = readdirSync(join(root, 'node_modules/.pnpm'))
  .filter((n) => n.startsWith('esbuild@'))
  .map((n) => join(root, 'node_modules/.pnpm', n, 'node_modules/esbuild'))
  .find((p) => existsSync(join(p, 'lib/main.js')));
const out = join(
  mkdtempSync(join(tmpdir(), 'hazard-renderer-pixels-')),
  'renderer.mjs',
);
await require(esbuildFolder).build({
  absWorkingDir: root,
  entryPoints: ['components/game/scene-hunt/performance-renderer.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  logLevel: 'silent',
});
const { drawPerformanceEnvironment, drawPerformanceFamily } = await import(
  pathToFileURL(out).href
);
const previousDocument = globalThis.document;
globalThis.document = {
  createElement(tag) {
    assert.equal(tag, 'canvas');
    return createCanvas(1, 1);
  },
};
const canvas = () => createCanvas(720, 1280);
const fillMask = (x, y, w, h) => {
  const c = canvas(),
    g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(x, y, w, h);
  return c;
};
const pixels = (c) =>
  c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
const stages = () =>
  [0, 30000, 60000, 90000].map((atMs, i) => ({
    atMs,
    breathMs: [2800, 2300, 1900, 1700][i],
    breathPx: [2, 2.4, 2.8, 3.2][i],
    retractPx: [0, 4, 7, 10][i],
    vignette: 0,
    bpm: 64 + i * 6,
    rainCount: [36, 80, 130, 170][i],
    smokeCount: [16, 32, 52, 64][i],
    smokeAlpha: [0.16, 0.26, 0.36, 0.42][i],
    flameScale: [1, 1.25, 1.55, 1.8][i],
  }));
const makePack = (atmosphere) => ({
  performance: {
    version: 2,
    atmosphere,
    sound: atmosphere === 'fire' ? 'forest_edge' : 'rain_street',
    retreatDirection: 1,
    stages: stages(),
  },
  skin: {
    width: 720,
    height: 1280,
    familyBox: { x: 450, y: 600, w: 100, h: 200 },
    effects: {
      smokeDrift: -1,
      fireSources: [
        { kind: 'flame', x: 180, y: 320, w: 60, h: 70 },
        { kind: 'ember', x: 240, y: 380, w: 30, h: 20 },
        { kind: 'fountain', x: 330, y: 310, w: 35, h: 80 },
      ],
    },
  },
});
const run = (elapsed) => ({
  phase: 'playing',
  elapsed,
  found: [],
  marking: null,
  revealAge: 0,
  miss: null,
  peak: elapsed >= 90000,
  stars: 0,
});
const family = createCanvas(100, 200),
  fg = family.getContext('2d');
fg.fillStyle = '#cb694c';
fg.fillRect(20, 0, 60, 155);
fg.fillStyle = '#ebcba1';
fg.fillRect(25, 155, 18, 45);
fg.fillRect(58, 155, 18, 45);
const protection = fillMask(190, 210, 40, 30);
const effects = {
  weatherMask: fillMask(60, 80, 340, 380),
  waterMask: fillMask(60, 420, 340, 40),
  skyMask: fillMask(60, 80, 340, 70),
  fireMask: fillMask(60, 260, 340, 200),
  smokeMask: fillMask(60, 80, 340, 180),
  characterMask: fillMask(430, 570, 160, 260),
};
const art = {
  scene: canvas(),
  clean: canvas(),
  safe: canvas(),
  family,
  mask: new Uint8ClampedArray(720 * 1280 * 4),
  protection,
  effects,
};
let assertions = 0;
try {
  for (const atmosphere of ['rain', 'thunder', 'fire']) {
    const pack = makePack(atmosphere);
    for (const elapsed of [12000, 42500, 72500, 102500]) {
      const c = canvas();
      drawPerformanceEnvironment(
        c.getContext('2d'),
        pack,
        art,
        run(elapsed),
        false,
      );
      const data = pixels(c);
      let painted = 0;
      for (let y = 0; y < 1280; y++)
        for (let x = 0; x < 720; x++) {
          const alpha = data[(y * 720 + x) * 4 + 3];
          if (x < 60 || x >= 400 || y < 80 || y >= 460)
            assert.equal(alpha, 0, 'paint outside approved environment masks');
          if (x >= 190 && x < 230 && y >= 210 && y < 240)
            assert.equal(alpha, 0, 'target evidence overpaint');
          if (alpha) painted++;
        }
      assert.ok(painted > 0, atmosphere + ' actually painted');
      assertions++;
      if (atmosphere === 'fire') {
        const cap = Math.ceil(
          pack.performance.stages[Math.min(3, Math.floor(elapsed / 30000))]
            .smokeAlpha * 255,
        );
        for (let y = 80; y < 260; y++)
          for (let x = 60; x < 400; x++)
            assert.ok(
              data[(y * 720 + x) * 4 + 3] <= cap + 1,
              'aggregate smoke opacity exceeds approved cap',
            );
        assertions++;
      }
    }
  }
  const pack = makePack('indoor'),
    a = canvas(),
    b = canvas();
  drawPerformanceFamily(a.getContext('2d'), pack, art, run(0), false);
  drawPerformanceFamily(b.getContext('2d'), pack, art, run(90000), false);
  const pa = pixels(a),
    pb = pixels(b);
  let changedUpper = 0;
  for (let y = 0; y < 1280; y++)
    for (let x = 0; x < 720; x++) {
      const i = (y * 720 + x) * 4;
      if (y >= 765)
        assert.deepEqual(
          pa.slice(i, i + 4),
          pb.slice(i, i + 4),
          'feet moved at higher tier',
        );
      if (y < 720 && pa[i + 3] !== pb[i + 3]) changedUpper++;
      if (x < 430 || x >= 590 || y < 570 || y >= 830)
        assert.equal(pb[i + 3], 0, 'character left approved movement pixels');
    }
  assert.ok(changedUpper > 0, 'upper body retreat must be visible');
  assertions++;
  const reduced = canvas();
  drawPerformanceFamily(reduced.getContext('2d'), pack, art, run(90000), true);
  const reduced2 = canvas();
  drawPerformanceFamily(reduced2.getContext('2d'), pack, art, run(0), true);
  assert.deepEqual(pixels(reduced), pixels(reduced2));
  assertions++;
  console.log(
    JSON.stringify(
      {
        kind: 'native-canvas-pixel-validation',
        passed: true,
        scenarios: assertions,
        targetEvidenceUntouched: true,
        outsidePermissionsTransparent: true,
        aggregateSmokeBounded: true,
        feetAnchored: true,
        reducedMotionStatic: true,
        audioOpened: false,
        browserTest: false,
      },
      null,
      2,
    ),
  );
} finally {
  globalThis.document = previousDocument;
}
