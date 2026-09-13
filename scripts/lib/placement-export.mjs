import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { Script } from 'node:vm';
import { dependency, root } from './dependencies.mjs';

export async function placementExporter() {
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
    plugins: [
      {
        name: 'external-batch-data',
        setup(build) {
          build.onResolve({ filter: /placement\/example-plan$/ }, () => ({
            path: 'empty-example-plan',
            namespace: 'placement',
          }));
          build.onLoad({ filter: /.*/, namespace: 'placement' }, () => ({
            contents: 'export const examplePlan = null;',
            loader: 'js',
          }));
        },
      },
    ],
  });
  let js = result.outputFiles[0].text;
  let css =
    'html,body{margin:0;padding:0}body{background:#edf0e8}button,input,textarea,select{font:inherit}\n' +
    readFileSync(join(root, 'app/placement.css'), 'utf8');
  const paths = [
    ...new Set(
      (js + css).match(
        /\/(?:levels|audio|fonts)\/[A-Za-z0-9_./-]+\.(?:png|webp|wav|mp3|ogg|woff2)/g,
      ) ?? [],
    ),
  ];
  const assets = [];
  for (const path of paths) {
    const data = readFileSync(join(root, 'public', path.slice(1))),
      mime = {
        png: 'image/png',
        webp: 'image/webp',
        wav: 'audio/wav',
        mp3: 'audio/mpeg',
        ogg: 'audio/ogg',
        woff2: 'font/woff2',
      }[path.split('.').at(-1)];
    const url = `data:${mime};base64,${data.toString('base64')}`;
    js = js.split(path).join(url);
    css = css.split(path).join(url);
    assets.push({
      path,
      sha256: createHash('sha256').update(data).digest('hex'),
    });
  }
  new Script(js);
  return (batch, output, filename = '放置测试引擎.html') => {
    const data = JSON.stringify(batch).replace(/</g, '\\u003c');
    const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>放置测试引擎 · 批量试玩</title><style>${css.replace(/<\/style/gi, '<\\/style')}</style></head><body><div id="placement-root"></div><script>globalThis.__PLACEMENT_BATCH__=${data};${js.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, filename), html);
    return {
      file: resolve(output, filename),
      bytes: Buffer.byteLength(html),
      sha256: createHash('sha256').update(html).digest('hex'),
      selfContained: true,
      assets,
    };
  };
}
