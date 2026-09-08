import { existsSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './lib/dependencies.mjs';
import { catalog, checkArt, checkPresets, getRuntime, hash, json, readJSON, readPackage, registrySource, validateCatalog, writeAtomic } from './lib/packages.mjs';

const [command = 'validate', ...args] = process.argv.slice(2);
const option = name => { const i = args.indexOf(`--${name}`); return i < 0 ? undefined : args[i + 1]; };
const flag = name => args.includes(`--${name}`);
const validId = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value);
try {
  if (command === 'validate') {
    const results = await validateCatalog({ art: !flag('rules-only') });
    const presets = await checkPresets({ art: !flag('rules-only') });
    console.log(`PASS: ${results.length} 个关卡/皮肤组合；规则、可达性${flag('rules-only') ? '' : '、资源文件与透明通道'}已校验。`);
    const report = join(root, 'outputs/level-pipeline/validation.json'); writeAtomic(report, json({ checkedAt: new Date().toISOString(), presets, results }));
  } else if (command === 'sync') {
    await validateCatalog();
    await checkPresets();
    writeAtomic(join(root, 'app/game/content/generated.ts'), registrySource(catalog()));
    console.log('已同步启用关卡。引擎与界面代码不需要修改。');
  } else if (command === 'create' || command === 'batch') {
    const entries = catalog(), runtime = await getRuntime();
    const jobs = command === 'batch' ? readJSON(option('file') ?? '') : [{ id: option('id'), kind: option('kind'), title: option('title'), order: Number(option('order')) }];
    if (!Array.isArray(jobs) || !jobs.length || jobs.length > 50) throw new Error('批量清单必须有 1～50 项');
    const used = new Set([...entries.map(e => e.id), 'typhoon-home','oil-fire','fire-patrol','rainstorm','gas-leak','scald']);
    const orders = new Set([1,2,3,4,5,6]); for (const entry of entries) orders.add((await readPackage(entry)).rules.order);
    const prepared = [];
    for (const job of jobs) {
      if (!job || Object.keys(job).some(k => !['id','kind','title','order'].includes(k)) || !validId(job.id) || used.has(job.id)) throw new Error(`非法/重复 ID：${job?.id}`);
      if (!['prevention','response'].includes(job.kind) || typeof job.title !== 'string' || !job.title.trim() || !Number.isInteger(job.order) || job.order <= 6 || orders.has(job.order)) throw new Error(`${job.id}: 类型、标题或编号错误（编号需 > 6 且不重复）`);
      const folder = join(root, 'content/levels', job.id); if (existsSync(folder)) throw new Error(`拒绝覆盖已有目录 ${folder}`);
      const template = join(root, 'content/templates', job.kind);
      const rules = { ...readJSON(join(template, 'level.json')), id: job.id, title: job.title, order: job.order };
      const skin = readJSON(join(template, 'skins/illustrated.json'));
      await checkArt(runtime.validatePackage(rules, skin));
      prepared.push({ folder, rules, skin }); used.add(job.id); orders.add(job.order);
    }
    // All logical checks precede writes. An IO interruption may leave a new unregistered
    // directory; never delete or overwrite it automatically. Existing packages are untouched.
    for (const job of prepared) {
      mkdirSync(join(job.folder, 'skins'), { recursive: true });
      writeAtomic(join(job.folder, 'level.json'), json(job.rules)); writeAtomic(join(job.folder, 'skins/illustrated.json'), json(job.skin));
      entries.push({ id: job.rules.id, skin: 'illustrated', enabled: false });
    }
    writeAtomic(join(root, 'content/catalog.json'), json(entries));
    console.log(`已创建 ${prepared.length} 个草稿，默认不对玩家开放。请替换内容和美术、验收后启用。`);
  } else if (command === 'skin') {
    const entries = catalog(), entry = entries.find(e => e.id === option('level')), id = option('id');
    if (!entry || !validId(id)) throw new Error('需要已有 --level 和新 --id');
    const pack = await readPackage(entry), target = join(root, 'content/levels', entry.id, 'skins', `${id}.json`);
    if (existsSync(target)) throw new Error('拒绝覆盖已有皮肤');
    writeAtomic(target, json({ ...pack.skin, id })); console.log(`已克隆皮肤 ${id}，尚未切换；规则 SHA-256 ${hash(pack.rules)} 不变。`);
  } else if (command === 'enable' || command === 'disable' || command === 'select-skin') {
    const entries = catalog(), entry = entries.find(e => e.id === option('id'));
    if (!entry) throw new Error('找不到 --id 指定的关卡');
    if (command === 'enable' && !flag('reviewed')) throw new Error('请先完成视觉与试玩验收，再使用 --reviewed；自动校验不等于人工验收');
    if (command === 'select-skin') { if (!validId(option('skin'))) throw new Error('无效 --skin'); entry.skin = option('skin'); }
    else entry.enabled = command === 'enable';
    const pack = await readPackage(entry); await checkArt(pack);
    writeAtomic(join(root, 'content/catalog.json'), json(entries));
    console.log('已更新清单，请运行 pnpm levels:sync；构建和离线导出也会自动同步。');
  } else throw new Error('命令：validate / sync / create / batch / skin / select-skin / enable / disable');
} catch (error) { console.error(`FAIL: ${error.message}`); process.exitCode = 1; }
