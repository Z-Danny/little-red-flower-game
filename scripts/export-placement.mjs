import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { Script } from 'node:vm';
import assert from 'node:assert/strict';
import { dependency, root } from './lib/dependencies.mjs';
const index = process.argv.indexOf('--output');
if (index >= 0 && !process.argv[index + 1])
  throw new Error('--output 需要目录');
const output = resolve(
  root,
  index >= 0 ? process.argv[index + 1] : 'outputs/放置测试引擎',
);
const result = await dependency('esbuild').build({
  absWorkingDir: root,
  entryPoints: ['offline/placement.tsx'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  minify: true,
  write: false,
  logLevel: 'silent',
});
let javascript = result.outputFiles[0].text;
let css =
  'html,body{margin:0;padding:0}body{background:#edf0e8}button,input,textarea,select{font:inherit}\n' +
  readFileSync(join(root, 'app/placement.css'), 'utf8');
const assets = [
  ...new Set(
    (javascript + css).match(
      /\/(?:levels|audio|fonts)\/[A-Za-z0-9_./-]+\.(?:png|webp|wav|mp3|ogg|woff2)/g,
    ) ?? [],
  ),
];
const manifest = [];
for (const path of assets) {
  const bytes = readFileSync(join(root, 'public', path.slice(1)));
  const mime = {
    png: 'image/png',
    webp: 'image/webp',
    wav: 'audio/wav',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    woff2: 'font/woff2',
  }[path.split('.').at(-1)];
  const embedded = `data:${mime};base64,${bytes.toString('base64')}`;
  javascript = javascript.split(path).join(embedded);
  css = css.split(path).join(embedded);
  manifest.push({
    path,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}
new Script(javascript);
assert.ok(!/\/(?:levels|audio)\/[\w/.-]+\.(png|webp|wav)/.test(javascript));
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>放置测试引擎 V2 · E07 晃动开始了</title><style>${css.replace(/<\/style/gi, '<\\/style')}</style></head><body><div id="placement-root"></div><script>${javascript.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
mkdirSync(output, { recursive: true });
writeFileSync(join(output, '放置测试引擎.html'), html);
writeFileSync(
  join(output, '导出校验.json'),
  JSON.stringify(
    {
      engine: 'placement-test-v2',
      bytes: Buffer.byteLength(html),
      sha256: createHash('sha256').update(html).digest('hex'),
      selfContained: true,
      networkPolicy: 'connect-src none',
      assets: manifest,
    },
    null,
    2,
  ),
);
writeFileSync(
  join(output, '使用说明.md'),
  readFileSync(join(root, 'docs/placement-engine/README.md')),
);
console.log(
  JSON.stringify(
    { output, bytes: Buffer.byteLength(html), assets: assets.length },
    null,
    2,
  ),
);
