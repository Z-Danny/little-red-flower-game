import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { dependency, root } from './lib/dependencies.mjs';
import { placementExporter } from './lib/placement-export.mjs';
const args = process.argv.slice(2),
  command = args.shift(),
  oi = args.indexOf('--output');
if (oi < 0 || !args[oi + 1])
  throw new Error(
    '用法：node scripts/placement-batch.mjs sample|check|build [plan.json] --output 输出路径',
  );
const output = resolve(args[oi + 1]);
args.splice(oi, 2);
const modulePath = join(
  mkdtempSync(join(tmpdir(), 'placement-production-')),
  'runtime.mjs',
);
await dependency('esbuild').build({
  absWorkingDir: root,
  stdin: {
    contents:
      "export * from './app/game/placement/model'; export * from './app/game/placement/production'; export * from './app/game/placement/example-plan'; export * from './app/game/placement/sound';",
    resolveDir: root,
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: modulePath,
  logLevel: 'silent',
});
const runtime = await import(pathToFileURL(modulePath).href);
const write = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
};
if (command === 'sample') {
  write(output, runtime.examplePlan);
  console.log(output);
} else {
  if (!['check', 'build'].includes(command) || args.length !== 1)
    throw new Error('需要一个策划案文件；命令 sample / check / build');
  const batch = runtime.parseBatch(readFileSync(resolve(args[0]), 'utf8'));
  const reports = {
    engine: 'placement-test-v2',
    batchId: batch.id,
    results: batch.results.map(({ project, ...result }) => ({
      ...result,
      manualVisual: 'not_run',
      listening: 'not_run',
      physicalDevice: 'not_run',
    })),
  };
  if (command === 'check') write(output, reports);
  else {
    if (existsSync(output) && readdirSync(output).length)
      throw new Error(
        '输出目录非空，请使用新批次目录，避免旧关卡被误认成新结果',
      );
    mkdirSync(output, { recursive: true });
    write(join(output, '批量检查报告.json'), reports);
    write(
      join(output, '策划案生产卡.json'),
      JSON.parse(readFileSync(resolve(args[0]), 'utf8').replace(/^\uFEFF/, '')),
    );
    write(join(output, '全部关卡.batch.json'), batch);
    const exportHtml = await placementExporter(),
      manifest = [];
    for (const r of batch.results)
      if (r.status === 'ready') {
        const dir = join(output, r.id);
        mkdirSync(dir, { recursive: true });
        write(join(dir, `${r.id}.placement.json`), r.project);
        const cues = [
          ...Object.entries(r.project.audio.objects).flatMap(
            ([object, sounds]) =>
              Object.entries(sounds).map(([event, sound]) => ({
                id: `${object}-${event}`,
                object,
                event,
                sound,
              })),
          ),
          ...Object.entries(r.project.audio.actions).flatMap(([action, cues]) =>
            cues.map((cue, i) => ({
              id: `${action}-action-${i + 1}`,
              action,
              at: cue.at,
              sound: cue.sound,
            })),
          ),
          ...Object.entries(r.project.audio.stages ?? {}).map(
            ([stage, sound]) => ({ id: `${stage}-stage`, stage, sound }),
          ),
        ];
        const audioDir = join(dir, '音效');
        mkdirSync(audioDir, { recursive: true });
        for (const cue of cues)
          writeFileSync(
            join(audioDir, `${cue.id}.wav`),
            cue.sound.src
              ? Buffer.from(cue.sound.src.split(',')[1], 'base64')
              : runtime.soundWav(cue.sound),
          );
        write(
          join(dir, '音效对应表.json'),
          cues.map((c) => ({ ...c, file: `音效/${c.id}.wav` })),
        );
        manifest.push(
          exportHtml({ ...batch, results: [r] }, dir, '开始试玩.html'),
        );
      }
    if (batch.results.some((r) => r.status === 'ready'))
      manifest.unshift(exportHtml(batch, output, '开始试玩.html'));
    write(join(output, '离线文件校验.json'), manifest);
    for (const name of [
      '策划案详细要求.md',
      '策划案填写模板.md',
      'E07设计与验收.md',
      'E07美术提示词.md',
    ]) {
      const file = join(root, 'docs/placement-engine', name);
      if (existsSync(file))
        writeFileSync(join(output, name), readFileSync(file));
    }
  }
  console.log(
    JSON.stringify(
      {
        output,
        ready: batch.results.filter((r) => r.status === 'ready').length,
        blocked: batch.results.filter((r) => r.status === 'blocked').length,
        issues: batch.results
          .filter((r) => r.status === 'blocked')
          .map((r) => ({ id: r.id, issues: r.issues })),
      },
      null,
      2,
    ),
  );
  if (batch.results.some((r) => r.status === 'blocked')) process.exitCode = 1;
}
