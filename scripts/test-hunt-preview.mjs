/** Proves a newly generated, disabled level can be previewed without touching production. */
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { createJobs, catalog, readPack } from './hunts.mjs';
import { root } from './lib/dependencies.mjs';
fs.mkdirSync(path.join(root, 'outputs'), { recursive: true });
const base = fs.mkdtempSync(path.join(root, 'outputs', 'hunt-preview-proof-'));
for (const name of [
  'app',
  'components',
  'content',
  'lib',
  'hooks',
  'offline',
  'scripts',
])
  fs.cpSync(path.join(root, name), path.join(base, name), { recursive: true });
for (const name of ['tsconfig.json', 'package.json'])
  fs.copyFileSync(path.join(root, name), path.join(base, name));
for (const name of ['node_modules', 'public'])
  fs.symlinkSync(path.join(root, name), path.join(base, name), 'junction');
const id = 'pipeline-proof-only';
createJobs([{ id, title: '流水线测试关（非正式内容）', order: 99 }], base);
const sample = readPack(
  catalog().find((e) => e.id === 'bedroom-night-check-v2'),
);
const dir = path.join(base, 'content/scenes', id);
for (const [key, value] of Object.entries({
  ...sample,
  rules: {
    ...sample.rules,
    id,
    title: '流水线测试关（非正式内容）',
    order: 99,
  },
}))
  fs.writeFileSync(
    path.join(dir, key === 'skin' ? 'skins/paperbook.json' : key + '.json'),
    JSON.stringify(value),
  );
const before = fs.readFileSync(
  path.join(base, 'content/scenes/catalog.json'),
  'utf8',
);
const report = {
  status: 'running',
  newLevelId: id,
  fixture: 'isolated temporary checkout; reused art is a test fixture only',
  checks: [],
  browserClosed: false,
};
const out = path.join(root, 'docs/hunt-pipeline/verification');
const r = spawnSync(
  process.execPath,
  [
    'scripts/export-offline.mjs',
    '--preview-hunt',
    id,
    '--output',
    'outputs/hunt-preview/proof',
  ],
  { cwd: base, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
);
fs.writeFileSync(
  path.join(out, 'preview-export.log'),
  (r.stdout ?? '') + (r.stderr ?? ''),
);
assert.equal(r.status, 0, r.stderr);
assert.equal(
  fs.readFileSync(path.join(base, 'content/scenes/catalog.json'), 'utf8'),
  before,
);
assert.equal(catalog(base).find((e) => e.id === id).enabled, false);
report.checks.push('new draft remains disabled; catalog unchanged');
const require = createRequire(import.meta.url),
  { chromium } = require(
    process.env.PLAYWRIGHT_PATH ??
      'C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
  );
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.BROWSER_PATH ??
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  args: ['--mute-audio'],
});
try {
  const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
  await page.goto(
    pathToFileURL(
      path.join(base, 'outputs/hunt-preview/proof/小红花应急行动.html'),
    ).href,
  );
  await page
    .locator('button.map-level')
    .filter({ hasText: '流水线测试关（非正式内容）' })
    .click();
  await page.locator('.hunt-entry>button').waitFor();
  assert.equal(
    await page.locator('.hunt-player').getAttribute('data-level'),
    id,
  );
  const b = await page.locator('.hunt-player').boundingBox();
  assert.equal(b.width, 375);
  assert.equal(b.height, 667);
  await page.screenshot({ path: path.join(out, 'new-draft-preview.png') });
  report.checks.push(
    'new ID automatically appears in hub and opens unified full-frame player',
  );
  report.status = 'passed';
} finally {
  await browser.close();
  report.browserClosed = true;
  fs.writeFileSync(
    path.join(out, 'preview-proof.json'),
    JSON.stringify(report, null, 2),
  );
}
