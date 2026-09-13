/** Non-browser regression gate. Does not update game sources or export delivery files. */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { root } from './lib/dependencies.mjs';

const output = path.join(root, 'docs/flood-rooftop/verification');
fs.mkdirSync(output, { recursive: true });
const archive = 'D:/中关村/小红花/test1/outputs/版本存档/洪水围困_室内待援版_20260913';
const excludedGeneratedFiles = [
  'docs/hazard-batch-v2/verification/batch-unit-report.json',
  'docs/hazard-batch-v2/verification/batch-unit-tests.tap',
];
const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const before = Object.fromEntries(excludedGeneratedFiles.map(file => [file, fs.existsSync(path.join(root, file)) ? digest(path.join(root, file)) : null]));
const run = (label, command, args, log) => new Promise(resolve => {
  const started = new Date().toISOString();
  const child = spawn(command, args, { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', data => { stdout += data.toString(); });
  child.stderr.on('data', data => { stderr += data.toString(); });
  child.on('error', error => { stderr += '\n' + error.stack; });
  child.on('close', code => {
    fs.writeFileSync(path.join(output, log), stdout + '\n' + stderr);
    const tests = [...stdout.matchAll(/(?:ℹ |# )tests (\d+)/g)].reduce((sum, match) => sum + Number(match[1]), 0);
    const result = { label, command: [command, ...args].join(' '), started, finished: new Date().toISOString(), exitCode: code, tests, log };
    console.log(JSON.stringify(result));
    resolve(result);
  });
});

// Use Node's adjacent npm CLI directly on Windows; no shell command concatenation.
const npmCli = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
if (process.platform === 'win32' && !fs.existsSync(npmCli)) throw new Error('Cannot find the npm CLI next to Node.js. Run npm test manually; do not guess a shell path.');
const checks = await Promise.all([
  run('full package test', process.platform === 'win32' ? process.execPath : 'npm', process.platform === 'win32' ? [npmCli, 'test'] : ['test'], 'full-tests.log'),
  run('TypeScript no emission or incremental cache', process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', '--incremental', 'false'], 'tsc.log'),
]);
const archiveManifest = JSON.parse(fs.readFileSync(path.join(archive, '版本清单.json')));
const htmlSha256 = digest(path.join(archive, '小红花应急行动.html'));
const archiveCheck = { expected: archiveManifest.htmlSha256, actual: htmlSha256, unchanged: htmlSha256 === archiveManifest.htmlSha256 };
const generatedArtifacts = excludedGeneratedFiles.map(file => ({ file, before: before[file], after: fs.existsSync(path.join(root, file)) ? digest(path.join(root, file)) : null, excludeFromTaskDelivery: true }));
const status = checks.every(check => check.exitCode === 0) && archiveCheck.unchanged ? 'passed' : 'failed';
fs.writeFileSync(path.join(output, 'non-browser-regression.json'), JSON.stringify({ status, checks, archive: archiveCheck, generatedArtifacts, browser: 'not_run_by_this_script', physicalPhone: 'not_run', humanListening: 'not_run' }, null, 2) + '\n');
console.log(JSON.stringify({ status, archive: archiveCheck, generatedArtifacts }));
process.exitCode = status === 'passed' ? 0 : 1;
