import { dependency, root } from './lib/dependencies.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const sharp = dependency('sharp');
const out = join(root, 'art-source/paperbook-v1');
mkdirSync(out, { recursive: true });
for (const level of ['kitchen', 'typhoon']) {
  const skin = JSON.parse(readFileSync(join(root, `content/presets/${level}/skin.json`), 'utf8'));
  const entries = Object.entries(skin.assets).filter(([key]) => key !== 'room');
  const width = 1200, cw = 240, ch = 280;
  const layers = [];
  for (let i=0; i<entries.length; i++) {
    const [key, path] = entries[i];
    const tile = await sharp(join(root, 'public', path)).resize(218, 234, {fit:'inside'}).png().toBuffer();
    const meta = await sharp(tile).metadata();
    const x = i % 5 * cw, y = Math.floor(i/5)*ch;
    layers.push({input:tile,left:x+Math.round((cw-meta.width)/2),top:y+30});
    layers.push({input:Buffer.from(`<svg width="240" height="30"><text x="12" y="23" font-size="20" fill="#f7ead0">${key}</text></svg>`),left:x,top:y});
  }
  await sharp({create:{width,height:Math.ceil(entries.length/5)*ch,channels:4,background:'#476665'}}).composite(layers).png().toFile(join(out, `${level}-contact.png`));
}
