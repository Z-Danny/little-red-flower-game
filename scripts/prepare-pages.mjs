import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'outputs', '本地离线版', '小红花应急行动.html');
const target = resolve(root, 'site', 'index.html');

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);

console.log(JSON.stringify({ target, bytes: statSync(target).size }));
