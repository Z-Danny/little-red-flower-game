/** Loopback-only preview of the current offline export, with local asset URLs for fast inspection. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { dependency, root } from './lib/dependencies.mjs';
const folder = path.join(root, 'outputs/本地离线版');
const htmlFile = path.join(folder, '小红花应急行动.html');
const publicRoot = path.join(root, 'public');
const mime = {
  png: 'image/png',
  webp: 'image/webp',
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
};
let cache, pending;
async function document() {
  const stamp = fs.statSync(htmlFile).mtimeMs;
  if (cache?.stamp === stamp) return cache;
  if (pending) return pending;
  pending = (async () => {
    const result = await dependency('esbuild').build({
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
      logLevel: 'silent',
    });
    const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
    const html = fs
      .readFileSync(htmlFile, 'utf8')
      .replace(/<script>[\s\S]*<\/script>/, () => '<script>' + js + '</script>')
      .replace('img-src data: blob:', "img-src 'self' data: blob:")
      .replace('media-src data: blob:', "media-src 'self' data: blob:")
      .replace("connect-src 'none'", "connect-src 'self'");
    cache = {
      stamp,
      html,
      assets: new Set(
        JSON.parse(
          fs.readFileSync(path.join(folder, '导出校验.json'), 'utf8'),
        ).embeddedAssets.map((a) => a.path),
      ),
    };
    console.log('Preview refreshed from current export.');
    return cache;
  })();
  try {
    return await pending;
  } finally {
    pending = undefined;
  }
}
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname,
      view = await document();
    if (pathname === '/' || pathname === '/index.html') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(view.html);
      return;
    }
    const target = path.resolve(publicRoot, '.' + decodeURIComponent(pathname));
    if (
      !view.assets.has(pathname) ||
      !target.startsWith(publicRoot + path.sep)
    ) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, {
      'Content-Type':
        mime[path.extname(target).slice(1)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(target).pipe(res);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('预览暂不可用，请先完成离线导出。');
    console.error(error.message);
  }
});
server.listen(8087, '127.0.0.1', () =>
  console.log('Local: http://127.0.0.1:8087'),
);
