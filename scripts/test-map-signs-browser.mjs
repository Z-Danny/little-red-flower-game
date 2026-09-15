// Final artifact QA: OFFLINE_FILE=outputs/本地离线版/小红花应急行动.html node scripts/test-map-signs-browser.mjs
// Optional: PLAYWRIGHT_MODULE, BROWSER_EXECUTABLE, MAP_SIGNS_TEST_OUTPUT, MAP_SIGNS_REGIONS=nature,public,home.
// Completed-state saves below are explicit visual fixtures, never earned gameplay.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const html = path.resolve(root, process.env.OFFLINE_FILE || 'outputs/本地离线版/小红花应急行动.html');
const output = path.resolve(root, process.env.MAP_SIGNS_TEST_OUTPUT || 'outputs/compact-map-signs-verification');
const map = JSON.parse(fs.readFileSync(path.join(root, 'content/journey-map.json'), 'utf8'));
const copy = JSON.parse(fs.readFileSync(path.join(root, 'content/journey-copy.json'), 'utf8'));
const signs = JSON.parse(fs.readFileSync(path.join(root, 'content/journey-signs.json'), 'utf8'));
const categories = JSON.parse(fs.readFileSync(path.join(root, 'content/journey-categories.json'), 'utf8')).categories;
const routes = JSON.parse(fs.readFileSync(path.join(root, 'content/journey-routes.json'), 'utf8')).regions;
const nodes = map.regions.flatMap((region) => region.nodes);
const regionFilter = process.env.MAP_SIGNS_REGIONS?.split(',').map((id) => id.trim()).filter(Boolean);
const regions = map.regions.filter((region) => !regionFilter || regionFilter.includes(region.id));
const annotatedRegions = regions.filter((region) => routes[region.id]);
const sizes = [[320, 568], [375, 667], [390, 844], [430, 932], [540, 960], [1440, 900]];
const report = {
  status: 'running', html, sha256: null, browser: null,
  regions: regions.map((region) => region.id),
  checks: [], assets: [], signAssets: [], layouts: [], layoutFailures: [], stability: [], associations: [], routes: [], routeStates: [], roadCoverage: [], screenshots: [], errors: [], network: [], failedRequests: [],
  fixtures: {
    fresh: 'Isolated browser storage; no completed levels.',
    complete: 'All 24 mapped levels preset to 3 flowers only to inspect completed-state layout. No actual gameplay, rewards or completion flow is tested.',
    partial: `For each annotated map, every prefix of 1 through n−1 levels is preset to 3 flowers in its own isolated context (${annotatedRegions.map((region) => `${region.id}: 1–${region.nodes.length - 1}`).join('; ')}). This verifies every route changes from locked to connected as its prerequisite becomes complete. Display fixture only; not earned gameplay.`,
  },
  physicalDevice: 'not_run', humanAudio: 'not_run', contextClosed: [], browserClosed: false,
};
fs.mkdirSync(output, { recursive: true });
const check = (name, detail = {}) => {
  report.checks.push({ name, status: 'passed', ...detail });
  console.log(`PASS ${name}`);
};

function findPlaywright() {
  const specified = process.env.PLAYWRIGHT_MODULE;
  const candidates = specified ? [specified.startsWith('file:') ? fileURLToPath(specified) : specified] : [
    'playwright',
    path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'),
    'playwright-core',
  ];
  for (const candidate of candidates) {
    try { return require(candidate.startsWith('.') ? path.resolve(candidate) : candidate); }
    catch (error) { if (specified) throw error; }
  }
  throw new Error('Playwright was not found. Set PLAYWRIGHT_MODULE to its package path.');
}

function findBrowser(chromium) {
  if (process.env.BROWSER_EXECUTABLE) {
    assert(fs.existsSync(process.env.BROWSER_EXECUTABLE), 'BROWSER_EXECUTABLE does not exist');
    return process.env.BROWSER_EXECUTABLE;
  }
  const candidates = [
    chromium.executablePath(),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
    ...[process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
      .filter(Boolean).map((directory) => path.join(directory, 'Google/Chrome/Application/chrome.exe')),
  ];
  const executable = candidates.find((candidate) => fs.existsSync(candidate));
  assert(executable, 'Chromium/Chrome was not found. Set BROWSER_EXECUTABLE.');
  return executable;
}

async function startMap(page, scenario) {
  await page.goto(pathToFileURL(html).href, { waitUntil: 'load', timeout: 60_000 });
  await page.locator('[data-title-screen][data-cover-ready="true"]').waitFor({ state: 'visible' });
  await page.evaluate(() => document.fonts.ready);
  await page.locator(scenario === 'fresh' ? '[data-home-start]' : '[data-home-continue]').click();
  await page.locator('.garden-shell').waitFor({ state: 'visible' });
  await page.locator('[data-map-fan-toggle]').waitFor({ state: 'visible' });
}

async function selectRegion(page, id) {
  const category = categories.find((item) => item.regionIds.includes(id));
  assert(category, `${id}: no matching archipelago category`);
  const toggle = page.locator('[data-map-fan-toggle]');
  await toggle.click();
  await page.locator('[data-archipelago]').waitFor({ state: 'visible' });
  await page.locator(`[data-island="${category.id}"]`).click();
  await page.locator('[data-archipelago]').waitFor({ state: 'hidden' });
  await page.locator(`.garden-region[data-region="${id}"]`).waitFor({ state: 'attached' });
  assert.equal(await page.locator('[data-archipelago]').count(), 0, `${id}: choosing a map must close the archipelago page`);
  assert.equal(await page.locator('.garden-region').getAttribute('data-region'), id);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function centerNode(page, id) {
  // Scroll the actual scene only; do not zoom, move nodes, change CSS, or hide chrome.
  await page.locator(`[data-map-node="${id}"]`).evaluate((node) => {
    const scroll = node.closest('.garden-scroll');
    const sign = node.querySelector('.garden-node-label').getBoundingClientRect();
    const flower = node.querySelector('.garden-node-bed').getBoundingClientRect();
    const view = scroll.getBoundingClientRect();
    const center = (Math.min(sign.top, flower.top) + Math.max(sign.bottom, flower.bottom)) / 2;
    scroll.scrollTo({ top: scroll.scrollTop + center - (view.top + view.height / 2), behavior: 'instant' });
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function measureNode(page, id) {
  return page.locator(`[data-map-node="${id}"]`).evaluate(async (node) => {
    const rect = (element) => {
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
    };
    const gap = (a, b) => Math.hypot(Math.max(a.x - b.right, b.x - a.right, 0), Math.max(a.y - b.bottom, b.y - a.bottom, 0));
    const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
    const title = node.querySelector('.garden-node-title');
    const label = node.querySelector('.garden-node-label');
    const bed = node.querySelector('.garden-node-bed');
    if (!title || !label || !bed) return { id: node.dataset.mapNode, missing: 'title/label/bed' };
    const style = getComputedStyle(title);
    let scale = 1;
    let opacity = 1;
    for (let element = title; element; element = element.parentElement) {
      const css = getComputedStyle(element);
      opacity *= Number(css.opacity);
      if (css.transform !== 'none') {
        const matrix = new DOMMatrixReadOnly(css.transform);
        scale *= Math.min(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d));
      }
      const zoom = Number.parseFloat(css.zoom);
      if (Number.isFinite(zoom)) scale *= zoom;
    }
    const range = document.createRange();
    range.selectNodeContents(title);
    const textRects = [...range.getClientRects()].filter((r) => r.width > 0).map((r) => ({ x: r.x, y: r.y, right: r.right, bottom: r.bottom }));
    const labelRect = rect(label);
    const bedRect = rect(bed);
    const probeRect = (r, fractions = [0.25, 0.5, 0.75]) => {
      return fractions.flatMap((x) => fractions.map((y) => ({
        x: r.x + r.width * x, y: r.y + r.height * y,
        node: document.elementFromPoint(r.x + r.width * x, r.y + r.height * y)?.closest('[data-map-node]')?.getAttribute('data-map-node') ?? null,
      })));
    };
    const nodeRect = rect(node);
    // The artwork can be less than 44px tall; test the actual transparent hit extension.
    // Leave 2px inside each border horizontally, and probe near the 44px area's top/bottom.
    const labelTouch = { x: labelRect.x + 2, y: labelRect.y + labelRect.height / 2 - 22, width: labelRect.width - 4, height: 44 };
    const nodeTouch = { x: nodeRect.x + nodeRect.width / 2 - 22, y: nodeRect.y + nodeRect.height / 2 - 22, width: 44, height: 44 };
    const labelStyle = getComputedStyle(label);
    const texture = label.querySelector('.garden-sign-surface > img.garden-sign-texture');
    const luminance = (color) => {
      const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
      if (channels?.length !== 3) return null;
      const linear = channels.map((channel) => { const value = channel / 255; return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4; });
      return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    };
    const foreground = luminance(style.color);
    const background = luminance(labelStyle.backgroundColor);
    const contrast = (a, b) => a === null || b === null ? null : (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    // Sample the configured raster itself beneath every visible text line. The
    // solid CSS fallback is diagnostic only: it cannot prove painted contrast.
    let textureContrast = { error: 'missing texture', sampleCount: 0 };
    if (texture) {
      try {
        await texture.decode();
        const imageRect = rect(texture);
        const css = getComputedStyle(texture);
        let drawWidth = imageRect.width, drawHeight = imageRect.height;
        if (css.objectFit !== 'fill') {
          const contain = Math.min(imageRect.width / texture.naturalWidth, imageRect.height / texture.naturalHeight);
          const factor = css.objectFit === 'cover'
            ? Math.max(imageRect.width / texture.naturalWidth, imageRect.height / texture.naturalHeight)
            : css.objectFit === 'none' ? 1 : css.objectFit === 'scale-down' ? Math.min(1, contain) : contain;
          drawWidth = texture.naturalWidth * factor;
          drawHeight = texture.naturalHeight * factor;
        }
        const position = css.objectPosition.split(' ');
        const offset = (value, remaining) => value?.endsWith('%') ? remaining * Number.parseFloat(value) / 100 : Number.parseFloat(value) || 0;
        const drawX = imageRect.x + offset(position[0], imageRect.width - drawWidth);
        const drawY = imageRect.y + offset(position[1] ?? position[0], imageRect.height - drawHeight);
        const canvas = document.createElement('canvas');
        canvas.width = texture.naturalWidth;
        canvas.height = texture.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(texture, 0, 0);
        const samples = [];
        for (const line of textRects) {
          // A 2px screen grid covers the title substrate, including between glyphs.
          for (let y = line.y + 1; y < line.bottom; y += 2) {
            for (let x = line.x + 1; x < line.right; x += 2) {
              const sourceX = Math.floor((x - drawX) / drawWidth * texture.naturalWidth);
              const sourceY = Math.floor((y - drawY) / drawHeight * texture.naturalHeight);
              if (sourceX < 0 || sourceY < 0 || sourceX >= texture.naturalWidth || sourceY >= texture.naturalHeight) {
                throw new Error('title sample leaves painted texture');
              }
              const [r, g, b, alpha] = ctx.getImageData(sourceX, sourceY, 1, 1).data;
              samples.push({ ratio: contrast(foreground, luminance(`rgb(${r}, ${g}, ${b})`)), alpha: alpha / 255, sourceX, sourceY });
            }
          }
        }
        const worst = samples.reduce((current, item) => !current || item.ratio < current.ratio ? item : current, null);
        textureContrast = { sampleCount: samples.length, minimum: worst?.ratio ?? null, minAlpha: Math.min(...samples.map((item) => item.alpha)), worst, objectFit: css.objectFit, filter: css.filter };
      } catch (error) { textureContrast = { error: error.message, sampleCount: 0 }; }
    }
    const decorativeImages = [...label.querySelectorAll('img')].map((image) => ({
      className: image.className, alt: image.getAttribute('alt'), ariaHidden: !!image.closest('[aria-hidden="true"]'),
      complete: image.complete && image.naturalWidth > 0,
    }));
    const others = [...node.closest('.garden-world').querySelectorAll('[data-map-node]')].filter((other) => other !== node).map((other) => ({
      id: other.dataset.mapNode,
      label: rect(other.querySelector('.garden-node-label')),
      bed: rect(other.querySelector('.garden-node-bed')),
    }));
    return {
      id: node.dataset.mapNode, status: node.dataset.status, text: title.textContent.trim(), ariaLabel: node.getAttribute('aria-label'),
      flowerNumber: node.querySelector('.garden-node-number')?.textContent.trim() ?? '',
      labelText: label.textContent.trim(), captionCount: label.querySelectorAll('.garden-node-caption').length,
      titleCount: label.querySelectorAll('.garden-node-title').length,
      textureCount: label.querySelectorAll('.garden-sign-surface > img.garden-sign-texture').length,
      motifCount: label.querySelectorAll('img.garden-sign-motif').length,
      stampCount: label.querySelectorAll('img.garden-sign-stamp').length,
      rimCount: label.querySelectorAll('.garden-sign-rim').length,
      sweepCount: label.querySelectorAll('.garden-sign-sweep').length,
      signTheme: label.dataset.signTheme, motion: label.dataset.motion,
      revealing: label.dataset.revealing, stamping: label.dataset.stamping,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      runningAnimations: label.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').map((animation) => ({ name: animation.animationName ?? '', duration: animation.effect?.getComputedTiming().duration })),
      decorativeImages, textureContrast,
      title: rect(title), label: labelRect, bed: bedRect, node: nodeRect, labelTouch, nodeTouch, textRects,
      fontSize: Number.parseFloat(style.fontSize), effectiveFontSize: Number.parseFloat(style.fontSize) * scale,
      color: style.color, labelBackground: labelStyle.backgroundColor,
      contrastRatio: textureContrast.minimum ?? null,
      fallbackContrastRatio: contrast(foreground, background),
      opacity, textOverflow: style.textOverflow,
      textFits: title.scrollWidth <= title.clientWidth + 1 && title.scrollHeight <= title.clientHeight + 1,
      viewportScale: window.visualViewport?.scale ?? 1,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      shell: rect(node.closest('.garden-shell')), scroll: rect(node.closest('.garden-scroll')),
      labelHits: probeRect(labelRect), bedHits: probeRect(bedRect),
      labelTouchHits: probeRect(labelTouch, [0.01, 0.5, 0.99]), nodeTouchHits: probeRect(nodeTouch, [0.01, 0.5, 0.99]),
      flowerGap: gap(labelRect, bedRect),
      otherSignOverlaps: others.filter((other) => overlap(labelRect, other.label) > 4).map((other) => other.id),
      otherFlowerOverlaps: others.filter((other) => overlap(labelRect, other.bed) > 4).map((other) => other.id),
      nearerOtherFlowers: others.filter((other) => gap(labelRect, other.bed) + 2 < gap(labelRect, bedRect)).map((other) => other.id),
    };
  });
}

function verifyNode(layout, width, height, scenario) {
  const context = `${scenario} ${width}x${height} ${layout.id}`;
  assert(!layout.missing, `${context}: ${layout.missing}`);
  assert(layout.text.length > 0, `${context}: missing visible title`);
  const region = map.regions.find((item) => item.id === layout.region);
  const expectedNumber = String(region.nodes.findIndex((node) => node.id === layout.id) + 1).padStart(2, '0');
  assert.equal(layout.flowerNumber, expectedNumber, `${context}: flower must retain its two-digit level number in every state`);
  assert.equal(layout.text, copy.levels[layout.id].title, `${context}: wrong level name`);
  assert.equal(layout.labelText, layout.text, `${context}: sign must contain only its level name`);
  assert.equal(layout.captionCount, 0, `${context}: removed bottom status row remains`);
  assert.equal(layout.titleCount, 1, `${context}: sign must retain exactly one title`);
  assert.equal(layout.textureCount, 1, `${context}: sign needs its direct surface texture`);
  assert.equal(layout.motifCount, 1, `${context}: sign needs exactly one level motif`);
  assert.equal(layout.stampCount, layout.status === 'complete' ? 1 : 0, `${context}: flower stamp must appear only on completed levels`);
  assert.equal(layout.rimCount, 1, `${context}: sign needs one rim layer`);
  assert.equal(layout.signTheme, layout.region, `${context}: wrong sign material theme`);
  assert(['on', 'off'].includes(layout.motion), `${context}: missing motion state`);
  assert.equal(layout.revealing, 'false', `${context}: display fixture must not replay an earned unlock sweep`);
  assert.equal(layout.stamping, 'false', `${context}: display fixture must not replay an earned stamp`);
  assert.equal(layout.sweepCount, 0, `${context}: persistent signs must not retain a sweep layer`);
  assert(layout.decorativeImages.every((image) => image.alt === '' && image.ariaHidden && image.complete), `${context}: sign images must decode and remain decorative`);
  if (layout.reducedMotion) assert.equal(layout.runningAnimations.length, 0, `${context}: reduced motion still runs sign animations`);
  assert(layout.fontSize >= 14 && layout.effectiveFontSize >= 13.99, `${context}: title below 14px: ${layout.effectiveFontSize}`);
  assert(!layout.textureContrast.error && layout.textureContrast.sampleCount > 0, `${context}: painted contrast could not be sampled: ${layout.textureContrast.error}`);
  assert(layout.textureContrast.minAlpha >= 0.98, `${context}: title overlaps transparent texture pixels`);
  assert.equal(layout.textureContrast.filter, 'none', `${context}: texture filter invalidates unfiltered canvas contrast sampling`);
  assert(layout.contrastRatio >= 4.5, `${context}: title lacks contrast against its actual painted texture: ${layout.contrastRatio}`);
  assert.equal(layout.viewportScale, 1, `${context}: layout must be tested without zoom`);
  assert(layout.opacity >= 0.95, `${context}: title is faded (${layout.opacity})`);
  assert(layout.textFits && layout.textOverflow !== 'ellipsis', `${context}: title truncation`);
  assert(!layout.horizontalOverflow, `${context}: horizontal page overflow`);
  assert(layout.node.width >= 43.99 && layout.node.height >= 43.99, `${context}: interactive node is smaller than 44px`);
  assert(layout.labelTouch.width >= 43.99, `${context}: sign touch area is narrower than 44px`);
  assert(layout.nodeTouchHits.every((hit) => hit.node === layout.id), `${context}: node's central 44px touch area is obstructed`);
  assert(layout.labelTouchHits.every((hit) => hit.node === layout.id), `${context}: sign's 44px touch extension is obstructed or inactive`);
  for (const name of ['label', 'bed']) {
    const r = layout[name];
    assert(r.width > 0 && r.height > 0, `${context}: ${name} has no visible area`);
    assert(r.x >= Math.max(0, layout.shell.x) - 1 && r.right <= Math.min(width, layout.shell.right) + 1, `${context}: ${name} exceeds horizontal map bounds`);
    assert(r.y >= 0 && r.bottom <= height + 1, `${context}: ${name} cannot be scrolled fully into view`);
    assert(layout[`${name === 'label' ? 'label' : 'bed'}Hits`].every((hit) => hit.node === layout.id), `${context}: ${name} has an occluded or incorrect click target`);
  }
  for (const r of layout.textRects) {
    assert(r.x >= layout.label.x - 1 && r.right <= layout.label.right + 1 && r.y >= layout.label.y - 1 && r.bottom <= layout.label.bottom + 1, `${context}: title glyphs leave the sign`);
  }
  assert(layout.flowerGap <= 36, `${context}: sign is disconnected from its own flower (${layout.flowerGap}px)`);
  assert.equal(layout.otherSignOverlaps.length, 0, `${context}: overlapping signs: ${layout.otherSignOverlaps}`);
  assert.equal(layout.otherFlowerOverlaps.length, 0, `${context}: sign covers another flower: ${layout.otherFlowerOverlaps}`);
  assert.equal(layout.nearerOtherFlowers.length, 0, `${context}: sign is nearer another flower: ${layout.nearerOtherFlowers}`);
  if (scenario === 'complete') assert.equal(layout.status, 'complete', `${context}: fixture was not applied`);
  else assert.notEqual(layout.status, 'complete', `${context}: fresh state unexpectedly completed`);
}

async function verifyClickAssociation(page, node, scenario) {
  const titles = [];
  for (const selector of ['.garden-node-label', '.garden-node-bed']) {
    await centerNode(page, node.id);
    await page.locator(`[data-map-node="${node.id}"] ${selector}`).click();
    const dialog = page.locator(`[data-painted-intro][data-level-id="${node.id}"]`);
    await dialog.waitFor({ state: 'visible' });
    const title = (await dialog.locator('.painted-intro-title').innerText()).trim();
    assert.equal(title, copy.levels[node.id].title, `${scenario} ${node.id}: ${selector} opened the wrong level`);
    titles.push(title);
    const status = await page.locator(`[data-map-node="${node.id}"]`).getAttribute('data-status');
    if (status === 'locked') assert.equal(await dialog.locator('[data-painted-primary]:not(:disabled)').count(), 0, `${node.id}: locked sign must not bypass unlocking`);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
  }
  assert.equal(titles[0], titles[1]);
  report.associations.push({ scenario, id: node.id, title: titles[0], signAndFlowerOpenSameLevel: true });
}

async function verifyPositionStability(page, region, scenario) {
  for (const node of region.nodes) {
    const baseline = report.layouts.find((layout) => layout.scenario === scenario && layout.id === node.id && layout.viewport.width === 390);
    await centerNode(page, node.id);
    const current = await measureNode(page, node.id);
    const relative = (layout) => ({ x: layout.label.x - layout.bed.x, y: layout.label.y - layout.bed.y, width: layout.label.width, height: layout.label.height });
    const before = relative(baseline), after = relative(current);
    const drift = Math.max(...Object.keys(before).map((key) => Math.abs(before[key] - after[key])));
    report.stability.push({ scenario, region: region.id, id: node.id, before, after, maximumDriftPx: drift });
    assert(drift <= 0.75, `${scenario} ${node.id}: resizing and revisiting the same scroll position accumulates ${drift}px sign drift`);
  }
  check(`${scenario} ${region.id}: signs return to the same flower-relative position after viewport and scroll round trips`);
}

async function screenshot(page, name) {
  const file = `${name}.png`;
  await page.screenshot({ path: path.join(output, file) });
  report.screenshots.push(file);
}

async function verifyMapAsset(page, region) {
  const image = page.locator('.garden-map-art');
  await image.evaluate((element) => element.decode());
  const source = await image.getAttribute('src');
  assert(/^data:image\/(?:png|webp);base64,/.test(source), `${region.id}: final HTML map must be embedded`);
  const actual = createHash('sha256').update(Buffer.from(source.slice(source.indexOf(',') + 1), 'base64')).digest('hex');
  const expected = createHash('sha256').update(fs.readFileSync(path.join(root, 'public', region.image))).digest('hex');
  assert.equal(actual, expected, `${region.id}: final HTML does not contain the currently configured map image`);
  const dimensions = await image.evaluate((element) => ({ width: element.naturalWidth, height: element.naturalHeight }));
  assert(dimensions.width > 0 && dimensions.height > 0, `${region.id}: map image failed to decode`);
  report.assets.push({ region: region.id, configuredImage: region.image, sha256: actual, embeddedMatchesSource: true, ...dimensions });
}

async function verifySignAssets(page, region, scenario) {
  const decodeDataImage = (source, label) => {
    assert(/^data:image\/(?:png|webp|svg\+xml)(?:;[^,]*)?,/.test(source), `${label}: final HTML sign image must be embedded`);
    const comma = source.indexOf(',');
    return source.slice(0, comma).includes(';base64')
      ? Buffer.from(source.slice(comma + 1), 'base64')
      : Buffer.from(decodeURIComponent(source.slice(comma + 1)), 'utf8');
  };
  const verify = async (image, configuredImage, kind, id) => {
    assert(configuredImage?.startsWith('/ui/map-signs-v1/'), `${kind} ${id}: unexpected configured sign path`);
    await image.evaluate((element) => element.decode());
    const source = await image.getAttribute('src');
    const actual = createHash('sha256').update(decodeDataImage(source, `${kind} ${id}`)).digest('hex');
    const expected = createHash('sha256').update(fs.readFileSync(path.join(root, 'public', configuredImage))).digest('hex');
    assert.equal(actual, expected, `${kind} ${id}: embedded image does not match the approved configured asset`);
    const dimensions = await image.evaluate((element) => ({ width: element.naturalWidth, height: element.naturalHeight }));
    assert(dimensions.width > 0 && dimensions.height > 0, `${kind} ${id}: image failed to decode`);
    if (kind === 'texture') {
      assert.equal(dimensions.width, signs.regions[region.id].width, `${id}: texture width differs from configured bounds`);
      assert.equal(dimensions.height, signs.regions[region.id].height, `${id}: texture height differs from configured bounds`);
    }
    if (!report.signAssets.some((asset) => asset.configuredImage === configuredImage)) {
      report.signAssets.push({ kind, id, region: region.id, configuredImage, sha256: actual, embeddedMatchesSource: true, ...dimensions });
    }
  };
  const textures = page.locator('.garden-node-label .garden-sign-surface > img.garden-sign-texture');
  assert.equal(await textures.count(), region.nodes.length, `${region.id}: every sign needs one configured texture`);
  assert.equal(await textures.evaluateAll((images) => new Set(images.map((image) => image.getAttribute('src'))).size), 1, `${region.id}: signs do not share their regional texture`);
  await verify(textures.first(), signs.regions[region.id].image, 'texture', region.id);
  for (const node of region.nodes) {
    const motif = page.locator(`[data-map-node="${node.id}"] img.garden-sign-motif`);
    assert.equal(await motif.count(), 1, `${node.id}: expected one theme motif`);
    await verify(motif, signs.motifs[node.id], 'motif', node.id);
  }
  const stamps = page.locator('img.garden-sign-stamp');
  assert.equal(await stamps.count(), scenario === 'complete' ? region.nodes.length : 0, `${region.id}: stamp presence differs from completion state`);
  if (scenario === 'complete') {
    assert.equal(await stamps.evaluateAll((images) => new Set(images.map((image) => image.getAttribute('src'))).size), 1, `${region.id}: completed signs must share the approved stamp`);
    await verify(stamps.first(), signs.completedStamp, 'stamp', 'completed-flower');
  }
  check(`${scenario} ${region.id}: final HTML embeds the approved texture, every level motif and applicable stamp byte-for-byte`);
}

async function installProgressFixture(context, completedIds, name) {
  assert([...name].length <= 12, 'Display fixture nickname must satisfy the real profile length limit');
  await context.addInitScript(({ completedIds, name, initialLevel }) => {
    const id = 'map-signs-display-fixture';
    localStorage.setItem('little-red-flower-leaderboard-v1', JSON.stringify({
      version: 1, activePlayerId: id,
      players: [{ id, name, region: '', createdAt: 1, completed: Object.fromEntries(completedIds.map((level) => [level, 3])) }],
    }));
    localStorage.setItem('little-red-flower-journey-location-v1', JSON.stringify({ [id]: { levelId: initialLevel, visitedAt: 1 } }));
  }, { completedIds, name, initialLevel: nodes[0].id });
}

function recordPageEvents(page, scenario) {
  page.setDefaultTimeout(15_000);
  page.on('pageerror', (error) => report.errors.push({ scenario, message: error.message }));
  page.on('request', (request) => { if (/^https?:/.test(request.url())) report.network.push({ scenario, url: request.url() }); });
  page.on('requestfailed', (request) => report.failedRequests.push({ scenario, url: request.url().slice(0, 200), failure: request.failure()?.errorText }));
}

function verifyAnnotationData(region) {
  const annotation = routes[region.id];
  assert.equal(annotation.image, region.image, `${region.id}: annotations belong to a different image`);
  assert.equal(annotation.width, region.width, `${region.id}: annotation width differs from map coordinates`);
  assert.equal(annotation.height, region.height, `${region.id}: annotation height differs from map coordinates`);
  assert(Number.isFinite(annotation.width) && annotation.width > 0 && Number.isFinite(annotation.height) && annotation.height > 0, `${region.id}: invalid map coordinate bounds`);
  const verifyPoint = (point, label) => {
    assert(Array.isArray(point) && point.length === 2 && point.every(Number.isFinite), `${label}: expected a finite [x, y] coordinate`);
    assert(point[0] >= 0 && point[0] <= annotation.width && point[1] >= 0 && point[1] <= annotation.height, `${label}: coordinate leaves the source map bounds: ${point}`);
  };
  for (const node of region.nodes) verifyPoint([node.x, node.y], `${region.id} ${node.id}`);
  assert.equal(annotation.segments.length, region.nodes.length - 1, `${region.id}: missing annotated route`);
  const segmentKeys = new Set();
  for (const segment of annotation.segments) {
    const label = `${region.id} ${segment.from} → ${segment.to}`;
    const fromIndex = region.nodes.findIndex((node) => node.id === segment.from);
    assert(fromIndex >= 0 && region.nodes[fromIndex + 1]?.id === segment.to, `${label}: route does not connect consecutive map nodes`);
    const key = `${segment.from} → ${segment.to}`;
    assert(!segmentKeys.has(key), `${label}: duplicate annotated route`);
    segmentKeys.add(key);
    assert(Array.isArray(segment.points) && segment.points.length >= 2, `${label}: route needs at least two road points`);
    segment.points.forEach((point, index) => verifyPoint(point, `${label} point ${index + 1}`));
    const from = region.nodes[fromIndex];
    const to = region.nodes[fromIndex + 1];
    assert.deepEqual(segment.points[0], [from.x, from.y], `${label}: first road point misses its flower`);
    assert.deepEqual(segment.points.at(-1), [to.x, to.y], `${label}: last road point misses its flower`);
  }
  check(`${region.id}: every annotated segment and flower uses valid source-map coordinates`);
}

async function verifyAnnotatedRoutes(page, region, scenario, completedIds, width, height) {
  const annotation = routes[region.id];
  assert(annotation, `${region.id}: missing route annotations`);
  assert.equal(annotation.image, region.image, `${region.id}: annotations belong to a different image`);
  assert.equal(annotation.width, region.width, `${region.id}: annotation width differs from map coordinates`);
  assert.equal(annotation.height, region.height, `${region.id}: annotation height differs from map coordinates`);
  assert.equal(annotation.segments.length, region.nodes.length - 1, `${region.id}: missing annotated route`);
  const result = await page.evaluate(({ annotation, region }) => {
    const image = document.querySelector('.garden-map-art');
    const svg = document.querySelector('.garden-paths');
    const imageBox = image.getBoundingClientRect();
    const rect = (element) => {
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const sourceToScreen = ([x, y]) => ({ x: imageBox.x + x / annotation.width * imageBox.width, y: imageBox.y + y / annotation.height * imageBox.height });
    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const sourceDistance = (a, b) => Math.hypot((a.x - b.x) / imageBox.width * annotation.width, (a.y - b.y) / imageBox.height * annotation.height);
    const matrix = svg.getScreenCTM();
    const svgToScreen = (point) => new DOMPoint(point.x, point.y).matrixTransform(matrix);
    const nodeGround = (id) => {
      const bed = document.querySelector(`[data-map-node="${id}"] .garden-node-bed`).getBoundingClientRect();
      return { x: bed.x + bed.width / 2, y: bed.bottom };
    };
    const segments = annotation.segments.map((segment) => {
      const group = svg.querySelector(`g[data-route-from="${segment.from}"][data-route-to="${segment.to}"]`);
      const route = group?.querySelector('path.garden-path');
      if (!route) return { from: segment.from, to: segment.to, missing: true };
      const length = route.getTotalLength();
      // Sample the exported SVG itself at <= 0.5 source-coordinate units. Do not
      // reconstruct the implementation's curve: independent samples must pass
      // through every annotated road point in the image's coordinate system.
      const steps = Math.max(1, Math.ceil(length / 0.5));
      const samples = Array.from({ length: steps + 1 }, (_, index) => svgToScreen(route.getPointAtLength(length * index / steps)));
      const endpoints = [samples[0], samples.at(-1)];
      const style = getComputedStyle(route);
      const pointErrors = segment.points.map((point) => {
        const expected = sourceToScreen(point);
        return { point, nearestSourceUnits: Math.min(...samples.map((sample) => sourceDistance(sample, expected))) };
      });
      const ids = [segment.from, segment.to];
      return {
        from: segment.from, to: segment.to, source: group.dataset.routeSource,
        d: route.getAttribute('d'), bedMatches: group.querySelector('.garden-path-bed')?.getAttribute('d') === route.getAttribute('d'),
        connected: route.classList.contains('connected'), length, sampleCount: samples.length, pointErrors,
        groundErrorsPx: ids.map((id, index) => distance(endpoints[index], nodeGround(id))),
        configuredNodeErrorsPx: ids.map((id, index) => {
          const node = region.nodes.find((node) => node.id === id);
          return distance(endpoints[index], sourceToScreen([node.x, node.y]));
        }),
        stroke: style.stroke, strokeWidth: Number.parseFloat(style.strokeWidth), dasharray: style.strokeDasharray,
        opacity: Number.parseFloat(style.opacity), display: style.display, visibility: style.visibility,
      };
    });
    return {
      image: rect(image), svg: rect(svg), viewBox: svg.getAttribute('viewBox'),
      totalGroups: svg.querySelectorAll('g[data-route-from][data-route-to]').length,
      coordinateCornerErrorsPx: [[0, 0], [annotation.width, annotation.height]].map((point) => distance(sourceToScreen(point), svgToScreen({ x: point[0], y: point[1] }))),
      nodeStates: region.nodes.map((node) => ({ id: node.id, status: document.querySelector(`[data-map-node="${node.id}"]`).dataset.status })),
      segments,
    };
  }, { annotation, region });
  report.routes.push({ scenario, region: region.id, viewport: { width, height }, ...result });
  const label = `${scenario} ${region.id} ${width}x${height}`;
  assert.equal(result.totalGroups, annotation.segments.length, `${label}: unexpected number of rendered routes`);
  assert.equal(result.viewBox, `0 0 ${annotation.width} ${annotation.height}`, `${label}: SVG uses a different source coordinate system`);
  assert(result.coordinateCornerErrorsPx.every((error) => error <= 0.25), `${label}: SVG and map image are not aligned: ${result.coordinateCornerErrorsPx}`);
  const complete = new Set(completedIds);
  for (const node of region.nodes) {
    const expected = complete.has(node.id) ? 'complete' : node.unlockAfter === null || complete.has(node.unlockAfter) ? 'available' : 'locked';
    assert.equal(result.nodeStates.find((state) => state.id === node.id).status, expected, `${label} ${node.id}: wrong fixture progress state`);
  }
  for (const segment of result.segments) {
    const routeLabel = `${label} ${segment.from} → ${segment.to}`;
    assert(!segment.missing, `${routeLabel}: final SVG is missing its annotated route`);
    assert.equal(segment.source, 'annotated', `${routeLabel}: final SVG did not use image annotations`);
    assert(segment.bedMatches && segment.length > 0, `${routeLabel}: route and its bed must render the same nonempty curve`);
    assert(segment.pointErrors.every((error) => error.nearestSourceUnits <= 1), `${routeLabel}: exported path misses road annotations: ${JSON.stringify(segment.pointErrors)}`);
    assert(segment.groundErrorsPx.every((error) => error <= 0.75), `${routeLabel}: path ends miss flower ground contact: ${segment.groundErrorsPx}`);
    assert(segment.configuredNodeErrorsPx.every((error) => error <= 0.25), `${routeLabel}: rendered endpoints do not match node/image coordinates: ${segment.configuredNodeErrorsPx}`);
    const target = region.nodes.find((node) => node.id === segment.to);
    const expectedConnected = complete.has(target.id) || target.unlockAfter === null || complete.has(target.unlockAfter);
    assert.equal(segment.connected, expectedConnected, `${routeLabel}: locked/completed progress lights the wrong route`);
    assert(segment.display !== 'none' && segment.visibility === 'visible' && segment.stroke !== 'none' && segment.dasharray !== 'none', `${routeLabel}: route is not visibly dashed`);
    assert(expectedConnected ? segment.opacity >= 0.95 && segment.strokeWidth >= 4 : segment.opacity > 0 && segment.opacity <= 0.6 && segment.strokeWidth < 4, `${routeLabel}: actual paint does not distinguish unlocked from locked`);
    report.routeStates.push({ scenario, region: region.id, from: segment.from, to: segment.to, expectedConnected, connected: segment.connected, stroke: segment.stroke, strokeWidth: segment.strokeWidth, opacity: segment.opacity });
  }
  check(`${label}: exported routes match annotated road points, image coordinates, flower ground contacts and unlock state`);
}

async function screenshotWholeRoad(page, region, scenario) {
  const scroll = page.locator('.garden-scroll');
  const initial = await scroll.evaluate((element) => ({ top: element.scrollTop, maximum: element.scrollHeight - element.clientHeight, step: Math.max(1, element.clientHeight * 0.7) }));
  const stops = [0];
  while (stops.at(-1) < initial.maximum) stops.push(Math.min(initial.maximum, stops.at(-1) + initial.step));
  const intervals = [];
  for (const [index, top] of stops.entries()) {
    await scroll.evaluate((element, top) => element.scrollTo({ top, behavior: 'instant' }), top);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const interval = await page.evaluate((sourceHeight) => {
      const image = document.querySelector('.garden-map-art').getBoundingClientRect();
      const scroll = document.querySelector('.garden-scroll').getBoundingClientRect();
      return [Math.max(0, (Math.max(0, scroll.top) - image.top) / image.height * sourceHeight), Math.min(sourceHeight, (Math.min(innerHeight, scroll.bottom) - image.top) / image.height * sourceHeight)];
    }, region.height);
    intervals.push(interval);
    await screenshot(page, `${scenario}-${region.id}-full-road-${String(index + 1).padStart(2, '0')}-390x844`);
  }
  const points = routes[region.id].segments.flatMap((segment) => segment.points);
  const roadMin = Math.min(...points.map((point) => point[1]));
  const roadMax = Math.max(...points.map((point) => point[1]));
  assert(intervals[0][0] <= roadMin && intervals.at(-1)[1] >= roadMax, `${scenario}: screenshots do not cover both ends of the annotated road`);
  for (let index = 1; index < intervals.length; index += 1) assert(intervals[index][0] <= intervals[index - 1][1] + 1, `${scenario}: gap between road screenshots`);
  report.roadCoverage.push({ scenario, region: region.id, sourceRoadRange: [roadMin, roadMax], sourceImageIntervals: intervals, screenshotCount: stops.length });
  await scroll.evaluate((element, top) => element.scrollTo({ top, behavior: 'instant' }), initial.top);
  check(`${scenario} ${region.id}: ${stops.length} overlapping viewport screenshots cover the complete annotated road`);
}

let browser;
try {
  assert.equal(nodes.length, 24, 'Expected 24 levels across the three maps');
  assert.deepEqual(Object.keys(signs.motifs).sort(), nodes.map((node) => node.id).sort(), 'Sign motif IDs must exactly equal the current 24 map nodes');
  assert.deepEqual(Object.keys(signs.regions).sort(), map.regions.map((region) => region.id).sort(), 'Sign themes must exactly equal the current map regions');
  assert(regions.length > 0, 'MAP_SIGNS_REGIONS did not select any known maps');
  if (regionFilter) assert(regionFilter.every((id) => map.regions.some((region) => region.id === id)), `Unknown MAP_SIGNS_REGIONS: ${regionFilter}`);
  for (const region of annotatedRegions) verifyAnnotationData(region);
  report.sha256 = createHash('sha256').update(fs.readFileSync(html)).digest('hex');
  const { chromium } = findPlaywright();
  browser = await chromium.launch({ headless: true, executablePath: findBrowser(chromium), args: ['--mute-audio'] });
  report.browser = browser.version();
  for (const scenario of ['fresh', 'complete']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', hasTouch: true, deviceScaleFactor: 1 });
    try {
      const completedIds = scenario === 'complete' ? nodes.map((node) => node.id) : [];
      if (scenario === 'complete') await installProgressFixture(context, completedIds, '标牌与路线完成显示测试');
      const page = await context.newPage();
      recordPageEvents(page, scenario);
      await startMap(page, scenario);
      for (const [width, height] of sizes) {
        await page.setViewportSize({ width, height });
        for (const region of regions) {
          const failuresBeforeRegion = report.layoutFailures.length;
          await selectRegion(page, region.id);
          await page.locator(`.garden-region[data-region="${region.id}"]`).waitFor({ state: 'attached' });
          assert.equal(await page.locator('[data-map-node]').count(), region.nodes.length);
          if (scenario === 'fresh' && width === 390) await verifyMapAsset(page, region);
          if (width === 390) await verifySignAssets(page, region, scenario);
          if (routes[region.id]) {
            await verifyAnnotatedRoutes(page, region, scenario, completedIds, width, height);
            if (width === 390) await screenshotWholeRoad(page, region, scenario);
          }
          for (const [index, node] of region.nodes.entries()) {
            await centerNode(page, node.id);
            const layout = { scenario, region: region.id, viewport: { width, height }, ...await measureNode(page, node.id) };
            report.layouts.push(layout);
            let layoutPassed = true;
            try { verifyNode(layout, width, height, scenario); }
            catch (error) {
              layoutPassed = false;
              report.layoutFailures.push({ scenario, region: region.id, id: node.id, viewport: { width, height }, message: error.message });
              console.error(`FAIL ${error.message}`);
              fs.writeFileSync(path.join(output, `failure-${scenario}-${region.id}-${index + 1}-${width}x${height}.json`), JSON.stringify(layout, null, 2) + '\n');
              console.error(JSON.stringify({ id: node.id, viewport: { width, height }, label: layout.label, bed: layout.bed,
                badTouchHits: layout.labelTouchHits?.filter((hit) => hit.node !== node.id), textureWorst: layout.textureContrast?.worst }));
              if (report.layoutFailures.length <= 6) await screenshot(page, `failure-${scenario}-${region.id}-${index + 1}-${width}x${height}`);
            }
            // Pointer clicks at the representative phone size verify both entry surfaces for every level/state.
            // Nine hit-test points per surface verify the same association at every other tested size.
            if (width === 390 && layoutPassed) await verifyClickAssociation(page, node, scenario);
            const representative = width === 390 && [0, Math.floor(region.nodes.length / 2), region.nodes.length - 1].includes(index);
            const smallOrDesktop = scenario === 'fresh' && width !== 390 && region.id === 'nature' && index === 0;
            if (representative || smallOrDesktop) await screenshot(page, `${scenario}-${region.id}-${String(index + 1).padStart(2, '0')}-${width}x${height}`);
          }
          const failuresInRegion = report.layoutFailures.length - failuresBeforeRegion;
          const name = `${scenario} ${region.name}: ${region.nodes.length} readable, correctly associated signs at ${width}x${height}`;
          if (failuresInRegion === 0) check(name);
          else report.checks.push({ name, status: 'failed', failures: failuresInRegion });
        }
      }
      await page.setViewportSize({ width: 390, height: 844 });
      for (const region of regions) {
        await selectRegion(page, region.id);
        await verifyPositionStability(page, region, scenario);
      }
    } finally { await context.close(); report.contextClosed.push(scenario); }
  }
  for (const region of annotatedRegions) {
    for (let count = 1; count < region.nodes.length; count += 1) {
      const scenario = `partial-${region.id}-${count}-of-${region.nodes.length}`;
      const completedIds = region.nodes.slice(0, count).map((node) => node.id);
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', hasTouch: true, deviceScaleFactor: 1 });
      try {
        await installProgressFixture(context, completedIds, `路线${region.id}${count}关`);
        const page = await context.newPage();
        recordPageEvents(page, scenario);
        await startMap(page, scenario);
        await selectRegion(page, region.id);
        await verifyAnnotatedRoutes(page, region, scenario, completedIds, 390, 844);
        if (count === Math.floor(region.nodes.length / 2)) await screenshotWholeRoad(page, region, scenario);
      } finally { await context.close(); report.contextClosed.push(scenario); }
    }
    for (const segment of routes[region.id].segments) {
      const label = `${region.id} ${segment.from} → ${segment.to}`;
      const states = report.routeStates.filter((state) => state.region === region.id && state.from === segment.from && state.to === segment.to);
      assert(states.some((state) => state.connected) && states.some((state) => !state.connected), `${label}: not tested in both locked and unlocked states`);
      for (let count = 1; count < region.nodes.length; count += 1) {
        assert(states.some((state) => state.scenario === `partial-${region.id}-${count}-of-${region.nodes.length}`), `${label}: missing partial completion prefix ${count}`);
      }
    }
    check(`Every ${region.id} route is checked with no progress, every partial completion prefix, and all levels complete (display fixtures only)`);
  }
  assert.equal(report.layoutFailures.length, 0, `Layout failures: ${JSON.stringify(report.layoutFailures)}`);
  assert.equal(report.errors.length, 0, `Browser errors: ${JSON.stringify(report.errors)}`);
  assert.equal(report.network.length, 0, `Offline artifact attempted network access: ${JSON.stringify(report.network)}`);
  assert.equal(report.failedRequests.length, 0, `Failed requests: ${JSON.stringify(report.failedRequests)}`);
  report.finalSha256 = createHash('sha256').update(fs.readFileSync(html)).digest('hex');
  assert.equal(report.finalSha256, report.sha256, 'Final HTML changed during verification');
  check('Final offline HTML has no browser errors, failed requests, or HTTP(S) dependencies');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = error.stack || error.message;
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  if (browser) { await browser.close(); report.browserClosed = true; }
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  const minFont = Math.min(...report.layouts.map((layout) => layout.effectiveFontSize).filter(Number.isFinite));
  fs.writeFileSync(path.join(output, 'README.md'), [
    '# 地图标牌与标注路线：最终离线 HTML 验证', '',
    `- 结果：${report.status}`, `- HTML：${html}`, `- SHA-256：${report.sha256}`,
    `- 浏览器：${report.browser}；headless、隔离存储、--mute-audio；finally 已关闭：${report.browserClosed}`,
    `- 视口：${sizes.map((size) => size.join('×')).join('、')}，页面缩放 100%。`,
    `- 地图：${report.regions.join('、')}；默认回归全部地图，MAP_SIGNS_REGIONS 可用逗号分隔地图 ID 指定检查范围。`,
    `- 布局样本：${report.layouts.length}；最小实际标题字号：${Number.isFinite(minFont) ? minFont.toFixed(2) + 'px' : '未测'}。`,
    `- 布局失败样本：${report.layoutFailures.length}。`,
    `- 经全部6种视口后，回到390×844逐关居中复查${report.stability.length}份牌与花相对位置，最大允许往返漂移0.75px。`,
    `- 已核对 ${report.assets.length} 张地图和 ${report.signAssets.length} 份独立标牌素材：离线内嵌图的 SHA-256 必须等于当前配置指向的素材。`,
    `- 390×844 下逐个点击标牌与花朵：${report.associations.length} 组；其余视口逐个检查双方各 9 个命中点。`,
    '- 使用当前左下角扇形按钮切换地图；所有状态下标牌仅有一份关卡名称文字，没有状态文案；保留主题材质、单个关卡刻纹、已完成花印与光边，花朵圆牌保留配置顺序编号。装饰图片均为无障碍隐藏、空 alt。',
    '- 所有关卡逐个滚动后检查：标题至少14px且完整，以2px网格对实际纹理的文字区域取样，最小对比度至少4.5且像素不透明；CSS fallback颜色只记录、不用来证明纹理对比度。横向不越界，与本关花朵相邻、不压其他牌子或花朵。',
    '- 静态显示 fixture 不触发解锁扫光或盖章；reduced-motion 下标牌没有运行中的动画。真实首次通关与重玩动效另由实际输入流程验证，不能以预置进度代替。',
    '- 视觉标牌允许低于44px高；实际按钮至少44×44px，额外逐点验证标牌透明扩展区44px高度和按钮中央44×44px均命中本关。',
    '- fresh 为全新存储；complete 预置 24 关完成存档，仅用于已种花状态的显示验证，不代表实际通关。',
    `- 各已标注地图逐一预置前 1 至 n−1 关完成（${annotatedRegions.map((region) => `${region.name}：1–${region.nodes.length - 1} 关`).join('；')}）；核对每关状态和每段路线是否应亮起。所有预置均为显示 fixture，不代表真实通关。`,
    `- 标注路线几何样本：${report.routes.length}；路线亮起样本：${report.routeStates.length}。从最终 HTML 的 SVG 以不大于 0.5 源坐标单位采样，核对所有标注点、图片/SVG坐标系、首尾花朵接地点，以及实际虚线/透明度/线宽。`,
    `- 已标注地图整条道路分段截图：${report.roadCoverage.length} 组；覆盖全新、全部完成与部分完成状态，连续截图间有重叠并记录原图覆盖区间。`,
    `- finally 已关闭隔离 context：${report.contextClosed.join('、')}。`,
    `- 浏览器错误 ${report.errors.length}；HTTP(S) 请求 ${report.network.length}；失败请求 ${report.failedRequests.length}。`,
    '- physicalDevice: not_run', '- humanAudio: not_run',
    ...(report.failure ? ['', '## 失败', '', '```text', report.failure, '```'] : []),
    '', '## 代表截图', '', ...report.screenshots.map((file) => `- [${String(file)}](${String(file)})`), '',
  ].join('\n'));
}
