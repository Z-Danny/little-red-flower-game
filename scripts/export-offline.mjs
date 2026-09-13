import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  copyFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import { execFileSync } from 'node:child_process';
import {
  catalog as huntCatalog,
  check as checkHuntAssets,
  packFiles,
} from './hunts.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
execFileSync(process.execPath, [join(root, 'scripts/levels.mjs'), 'sync'], {
  cwd: root,
  stdio: 'inherit',
});
const outputArg = process.argv.indexOf('--output');
if (outputArg >= 0)
  assert.ok(process.argv[outputArg + 1], '--output requires a directory');
const output =
  outputArg < 0
    ? join(root, 'outputs', '本地离线版')
    : resolve(root, process.argv[outputArg + 1]);
const previewIndex = process.argv.indexOf('--preview-hunt');
const previewId = previewIndex < 0 ? null : process.argv[previewIndex + 1];
let previewSource;
if (previewIndex >= 0) {
  assert.ok(
    previewId && outputArg >= 0 && output.includes('hunt-preview'),
    '预览必须指定 --preview-hunt ID --output outputs/hunt-preview/ID，不能覆盖正式包',
  );
  const entries = huntCatalog(),
    entry = entries.find((e) => e.id === previewId);
  assert.ok(entry, '找不到预览关卡');
  const si = process.argv.indexOf('--preview-skin');
  const candidate = {
    ...entry,
    ...(si < 0 ? {} : { skin: process.argv[si + 1] }),
  };
  assert.ok(
    /^(skin|skins\/[a-z][a-z0-9-]*)\.json$/.test(candidate.skin),
    'Invalid preview skin',
  );
  await checkHuntAssets(candidate, root);
  const selected = [
    ...entries.filter((e) => e.enabled && e.id !== previewId),
    candidate,
  ];
  const lines = [],
    packs = [];
  selected.forEach((e, i) => {
    const members = [];
    for (const [key, file] of Object.entries(packFiles(e)))
      if (existsSync(file)) {
        lines.push(
          `import a${i}_${key} from ${JSON.stringify(file.replaceAll('\\', '/'))};`,
        );
        members.push(`${key}:a${i}_${key}`);
      }
    packs.push('{' + members.join(',') + '}');
  });
  previewSource =
    lines.join('\n') +
    '\nexport const generatedHuntPacks=[' +
    packs.join(',') +
    '];';
}
const require = createRequire(import.meta.url);
const esbuildRoot = existsSync(join(root, 'node_modules', 'esbuild'))
  ? join(root, 'node_modules', 'esbuild')
  : readdirSync(join(root, 'node_modules', '.pnpm'))
      .filter((name) => /^esbuild@/.test(name))
      .map((name) =>
        join(root, 'node_modules', '.pnpm', name, 'node_modules', 'esbuild'),
      )
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
  plugins: previewSource
    ? [
        {
          name: 'isolated-hunt-preview',
          setup(build) {
            build.onLoad({ filter: /scene-hunt[\\/]generated\.ts$/ }, () => ({
              contents: previewSource,
              loader: 'ts',
              resolveDir: root,
            }));
          },
        },
      ]
    : [],
});

let javascript = result.outputFiles[0].text;
let css = readFileSync(join(root, 'app', 'globals.css'), 'utf8').replace(
  /^@import\s+[^;]+;\s*/gm,
  '',
);
css += '\n' + readFileSync(join(root, 'app', 'typhoon.css'), 'utf8');
css += '\n' + readFileSync(join(root, 'app', 'kitchen.css'), 'utf8');
css += '\n' + readFileSync(join(root, 'app', 'configured.css'), 'utf8');
css += '\n' + readFileSync(join(root, 'app', 'leaderboard.css'), 'utf8');
css += '\n' + readFileSync(join(root, 'app', 'scene-hunt.css'), 'utf8');
css += '\n' + readFileSync(join(root, 'app', 'disaster.css'), 'utf8');
css += '\n' + readFileSync(join(root, 'app', 'challenge-hud.css'), 'utf8');
css += '\n' + readFileSync(join(root, 'app', 'game-viewport.css'), 'utf8');
css += '\n' + readFileSync(join(root, 'app', 'garden.css'), 'utf8');
css += '\n' + readFileSync(join(root, 'app', 'typography.css'), 'utf8');
css += '\n' + readFileSync(join(root, 'app', 'map-signals.css'), 'utf8');
css += '\n' + readFileSync(join(root, 'app', 'title-screen.css'), 'utf8');
css += '\n' + readFileSync(join(root, 'app', 'journey-frame.css'), 'utf8');
css += '\n' + readFileSync(join(root, 'app', 'placement.css'), 'utf8');
// Keep the OFL notices in the single-file distribution as well as in source.
for (const license of ['WenKai-OFL.txt', 'NotoSansSC-OFL.txt']) {
  css +=
    '\n/* ' +
    license +
    '\n' +
    readFileSync(join(root, 'public', 'fonts', license), 'utf8').replaceAll(
      '*/',
      '* /',
    ) +
    '\n*/';
}
// The game components use authored CSS, not Tailwind utility classes.
css =
  'html{line-height:1.5;-webkit-text-size-adjust:100%}svg{display:block;vertical-align:middle}button{color:inherit}button:disabled{cursor:default}\n' +
  css;

const embeddedAssets = [];
const assetUrls = [
  ...new Set(
    (javascript + css).match(
      /\/(?:(?:levels|audio|fonts)\/[A-Za-z0-9_./-]+|emergency-home)\.(?:png|webp|wav|mp3|ogg|woff2)/g,
    ) ?? [],
  ),
];
for (const assetUrl of assetUrls) {
  const bytes = readFileSync(join(root, 'public', assetUrl.slice(1)));
  const extension = assetUrl.split('.').at(-1),
    mime = {
      png: 'image/png',
      webp: 'image/webp',
      wav: 'audio/wav',
      mp3: 'audio/mpeg',
      ogg: 'audio/ogg',
      woff2: 'font/woff2',
    }[extension];
  const dataUrl = `data:${mime};base64,${bytes.toString('base64')}`;
  javascript = javascript.split(assetUrl).join(dataUrl);
  css = css.split(assetUrl).join(dataUrl);
  embeddedAssets.push({
    path: assetUrl,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}

// Validate the self-contained payload before producing the distributable.
new Script(javascript, { filename: 'offline-game.js' });
assert.ok(
  !/^\s*(?:import|export)\s/m.test(javascript),
  '离线脚本不能保留模块导入。',
);
assert.ok(!/@import\s/.test(css), '离线样式不能保留外部导入。');
assert.ok(
  css.includes('.lb-page') &&
    javascript.includes('little-red-flower-leaderboard-v1'),
  '离线版必须包含排行榜及其样式。',
);
assert.ok(
  !/url\(\s*['"]?(?:https?:|\/levels\/|\/fonts\/|\/emergency-home)/i.test(css),
  '离线样式不能依赖外部图片或字体。',
);
assert.ok(
  !/\/levels\/[\w/.-]+\.(?:png|webp)/.test(javascript),
  '关卡图片必须内嵌。',
);
assert.ok(
  !/\/audio\/[\w/.-]+\.(?:wav|mp3|ogg)/.test(javascript),
  '语音必须内嵌。',
);
assert.ok(
  !embeddedAssets.some((a) => a.path.startsWith('/audio/typhoon-v2/')),
  '台风关禁止打包 AI 朗读。',
);
assert.ok(
  !embeddedAssets.some((a) => /\/voice-|\/tts-/i.test(a.path)),
  '禁止打包文字朗读音频。',
);
assert.ok(
  !/speechSynthesis|SpeechSynthesisUtterance/.test(javascript),
  '禁止运行时文字朗读。',
);

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
const documentShell = html.replace(
  /<script>[\s\S]*<\/script>/,
  '<script></script>',
);
assert.equal((documentShell.match(/<script>/g) ?? []).length, 1);
assert.ok(
  !/<(?:script|link|img)\b[^>]*(?:src|href)\s*=/i.test(documentShell),
  'HTML 不能请求外部资源。',
);

mkdirSync(output, { recursive: true });
const htmlPath = join(output, '小红花应急行动.html');
writeFileSync(htmlPath, html, 'utf8');
copyFileSync(join(root, 'offline', 'README.md'), join(output, '使用说明.md'));
const manifest = {
  mode: previewId ? 'draft-preview-not-production' : 'production',
  previewId,
  file: '小红花应急行动.html',
  bytes: Buffer.byteLength(html),
  sha256: createHash('sha256').update(html).digest('hex'),
  selfContained: true,
  networkPolicy: 'connect-src none',
  embeddedAssets,
  sources: Object.keys(result.metafile.inputs)
    .filter(path => !path.replaceAll('\\', '/').includes('node_modules/'))
    .filter(path => existsSync(resolve(root, path)))
    .map(path => ({ path: path.replaceAll('\\', '/'), sha256: createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex') })),
  checks: [
    'JavaScript syntax',
    'No external module imports',
    'No CSS imports',
    'Embedded scene images',
    'Single inline script',
    'No external HTML resource references',
    'No typhoon AI narration assets',
  ],
};
writeFileSync(
  join(output, '导出校验.json'),
  JSON.stringify(manifest, null, 2) + '\n',
  'utf8',
);
console.log(
  JSON.stringify(
    {
      htmlPath,
      bytes: manifest.bytes,
      sha256: manifest.sha256,
      checks: manifest.checks.length,
    },
    null,
    2,
  ),
);
