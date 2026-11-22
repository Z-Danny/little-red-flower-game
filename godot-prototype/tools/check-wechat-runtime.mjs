// Static audit only. Run with Node 24 and --experimental-vm-modules; no template code executes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';
import { SourceTextModule } from 'node:vm';
import { brotliDecompressSync } from 'node:zlib';

const [, , directory, report] = process.argv;
if (!directory || !report) {
  throw new Error('Usage: node --experimental-vm-modules check-wechat-runtime.mjs <game-directory> <manifest.json>');
}
const root = resolve(directory);
const manifest = JSON.parse(readFileSync(report, 'utf8'));
const hash = (data) => createHash('sha256').update(data).digest('hex');

function walk(sub = '') {
  return readdirSync(join(root, sub), { withFileTypes: true }).flatMap((entry) => {
    const name = posix.join(sub, entry.name);
    if (entry.isDirectory()) return walk(name);
    assert(entry.isFile(), `Expected a plain file: ${name}`);
    return [name];
  });
}

const names = walk().sort();
assert.deepEqual(names, Object.keys(manifest.files).sort());
const files = {};
for (const name of names) {
  files[name] = readFileSync(join(root, name));
  assert.deepEqual({ bytes: files[name].length, sha256: hash(files[name]) }, manifest.files[name], name);
}
const jsFiles = names.filter((name) => name.endsWith('.js'));
for (const name of jsFiles) {
  const text = files[name].toString('utf8');
  new SourceTextModule(text, { identifier: name });
  for (const [, dep] of text.matchAll(/^import\s+['"](\.\.?\/[^'"]+)['"]/gm)) {
    const path = posix.join(posix.dirname(name), dep);
    assert(files[path] || files[`${path}.js`], `${name} references missing module ${dep}`);
  }
}
const game = JSON.parse(files['game.json']);
const config = JSON.parse(files['project.config.json']);
assert.deepEqual(game.subpackages, [{ name: 'engine', root: 'engine/' }]);
assert.equal(config.compileType, 'game');
assert.notEqual(config.appid, 'wxf40904ea6120ad08');
assert.match(files['godot-loader.js'].toString(), /loadSubpackage\(\{\s*name: "engine"/);
assert.match(files['engine/game.js'].toString(), /const exe = '\/engine\/godot';\s*const pack = '\/engine\/demo-pck\.bin';/);
assert.match(files['engine/godot.js'].toString(), /WebAssembly\.instantiate\(loadPath \+ "\.wasm\.br", imports\)/);
assert.equal(files['engine/demo-pck.bin'].subarray(0, 4).toString(), 'GDPC');
assert.equal(hash(files['engine/demo-pck.bin']), manifest.pck.sha256);
const mainBytes = names.filter((name) => !name.startsWith('engine/')).reduce((n, name) => n + files[name].length, 0);
const totalBytes = names.reduce((n, name) => n + files[name].length, 0);
assert.equal(mainBytes, manifest.main_package_size.bytes);
assert.equal(totalBytes, manifest.total_package_size.bytes);
assert(mainBytes <= 4_000_000 && totalBytes <= 30_000_000, 'Local package size exceeds the release check budget');

const wasm = brotliDecompressSync(files['engine/godot.wasm.br'], { maxOutputLength: 70_000_000 });
assert.equal(wasm.subarray(0, 8).toString('hex'), '0061736d01000000');
const wasmSha256 = hash(wasm);
assert.equal(wasmSha256, '169a4cf8c1eb6d82069260707d5c6bb18d67c887a1acf8512c6f8e75c13b999f');
const runtime = 'Godot Engine for Wechat v4.6.2.rc.custom_build';
assert(wasm.includes(Buffer.from(runtime)), 'Expected upstream build version marker');
assert(WebAssembly.validate(wasm), 'WASM module validation failed in this Node version');
console.log(JSON.stringify({
  artifact_inventory: 'pass', javascript_parse: 'pass', relative_js_imports: 'pass', js_files: jsFiles.length,
  main_package_bytes: mainBytes, total_package_bytes: totalBytes,
  brotli_wasm_validation: 'pass', wasm_bytes_decompressed: wasm.length, wasm_sha256_decompressed: wasmSha256,
  upstream_runtime_build: runtime, wechat_simulator: 'not_run', real_device: 'not_run',
}, null, 2));
