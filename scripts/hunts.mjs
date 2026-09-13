/** Single authoring entry for whole-scene recognition. Never copies a game component. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dependency, root } from './lib/dependencies.mjs';
import { writeAtomic, inside } from './lib/packages.mjs';
export const json = (v) => JSON.stringify(v, null, 2) + '\n';
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const digest = (b) => createHash('sha256').update(b).digest('hex');
const validId = (v) =>
  typeof v === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(v);
const need = (ok, message) => {
  if (!ok) throw Error(message);
};
export function catalog(base = root) {
  const entries = read(path.join(base, 'content/scenes/catalog.json'));
  need(Array.isArray(entries), 'Invalid hunt catalog');
  const seen = new Set();
  for (const e of entries) {
    need(
      validId(e.id) &&
        typeof e.enabled === 'boolean' &&
        /^(skin|skins\/[a-z][a-z0-9-]{0,63})\.json$/.test(e.skin),
      'Invalid hunt catalog entry',
    );
    need(!seen.has(e.id), 'Duplicate hunt ID');
    seen.add(e.id);
  }
  return entries;
}
export function packFiles(entry, base = root) {
  const dir = inside(
    path.join(base, 'content'),
    path.join(base, 'content/scenes', entry.id),
  );
  return {
    rules: path.join(dir, 'rules.json'),
    skin: path.join(dir, entry.skin),
    presentation: path.join(dir, 'presentation.json'),
    performance: path.join(dir, 'performance.json'),
  };
}
export function readPack(entry, base = root) {
  const f = packFiles(entry, base),
    pack = { rules: read(f.rules), skin: read(f.skin) };
  for (const k of ['presentation', 'performance'])
    if (fs.existsSync(f[k])) pack[k] = read(f[k]);
  return pack;
}
let runtime;
export async function getHuntRuntime() {
  if (runtime) return runtime;
  const outfile = path.join(
    fs.mkdtempSync(path.join(tmpdir(), 'hunt-contract-')),
    'runtime.mjs',
  );
  await dependency('esbuild').build({
    absWorkingDir: root,
    stdin: {
      contents:
        "export * from './app/game/scene-hunt/schema'; export * from './app/game/scene-hunt/viewport';",
      resolveDir: root,
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'silent',
  });
  return (runtime = await import(pathToFileURL(outfile)));
}
export function assetPaths(s) {
  return [
    ...new Set([
      s.scene,
      s.clean,
      s.safe,
      s.family,
      s.mask,
      ...Object.values(s.targets).map((t) => t.icon),
      ...Object.entries(s.effects ?? {})
        .filter(([k]) => k.endsWith('Mask'))
        .map(([, v]) => v),
    ]),
  ];
}
export function fingerprint(entry, base = root) {
  const pack = readPack(entry, base),
    files = {};
  for (const f of Object.values(packFiles(entry, base)))
    if (fs.existsSync(f))
      files[path.relative(base, f).replaceAll('\\', '/')] = digest(
        fs.readFileSync(f),
      );
  for (const src of assetPaths(pack.skin)) {
    need(
      /^\/levels\/[a-zA-Z0-9_./-]+\.(png|webp)$/.test(src),
      'Asset must be local',
    );
    const f = inside(
      path.join(base, 'public'),
      path.join(base, 'public', src.slice(1)),
    );
    files['public' + src] = digest(fs.readFileSync(f));
  }
  files['content/hunt-viewport.json'] = digest(
    fs.readFileSync(path.join(base, 'content/hunt-viewport.json')),
  );
  for (const p of [
    'app/game/scene-hunt/viewport.ts',
    'app/game/scene-hunt/model.ts',
    'app/game/scene-hunt/schema.ts',
    'app/game/scene-hunt/presentation.ts',
    'app/game/scene-hunt/tension.ts',
    'app/game/scene-hunt/sound.ts',
    'app/game/scene-hunt/nonverbal.ts',
    'app/game/scene-hunt/fear-clips.generated.ts',
    'components/game/scene-hunt/player.tsx',
    'components/game/scene-hunt/renderer.ts',
    'components/game/scene-hunt/countdown-bar.tsx',
    'components/game/scene-hunt/use-hint-disclosure.ts',
    'components/game/scene-hunt/hint-toggle.tsx',
    'components/game/scene-hunt/performance-renderer.ts',
    'app/game/scene-hunt/performance.ts',
    'app/scene-hunt.css',
  ])
    files[p] = digest(fs.readFileSync(path.join(base, p)));
  return { sha256: digest(json(files)), files };
}
export async function check(entry, base = root, { release = false } = {}) {
  const rt = await getHuntRuntime(),
    pack = readPack(entry, base);
  rt.checkHunt(pack);
  need(pack.rules.id === entry.id, 'Directory and rule identity mismatch');
  const sharp = dependency('sharp'),
    s = pack.skin;
  for (const src of assetPaths(s)) {
    need(
      /^\/levels\/[a-zA-Z0-9_./-]+\.(png|webp)$/.test(src),
      'Invalid local asset',
    );
    const f = inside(
      path.join(base, 'public'),
      path.join(base, 'public', src.slice(1)),
    );
    need(fs.existsSync(f), 'Missing asset: ' + src);
    const image = sharp(f),
      meta = await image.metadata();
    if (
      [
        s.scene,
        s.clean,
        s.safe,
        s.mask,
        ...Object.values(s.effects ?? {}).filter((v) => typeof v === 'string'),
      ].includes(src)
    )
      need(
        meta.width === s.width && meta.height === s.height,
        'World image dimensions differ: ' + src,
      );
    if (
      src === s.family ||
      Object.values(s.targets).some((t) => t.icon === src)
    ) {
      need(meta.hasAlpha, 'Real alpha required: ' + src);
      const { data } = await image
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      let clear = false,
        visible = false;
      for (let i = 3; i < data.length; i += 4) {
        clear ||= data[i] === 0;
        visible ||= data[i] > 127;
      }
      need(
        clear && visible,
        'Cutout must contain transparent and visible pixels: ' + src,
      );
    }
  }
  const { data, info } = await sharp(path.join(base, 'public', s.mask.slice(1)))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const colors = new Map(
    Object.entries(s.targets).map(([id, t]) => [
      t.color.join(','),
      { id, t, count: 0 },
    ]),
  );
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4;
      if (data[i + 3] < 128) continue;
      const key = [data[i], data[i + 1], data[i + 2]].join(',');
      if (key === '0,0,0') continue;
      const target = colors.get(key);
      need(target, 'Unknown ID mask color: ' + key);
      const b = target.t.bounds;
      need(
        x >= b.x && y >= b.y && x < b.x + b.w && y < b.y + b.h,
        'Mask exceeds configured bounds: ' + target.id,
      );
      target.count++;
    }
  for (const t of colors.values())
    need(t.count > 16, 'Empty/tiny target mask: ' + t.id);
  const cropIssues = rt.auditHuntViewport(s),
    fp = fingerprint(entry, base);
  if (release) {
    need(!JSON.stringify(pack).includes('TODO'), 'Draft TODO fields remain');
    need(
      s.criticalRegions?.length > 0,
      'New skin must declare face/criticalRegions',
    );
    need(
      !cropIssues.length,
      'Critical content would be cropped: ' + JSON.stringify(cropIssues),
    );
    const sourceDir = inside(
      base,
      path.join(
        base,
        'art-source/hunts',
        entry.id,
        path.basename(entry.skin, '.json'),
      ),
    );
    const specFile = path.join(sourceDir, 'production.json'),
      proofFile = path.join(sourceDir, 'processing.json');
    need(
      fs.existsSync(specFile) && fs.existsSync(proofFile),
      'Missing compiled source/proof for this skin',
    );
    const spec = read(specFile),
      proof = read(proofFile);
    need(
      spec.pipelineVersion === 3 &&
        spec.id === entry.id &&
        proof.id === entry.id,
      'Compiler proof identity mismatch',
    );
    need(
      digest(fs.readFileSync(specFile)) === proof.specSha256,
      'Production spec changed after compile',
    );
    for (const [name, sha] of Object.entries(proof.inputHashes ?? {})) {
      need(
        [
          'scene-original.png',
          'mask-candidate.png',
          'clean-candidate.png',
          'ending.png',
        ].includes(name),
        'Unexpected source proof path',
      );
      need(
        digest(fs.readFileSync(path.join(sourceDir, name))) === sha,
        'Source image changed after compile: ' + name,
      );
    }
    need(
      Object.keys(proof.inputHashes ?? {}).length === 4,
      'Incomplete input provenance',
    );
    const owner = read(path.join(base, spec.output, '.compiler-owner.json'));
    need(
      owner.skinSha256 === digest(fs.readFileSync(packFiles(entry, base).skin)),
      'Skin changed outside compiler; recompile/review',
    );
    const f = path.join(
      base,
      'content/scenes',
      entry.id,
      'reviews',
      path.basename(entry.skin, '.json') + '.json',
    );
    need(fs.existsSync(f), 'Missing skin-specific review: ' + f);
    const review = read(f);
    need(
      review.fingerprint === fp.sha256,
      'Review fingerprint stale; run inspect and re-review',
    );
    for (const gate of [
      'knowledge',
      'art',
      'mobile',
      'playthrough',
      'offline',
    ]) {
      const g = review[gate];
      need(
        g?.status === 'passed' && g.reviewer?.trim() && g.evidence,
        'Unreviewed gate: ' + gate,
      );
      const e = inside(base, path.resolve(base, g.evidence));
      need(
        fs.existsSync(e) && fs.statSync(e).isFile(),
        'Missing evidence: ' + g.evidence,
      );
    }
  }
  return {
    id: entry.id,
    skin: entry.skin,
    fingerprint: fp.sha256,
    cropIssues,
    assets: assetPaths(s).length,
  };
}
export async function sync(base = root) {
  const entries = catalog(base),
    ids = new Set([
      'oil-fire',
      'fire-patrol',
      'rainstorm',
      'gas-leak',
      'scald',
    ]),
    orders = new Set([2, 3, 4, 5, 6]);
  for (const e of read(path.join(base, 'content/catalog.json'))) {
    ids.add(e.id);
    orders.add(
      read(path.join(base, 'content/levels', e.id, 'level.json')).order,
    );
  }
  for (const dir of fs.readdirSync(path.join(base, 'content/disaster'))) {
    const f = path.join(base, 'content/disaster', dir, 'rules.json');
    if (fs.existsSync(f)) {
      const r = read(f);
      ids.add(r.id);
      orders.add(r.order);
    }
  }
  for (const e of entries) {
    const r = read(packFiles(e, base).rules);
    need(
      !ids.has(e.id) && !orders.has(r.order),
      'Global level ID/order collision: ' + e.id,
    );
    ids.add(e.id);
    orders.add(r.order);
  }
  const lines = ['// Generated by scripts/hunts.mjs sync. Do not hand-edit.'];
  const packs = [];
  for (const [i, e] of entries.filter((e) => e.enabled).entries()) {
    // Existing shipped content keeps its identity. New/re-skinned releases require current review.
    await check(e, base, { release: !e.migrated });
    const members = [];
    for (const [key, f] of Object.entries(packFiles(e, base)))
      if (fs.existsSync(f)) {
        lines.push(
          `import p${i}_${key} from '@/` +
            path.relative(base, f).replaceAll('\\', '/') +
            "';",
        );
        members.push(`${key}:p${i}_${key}`);
      }
    packs.push('{' + members.join(',') + '}');
  }
  lines.push('export const generatedHuntPacks = [' + packs.join(',\n') + '];');
  writeAtomic(
    path.join(base, 'app/game/scene-hunt/generated.ts'),
    lines.join('\n') + '\n',
  );
  return entries.filter((e) => e.enabled).length;
}
export function createJobs(jobs, base = root) {
  const entries = catalog(base),
    used = new Set(entries.map((e) => e.id)),
    orders = new Set([1, 2, 3, 4, 5, 6]);
  for (const e of entries) orders.add(read(packFiles(e, base).rules).order);
  for (const e of read(path.join(base, 'content/catalog.json'))) {
    used.add(e.id);
    orders.add(
      read(path.join(base, 'content/levels', e.id, 'level.json')).order,
    );
  }
  for (const name of fs.readdirSync(path.join(base, 'content/disaster'))) {
    const f = path.join(base, 'content/disaster', name, 'rules.json');
    if (fs.existsSync(f)) {
      const r = read(f);
      used.add(r.id);
      orders.add(r.order);
    }
  }
  ['oil-fire', 'fire-patrol', 'rainstorm', 'gas-leak', 'scald'].forEach((id) =>
    used.add(id),
  );
  need(
    Array.isArray(jobs) && jobs.length > 0 && jobs.length <= 50,
    'Batch must contain 1–50 jobs',
  );
  const template = read(path.join(base, 'content/hunt-template/template.json')),
    prepared = [];
  for (const j of jobs) {
    need(
      j &&
        Object.keys(j).every((k) =>
          ['id', 'title', 'order', 'count'].includes(k),
        ) &&
        validId(j.id) &&
        !used.has(j.id),
      'Invalid/duplicate ID: ' + j?.id,
    );
    need(
      j.title?.trim() &&
        Number.isInteger(j.order) &&
        j.order > 6 &&
        !orders.has(j.order),
      'Invalid title/order: ' + j.id,
    );
    const count = j.count ?? 5;
    need(
      Number.isInteger(count) && count >= 3 && count <= 6,
      'Target count must be 3–6',
    );
    const dir = path.join(base, 'content/scenes', j.id);
    need(!fs.existsSync(dir), 'Refuse existing directory: ' + j.id);
    const t = structuredClone(template),
      prefix = '/levels/hunts/' + j.id + '/paperbook';
    const rules = {
      ...t.rules,
      id: j.id,
      title: j.title,
      order: j.order,
      targets: Array.from({ length: count }, (_, i) => ({
        id: 'target-' + (i + 1),
        name: 'TODO 目标名称',
        lesson: 'TODO 经核实的知识',
      })),
    };
    const skin = {
      ...t.skin,
      scene: prefix + '/scene.webp',
      clean: prefix + '/clean.webp',
      safe: prefix + '/ending.webp',
      mask: prefix + '/id-mask.png',
      family: prefix + '/family.png',
      effects: { characterMask: prefix + '/character-mask.png' },
      targets: Object.fromEntries(
        rules.targets.map((r, i) => [
          r.id,
          {
            color: t.colors[i],
            bounds: { x: 0, y: 0, w: 1, h: 1 },
            icon: prefix + '/' + r.id + '.png',
          },
        ]),
      ),
    };
    prepared.push({ dir, rules, skin, t });
    used.add(j.id);
    orders.add(j.order);
  }
  // Whole batch preflight first. An IO interruption leaves only unregistered drafts.
  for (const p of prepared) {
    fs.mkdirSync(path.join(p.dir, 'skins'), { recursive: true });
    writeAtomic(path.join(p.dir, 'rules.json'), json(p.rules));
    writeAtomic(path.join(p.dir, 'skins/paperbook.json'), json(p.skin));
    for (const k of ['presentation', 'performance', 'brief'])
      writeAtomic(path.join(p.dir, k + '.json'), json(p.t[k]));
    entries.push({
      id: p.rules.id,
      skin: 'skins/paperbook.json',
      enabled: false,
    });
  }
  writeAtomic(path.join(base, 'content/scenes/catalog.json'), json(entries));
  return prepared.length;
}
export function generatePrompts(entry, base = root) {
  const pack = readPack(entry, base),
    brief = read(path.join(base, 'content/scenes', entry.id, 'brief.json'));
  const style = read(
    path.join(base, 'content/hunt-template/styles', brief.style + '.json'),
  );
  const contract = fs.readFileSync(
    path.join(base, 'content/hunt-template/prompts.md'),
    'utf8',
  );
  const out = contract
    .replaceAll('{{TITLE}}', pack.rules.title)
    .replaceAll('{{ID}}', entry.id)
    .replaceAll('{{COUNT}}', String(pack.rules.targets.length))
    .replaceAll(
      '{{TARGETS}}',
      pack.rules.targets
        .map((t) => `${t.id}：${t.name}；${t.lesson}`)
        .join('\n'),
    )
    .replaceAll('{{STYLE}}', style.description)
    .replaceAll('{{SCENE}}', brief.scene)
    .replaceAll('{{CHARACTERS}}', brief.characters)
    .replaceAll('{{SIZE}}', `${pack.skin.width}×${pack.skin.height}`);
  const file = path.join(
    base,
    'outputs/hunt-prompts',
    entry.id,
    Date.now() + '.md',
  );
  writeAtomic(file, out);
  return file;
}
export async function cli(args = process.argv.slice(2), base = root) {
  const [cmd = 'check', ...rest] = args,
    option = (n) => {
      const i = rest.indexOf('--' + n);
      return i < 0 ? undefined : rest[i + 1];
    };
  const entries = catalog(base),
    entry = entries.find((e) => e.id === option('id'));
  if (cmd === 'create' || cmd === 'batch')
    return createJobs(
      cmd === 'batch'
        ? read(option('file'))
        : [
            {
              id: option('id'),
              title: option('title'),
              order: Number(option('order')),
              count: Number(option('count') ?? 5),
            },
          ],
      base,
    );
  if (cmd === 'sync') return sync(base);
  if (cmd === 'check') {
    need(!option('id') || entry, 'Unknown --id');
    return Promise.all(
      (entry ? [entry] : entries.filter((e) => e.enabled)).map((e) =>
        check(e, base, { release: !e.migrated && !rest.includes('--draft') }),
      ),
    );
  }
  need(entry, 'Specify an existing --id');
  if (cmd === 'prompts') return generatePrompts(entry, base);
  if (cmd === 'inspect')
    return {
      fingerprint: fingerprint(entry, base),
      layout: (await getHuntRuntime()).auditHuntViewport(
        readPack(entry, base).skin,
      ),
    };
  if (cmd === 'production') {
    const name = option('name') ?? 'paperbook';
    need(validId(name), 'Invalid --name');
    const candidate = { ...entry, skin: 'skins/' + name + '.json' },
      s = readPack(candidate, base).skin;
    const dir = path.join(base, 'art-source/hunts', entry.id, name);
    need(!fs.existsSync(dir), 'Refuse existing production directory');
    const spec = {
      pipelineVersion: 3,
      id: entry.id,
      authorId: entry.id,
      skinName: name,
      sourceSha256: 'TODO',
      draftSkinSha256: digest(fs.readFileSync(packFiles(candidate, base).skin)),
      world: [s.width, s.height],
      output: 'public/levels/hunts/' + entry.id + '/' + name,
      skin: 'content/scenes/' + entry.id + '/skins/' + name + '.json',
      targets: Object.entries(s.targets).map(([id, t]) => ({
        id,
        color: t.color,
      })),
      criticalRegions: s.criticalRegions ?? [],
      corrections: { targets: {}, characters: {} },
      effects: {},
    };
    fs.mkdirSync(dir, { recursive: true });
    writeAtomic(path.join(dir, 'production.json'), json(spec));
    return path.join(dir, 'production.json');
  }
  if (cmd === 'skin') {
    const id = option('name');
    need(validId(id), 'Invalid --name');
    const target = path.join(
      base,
      'content/scenes',
      entry.id,
      'skins',
      id + '.json',
    );
    need(!fs.existsSync(target), 'Refuse existing skin');
    const s = readPack(entry, base).skin,
      old = s.scene.slice(0, s.scene.lastIndexOf('/')),
      prefix = '/levels/hunts/' + entry.id + '/' + id;
    writeAtomic(
      target,
      json(JSON.parse(JSON.stringify(s).split(old).join(prefix))),
    );
    return {
      file: target,
      rulesUnchanged: digest(fs.readFileSync(packFiles(entry, base).rules)),
      note: 'New paths only; create new art and recalibrate all masks/regions. No assets copied or auto-activated.',
    };
  }
  if (cmd === 'review-template') {
    const name = option('skin') ?? entry.skin;
    need(/^(skin|skins\/[a-z][a-z0-9-]*)\.json$/.test(name), 'Invalid --skin');
    const candidate = { ...entry, skin: name },
      fp = fingerprint(candidate, base);
    const file = path.join(
      base,
      'content/scenes',
      entry.id,
      'reviews',
      path.basename(name, '.json') + '.json',
    );
    need(
      !fs.existsSync(file),
      'Review exists; explicitly revise it instead of overwrite',
    );
    const report = {
      fingerprint: fp.sha256,
      ...Object.fromEntries(
        ['knowledge', 'art', 'mobile', 'playthrough', 'offline'].map((k) => [
          k,
          { status: 'not_run', reviewer: '', evidence: '' },
        ]),
      ),
    };
    writeAtomic(file, json(report));
    return file;
  }
  if (cmd === 'select-skin' || cmd === 'enable' || cmd === 'disable') {
    const candidate = { ...entry };
    if (cmd === 'select-skin') {
      const name = option('name');
      need(validId(name), 'Invalid --name');
      candidate.skin = 'skins/' + name + '.json';
      delete candidate.migrated;
    }
    if (cmd === 'enable') {
      candidate.enabled = true;
      delete candidate.migrated;
    }
    if (cmd === 'disable') candidate.enabled = false;
    else await check(candidate, base, { release: true });
    entries[entries.indexOf(entry)] = candidate;
    writeAtomic(path.join(base, 'content/scenes/catalog.json'), json(entries));
    return 'Catalog updated; run hunts:sync';
  }
  throw Error(
    'Commands: create batch check sync prompts inspect skin review-template select-skin enable disable',
  );
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(import.meta.filename)
)
  cli()
    .then((r) => console.log(json(r)))
    .catch((e) => {
      console.error('FAIL: ' + e.message);
      process.exitCode = 1;
    });
