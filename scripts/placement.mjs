import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { dependency, root } from './lib/dependencies.mjs';
const args = process.argv.slice(2),
  command = args.shift(),
  oi = args.indexOf('--output');
const output = oi >= 0 ? args[oi + 1] : undefined;
if (oi >= 0) {
  if (!output) throw new Error('--output 需要路径');
  args.splice(oi, 2);
}
const file = join(mkdtempSync(join(tmpdir(), 'placement-cli-')), 'runtime.mjs');
await dependency('esbuild').build({
  absWorkingDir: root,
  stdin: {
    contents:
      "export * from './app/game/placement/model'; export * from './app/game/placement/sample';",
    resolveDir: root,
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: file,
  logLevel: 'silent',
});
const runtime = await import(pathToFileURL(file).href);
const write = (value) => {
  const json = JSON.stringify(value, null, 2) + '\n';
  if (output) {
    const p = resolve(output);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, json);
    console.log(p);
  } else console.log(json);
};
if (command === 'sample') write(runtime.kitchenProject);
else if (command === 'check') {
  if (!args.length)
    throw new Error(
      '用法：node scripts/placement.mjs check a.json b.json --output report.json',
    );
  const reports = args.map((path) => {
    try {
      const project = JSON.parse(
          readFileSync(resolve(path), 'utf8').replace(/^\uFEFF/, ''),
        ),
        issues = runtime.inspectProject(project),
        simulation = runtime.simulateProject(project);
      return {
        file: resolve(path),
        passed:
          !issues.some((x) => x.severity === 'error') &&
          simulation.every((x) => x.passed),
        issues,
        simulation,
        manualVisual: 'not_run',
      };
    } catch (e) {
      return { file: resolve(path), passed: false, error: String(e) };
    }
  });
  write({ engine: 'placement-test-v1', reports });
  if (reports.some((r) => !r.passed)) process.exitCode = 1;
} else if (command === 'compile') {
  if (args.length !== 1)
    throw new Error(
      '用法：node scripts/placement.mjs compile input.json --output pack.json',
    );
  const project = runtime.parseProject(readFileSync(resolve(args[0]), 'utf8').replace(/^\uFEFF/, ''));
  if (project.flow) throw new Error('分阶段关卡不能导出为仅 rules+skin；请使用 placement-batch.mjs build 生成完整离线关卡');
  if (project.audio) console.error('注意：compile 仅导出基础规则皮肤；逐物品音效请使用完整 placement.json 或批量导出。');
  write(
    runtime.compileProject(
      runtime.parseProject(
        readFileSync(resolve(args[0]), 'utf8').replace(/^\uFEFF/, ''),
      ),
    ),
  );
} else
  throw new Error(
    '命令：sample / check / compile。check 支持多个文件；compile 输出通用运行器的 rules + skin 包。',
  );
