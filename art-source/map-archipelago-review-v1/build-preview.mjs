import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(directory, 'preview.html');
const outputPath = path.join(directory, 'review.html');
const mimeTypes = new Map([['.png', 'image/png'], ['.woff2', 'font/woff2']]);
let html = await readFile(sourcePath, 'utf8');
const references = [...new Set([
  ...[...html.matchAll(/\bsrc="([^"#][^"]*)"/g)].map(match => match[1]),
  ...[...html.matchAll(/url\('([^']+)'\)/g)].map(match => match[1]),
])].filter(reference => !/^(?:data:|https?:)/.test(reference));

const embedded = [];
for (const reference of references) {
  const assetPath = path.resolve(directory, reference);
  let content;
  try { content = await readFile(assetPath); }
  catch (error) { throw new Error(`缺少预览素材：${assetPath}`, { cause: error }); }
  const mimeType = mimeTypes.get(path.extname(assetPath));
  if (!mimeType) throw new Error(`不支持的素材格式：${assetPath}`);
  html = html.split(reference).join(`data:${mimeType};base64,${content.toString('base64')}`);
  embedded.push({ name: reference, bytes: content.byteLength });
}

await mkdir(directory, { recursive: true });
await writeFile(outputPath, html);
console.log(JSON.stringify({ output: outputPath, embedded, bytes: Buffer.byteLength(html) }, null, 2));
