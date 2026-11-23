/** Verifies the browser-to-Godot touch path on an exported, flat Web build. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createReadStream, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join, resolve } from 'node:path';
import { dependency } from '../../scripts/lib/dependencies.mjs';

const [input, output, engine = 'chromium'] = process.argv.slice(2);
assert(input && output && ['chromium', 'webkit'].includes(engine),
  'Usage: node godot-prototype/tests/hunt-touch-web.mjs <Web export> <report directory> [chromium|webkit]');
const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sharp = dependency('sharp');
const artifact = resolve(input);
mkdirSync(output, { recursive: true });
const report = {
  engine, viewport: [390, 844], device: 'not_run', humanAudio: 'not_run',
  sha256: Object.fromEntries(['index.html', 'index.pck', 'index.js', 'index.wasm'].map(name =>
    [name, createHash('sha256').update(readFileSync(join(artifact, name))).digest('hex')])),
  errors: [], browserWarnings: [],
};

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.png': 'image/png' };
const server = createServer((request, response) => {
  const name = request.url === '/' ? 'index.html' : request.url?.slice(1);
  if (!/^index(\.[a-z]+)+$/.test(name || '')) {
    response.writeHead(404).end();
    return;
  }
  const file = join(artifact, name);
  try {
    response.writeHead(200, {
      'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
      'Content-Length': statSync(file).size,
    });
    createReadStream(file).on('error', error => response.destroy(error)).pipe(response);
  } catch {
    response.writeHead(404).end();
  }
});

let browser;
try {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = engine === 'webkit' ? await webkit.launch({ headless: true }) : await chromium.launch({
    headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    args: ['--mute-audio', '--no-proxy-server', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    report.errors.push('Unexpected external request');
    return route.abort();
  });
  if (engine === 'webkit') await context.addInitScript(() => {
    // WebKit has no Chromium mute flag. Mute only this test context's output.
    if (!globalThis.AudioNode || !globalThis.AudioDestinationNode) return;
    const connect = AudioNode.prototype.connect;
    const mutedOutputs = new WeakMap();
    AudioNode.prototype.connect = function (target, ...args) {
      if (target instanceof AudioDestinationNode) {
        if (!mutedOutputs.has(target)) {
          const muted = this.context.createGain();
          muted.gain.value = 0;
          connect.call(muted, target);
          mutedOutputs.set(target, muted);
        }
        target = mutedOutputs.get(target);
      }
      return connect.call(this, target, ...args);
    };
  });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => {
    const text = message.text();
    if (engine === 'webkit' && (
      text.startsWith('WebGL: INVALID_OPERATION: glBlitFramebuffer: Read and write color attachments cannot be the same image.')
      || /WARNING: Trying to play stream.*driver doesn't support sample playback|at: start_sample_playback/.test(text)
    )) {
      report.browserWarnings.push(text);
    } else if (message.type() === 'error' || /SCRIPT ERROR|^ERROR:/.test(text)) {
      report.errors.push(text);
    }
  });

  const canvas = page.locator('#canvas');
  const at = async ([x, y]) => {
    const box = await canvas.boundingBox();
    const scale = Math.min(box.width / 576, box.height / 1024);
    return [box.x + (box.width - 576 * scale) / 2 + x * scale, box.y + (box.height - 1024 * scale) / 2 + y * scale];
  };
  let identifier = 828913;
  const gesture = async (...points) => {
    const screenPoints = await Promise.all(points.map(at));
    await canvas.evaluate((element, { id, screenPoints }) => {
      const dispatch = (type, [clientX, clientY]) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'changedTouches', { value: [{ identifier: id, clientX, clientY }] });
        element.dispatchEvent(event);
      };
      dispatch('touchstart', screenPoints[0]);
      screenPoints.slice(1).forEach(point => dispatch('touchmove', point));
      dispatch('touchend', screenPoints.at(-1));
    }, { id: identifier++, screenPoints });
    await page.waitForTimeout(220);
  };
  const beaker = [448, 576];
  const ringPixels = async () => {
    const [x, y] = await at(beaker);
    const { data, info } = await sharp(await page.screenshot())
      .extract({ left: Math.round(x - 58), top: Math.round(y - 69), width: 116, height: 138 })
      .removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let count = 0;
    for (let pixel = 0; pixel < data.length; pixel += info.channels) {
      const [r, g, b] = data.subarray(pixel, pixel + 3);
      if (r > 160 && r - g > 70 && r - b > 70) count++;
    }
    return count;
  };

  assert.equal((await page.goto(origin + '/', { waitUntil: 'domcontentloaded' })).status(), 200);
  await page.locator('#status').waitFor({ state: 'detached', timeout: 65000 });
  await gesture([288, 994]); // Free select.
  await gesture([348, 530]); // Open the initial campus portrait.
  await page.waitForTimeout(420);
  await gesture([375, 220]); // Lab map plaque.
  await gesture([370, 650]); // Start.
  await page.waitForTimeout(550);
  await gesture([475, 69]); // Hint button must continue to work through emulated mouse.
  await page.screenshot({ path: join(output, 'lab-hints.png') });
  const before = await ringPixels();
  await gesture(beaker, [405, 590], beaker);
  await page.waitForTimeout(830);
  const afterDrag = await ringPixels();
  await page.screenshot({ path: join(output, 'lab-after-drag.png') });
  report.ringPixels = { before, afterDrag };
  assert.ok(afterDrag - before < 30, 'drag back drew a success ring');
  await gesture(beaker);
  await page.waitForTimeout(830);
  const afterTap = await ringPixels();
  report.ringPixels.afterTap = afterTap;
  await page.screenshot({ path: join(output, 'lab-beaker.png') });
  assert.ok(afterTap - afterDrag > 100, 'a tap carrying a nonzero browser touch identifier did not mark the beaker');

  await gesture([220.8, 479.2]);
  await page.waitForTimeout(830);
  await page.mouse.click(...await at([372.8, 769.6]));
  await page.waitForTimeout(2100);
  await page.screenshot({ path: join(output, 'lab-settlement.png') });
  const saved = await page.evaluate(async () => {
    if (!(await indexedDB.databases()).some(database => database.name === '/userfs')) return '';
    return new Promise((resolve, reject) => {
      const db = indexedDB.open('/userfs');
      db.onerror = () => reject(db.error);
      db.onsuccess = () => {
        const store = db.result.transaction('FILE_DATA', 'readonly').objectStore('FILE_DATA');
        const cursor = store.openCursor();
        cursor.onerror = () => reject(cursor.error);
        cursor.onsuccess = () => {
          const row = cursor.result;
          if (row && !String(row.key).endsWith('/prototype-progress-v1.cfg')) { row.continue(); return; }
          db.result.close();
          resolve(row ? new TextDecoder().decode(row.value.contents) : '');
        };
      };
    });
  });
  assert.match(saved, /\[campus-lab-check-v1\][^\[]*flowers=3/);
  assert.deepEqual(report.errors, []);
  report.flowers = 3;
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = error.stack;
  process.exitCode = 1;
} finally {
  try {
    if (browser) await browser.close();
    report.browserClosed = true;
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    writeFileSync(join(output, 'hunt-touch-web.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  }
}
