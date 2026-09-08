import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
export const root = resolve(import.meta.dirname, '../..');
const require = createRequire(import.meta.url);
export function dependency(name) {
  const direct = join(root, 'node_modules', name);
  const found = existsSync(join(direct, 'package.json')) ? direct : readdirSync(join(root, 'node_modules/.pnpm'))
    .filter(n => n.startsWith(name + '@')).map(n => join(root, 'node_modules/.pnpm', n, 'node_modules', name)).find(p => existsSync(join(p, 'package.json')));
  if (!found) throw new Error(`缺少依赖 ${name}，请先 pnpm install`);
  return require(found);
}
