/** Run the exported Godot game in an isolated portrait browser. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const input = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const port = Number(process.env.GODOT_TEST_PORT || 8784);
const origin = 'https://127.0.0.1:' + port;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.png': 'image/png' };
const report = { checks: [], media: [], errors: [], physicalDevice: 'not_run', humanAudio: 'not_run' };
fs.mkdirSync(output, { recursive: true });
report.sha256 = Object.fromEntries(['index.html', 'index.js', 'index.wasm', 'index.pck'].map(name =>
  [name, createHash('sha256').update(fs.readFileSync(path.join(input, name))).digest('hex')]));

async function progress() {
  if (!(await indexedDB.databases()).some(db => db.name === '/userfs')) return '';
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('/userfs');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('FILE_DATA')) { db.close(); resolve(''); return; }
      const cursor = db.transaction('FILE_DATA').objectStore('FILE_DATA').openCursor();
      cursor.onerror = () => reject(cursor.error);
      cursor.onsuccess = () => {
        const row = cursor.result;
        if (row && !String(row.key).endsWith('/prototype-progress-v1.cfg')) { row.continue(); return; }
        db.close();
        resolve(row ? new TextDecoder().decode(row.value.contents) : '');
      };
    };
  });
}

const server = https.createServer({ pfx: fs.readFileSync(process.argv[4]) }, (request, response) => {
  const url = new URL(request.url, origin);
  if (url.pathname === '/favicon.ico') { response.writeHead(204).end(); return; }
  const relative = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const file = path.resolve(input, relative);
  if (!file.startsWith(input + path.sep) || !fs.existsSync(file)) {
    report.errors.push(`Missing export file: ${relative}`);
    response.writeHead(404).end();
    return;
  }
  if (relative.startsWith('packs/')) report.media.push(relative);
  response.writeHead(200, {
    'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream',
    'Content-Length': fs.statSync(file).size,
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(file).on('error', error => response.destroy(error)).pipe(response);
});
let browser;
try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    args: ['--mute-audio', '--no-proxy-server', '--ignore-certificate-errors', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  let delayedFirstMap = false;
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) {
      if (!delayedFirstMap && url.pathname.startsWith('/packs/map-campus-')) {
        delayedFirstMap = true;
        await new Promise(resolve => setTimeout(resolve, 800));
      }
      await route.continue();
    }
    else {
      report.errors.push(`Unexpected external request: ${url.origin}`);
      await route.abort();
    }
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' || /SCRIPT ERROR|^ERROR:/.test(message.text())) report.errors.push(message.text());
  });
  const settle = () => page.waitForTimeout(200);
  const locate = async (x, y) => {
    const box = await page.locator('#canvas').boundingBox();
    const scale = Math.min(box.width / 576, box.height / 1024);
    return [box.x + (box.width - 576 * scale) / 2 + x * scale, box.y + (box.height - 1024 * scale) / 2 + y * scale];
  };
  const tap = async (x, y) => {
    await page.touchscreen.tap(...await locate(x, y));
    await settle();
  };
  const drag = async (start, end) => {
    const [a, b] = await Promise.all([locate(...start), locate(...end)]);
    const touch = (x, y) => [{x, y, id: 53}];
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: touch(...a)});
    for (let i = 1; i <= 8; i++) {
      await cdp.send('Input.dispatchTouchEvent', {type:'touchMove', touchPoints:touch(a[0]+(b[0]-a[0])*i/8, a[1]+(b[1]-a[1])*i/8)});
    }
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
    await page.waitForTimeout(850);
  };
  const shot = name => page.screenshot({path: path.join(output, name + '.png')});
  const ready = () => page.locator('#status').waitFor({ state: 'detached', timeout: 60000 });
  const media = group => report.media.some(file => file.startsWith('packs/' + group + '-'));
  const waitForMedia = async group => {
    for (let i = 0; i < 50 && !media(group); i++) await page.waitForTimeout(150);
    assert(media(group), `Expected pack: ${group}`);
    await page.waitForTimeout(550);
  };
  const waitForSave = async id => {
    for (let i = 0; i < 35; i++) {
      if ((await page.evaluate(progress)).includes(`[${id}]`)) return;
      await page.waitForTimeout(300);
    }
    throw new Error(`No saved result for ${id}`);
  };

  await page.goto(origin + '/');
  await ready();
  assert.deepEqual(report.media, [], 'title does not fetch maps or level art');
  const initialMap = page.waitForRequest(request => request.url().includes('/packs/map-campus-'));
  await tap(288, 879);
  await initialMap;
  await shot('00-loading-topmost');
  await waitForMedia('map-campus');
  assert.equal(report.media.length, 1);
  await tap(450, 971);
  await shot('01-campus-briefing');
  await tap(370, 650);
  await waitForMedia('campus-canteen-check-v1');
  assert(media('find-three-shared'));
  assert(!media('home-food-storage-v1') && !media('food-table-check-v1'), 'other meals do not preload');
  await shot('02-find-three-390x844');
  for (const [x, y] of [[289, 688], [76, 570], [496, 358], [288, 636], [288, 432], [288, 534], [288, 606.5]]) {
    await tap(x, y);
  }
  await waitForSave('campus-canteen-check-v1');
  await shot('03-find-three-settlement');
  report.checks.push('campus map and only its level packs loaded, three objects and handwashing order completed, reward saved');

  const count = report.media.length;
  await page.reload();
  await ready();
  await tap(288, 879);
  await page.waitForTimeout(900);
  await tap(450, 971);
  await tap(370, 650);
  await page.waitForTimeout(900);
  assert.equal(report.media.length, count, 'return visit reads previously downloaded packs from storage');
  await page.setViewportSize({width: 320, height: 568});
  await settle();
  await shot('04-find-three-320x568');
  const stored = await page.evaluate(progress);
  assert.match(stored, /\[campus-canteen-check-v1\][\s\S]*flowers=3/);
  for (const [x, y] of [[289, 688], [76, 570], [496, 358], [288, 636], [288, 432], [288, 534], [288, 606.5]]) {
    await tap(x, y);
  }
  await page.waitForTimeout(1500);
  await shot('05-find-three-replay-settlement');
  assert.equal(await page.evaluate(progress), stored, 'replaying a completed level keeps the same reward');
  report.checks.push('320×568 replay is playable, cache survives reload, reward is not duplicated');

  await page.setViewportSize({width: 390, height: 844});
  await page.reload();
  await ready();
  await tap(288, 879);
  await page.waitForTimeout(700);
  await page.keyboard.press('Enter');
  await settle();
  await tap(370, 650);
  await waitForMedia('scene-location-rain-school');
  await page.waitForTimeout(1600);
  await shot('06-rain-scene');
  await drag([126,751],[140,545]);
  await drag([447,752],[433,580]);
  await tap(288, 959);
  await waitForSave('campus-rain-check-v1');
  await shot('07-rain-settlement');
  report.checks.push('winning level 01 unlocks level 02; animated scene loads on demand and two touchscreen drags complete it');

  await page.reload();
  await ready();
  await tap(475, 879);
  for (let step = 0; step < 4; step++) {
    await tap(208, 786);
    await page.waitForTimeout(220);
  }
  await tap(348, 530);
  await waitForMedia('map-network');
  await page.keyboard.press('Enter');
  await settle();
  await shot('08-network-briefing');
  await tap(370, 650);
  await waitForMedia('choices-network');
  assert(media('choices-shared'));
  assert(!media('choices-counter') && !media('choices-trail'), 'other choice backgrounds do not preload');
  await shot('09-network-device-390x844');
  await page.setViewportSize({width: 320, height: 568});
  await settle();
  await shot('10-network-device-320x568');
  report.checks.push('network practice mounts its shared cutouts and portrait background only when started');
  assert.deepEqual(report.errors, []);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = error.stack;
  process.exitCode = 1;
} finally {
  try {
    if (browser) { await browser.close(); report.browserClosed = true; }
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.writeFileSync(path.join(output, 'web-verification.json'), JSON.stringify(report, null, 2) + '\n');
  }
}
console.log(JSON.stringify(report, null, 2));
