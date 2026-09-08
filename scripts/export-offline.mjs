import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
execFileSync(process.execPath, [join(root, 'scripts/levels.mjs'), 'sync'], { cwd: root, stdio: 'inherit' });
const output = join(root, 'outputs', '本地离线版');
const require = createRequire(import.meta.url);
const esbuildRoot = existsSync(join(root, 'node_modules', 'esbuild'))
  ? join(root, 'node_modules', 'esbuild')
  : readdirSync(join(root, 'node_modules', '.pnpm'))
    .filter((name) => /^esbuild@/.test(name))
    .map((name) => join(root, 'node_modules', '.pnpm', name, 'node_modules', 'esbuild'))
    .find((path) => existsSync(join(path, 'lib', 'main.js')));
assert.ok(esbuildRoot, '找不到项目内的 esbuild，请先安装项目依赖。');
const esbuild = require(esbuildRoot);

const result = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ['offline/main.tsx'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['es2020'],
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  minify: true,
  write: false,
  metafile: true,
  legalComments: 'inline',
  logLevel: 'silent',
});

let javascript = result.outputFiles[0].text;
let css = readFileSync(join(root, 'app', 'globals.css'), 'utf8')
  .replace(/^@import\s+[^;]+;\s*/gm, '');
css += '\n' + readFileSync(join(root, 'app', 'typhoon.css'), 'utf8');
css += '\n' + readFileSync(join(root, 'app', 'kitchen.css'), 'utf8');
css += '\n' + readFileSync(join(root, 'app', 'configured.css'), 'utf8');
// The game components use authored CSS, not Tailwind utility classes.
css = 'html{line-height:1.5;-webkit-text-size-adjust:100%}svg{display:block;vertical-align:middle}button{color:inherit}button:disabled{cursor:default}\n' + css;

const embeddedAssets = [];
const assetUrls = [...new Set((javascript + css).match(/\/(?:levels\/[A-Za-z0-9_./-]+|emergency-home)\.(?:png|webp)/g) ?? [])];
for (const assetUrl of assetUrls) {
  const bytes = readFileSync(join(root, 'public', assetUrl.slice(1)));
  const dataUrl = `data:image/${assetUrl.endsWith('.webp') ? 'webp' : 'png'};base64,${bytes.toString('base64')}`;
  javascript = javascript.split(assetUrl).join(dataUrl);
  css = css.split(assetUrl).join(dataUrl);
  embeddedAssets.push({ path: assetUrl, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}

// Validate the self-contained payload before producing the distributable.
new Script(javascript, { filename: 'offline-game.js' });
assert.ok(!/^\s*(?:import|export)\s/m.test(javascript), '离线脚本不能保留模块导入。');
assert.ok(!/@import\s/.test(css), '离线样式不能保留外部导入。');
assert.ok(!/url\(\s*['"]?(?:https?:|\/levels\/|\/emergency-home)/i.test(css), '离线样式不能依赖外部图片。');
assert.ok(!/\/levels\/[\w/.-]+\.(?:png|webp)/.test(javascript), '关卡图片必须内嵌。');

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light">
<meta name="description" content="小红花应急行动，本地离线版。包含当前已启用的训练关卡。">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'">
<title>小红花应急行动 · 本地离线版</title>
<style>${css.replace(/<\/style/gi, '<\\/style')}</style>
</head>
<body>
<div id="game-root"></div>
<noscript>请在浏览器中启用 JavaScript 后打开本游戏。</noscript>
<script>${javascript.replace(/<\/script/gi, '<\\/script')}</script>
</body>
</html>`;

assert.equal((html.match(/<\/script>/g) ?? []).length, 1);
const documentShell = html.replace(/<script>[\s\S]*<\/script>/, '<script></script>');
assert.equal((documentShell.match(/<script>/g) ?? []).length, 1);
assert.ok(!/<(?:script|link|img)\b[^>]*(?:src|href)\s*=/i.test(documentShell), 'HTML 不能请求外部资源。');

mkdirSync(output, { recursive: true });
const htmlPath = join(output, '小红花应急行动.html');
writeFileSync(htmlPath, html, 'utf8');
copyFileSync(join(root, 'offline', 'README.md'), join(output, '使用说明.md'));
const manifest = {
  file: '小红花应急行动.html',
  bytes: Buffer.byteLength(html),
  sha256: createHash('sha256').update(html).digest('hex'),
  selfContained: true,
  networkPolicy: 'connect-src none',
  embeddedAssets,
  checks: ['JavaScript syntax', 'No external module imports', 'No CSS imports', 'Embedded scene images', 'Single inline script', 'No external HTML resource references'],
};
writeFileSync(join(output, '导出校验.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ htmlPath, bytes: manifest.bytes, sha256: manifest.sha256, checks: manifest.checks.length }, null, 2));
