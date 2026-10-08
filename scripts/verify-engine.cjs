const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const dir = path.join(__dirname, '../engine');
const metadata = JSON.parse(fs.readFileSync(path.join(dir, 'provenance.json')));
for (const [name, expected] of Object.entries(metadata.files)) {
    const bytes = fs.readFileSync(path.join(dir, name));
    if (bytes.length !== expected.bytes || crypto.createHash('sha256').update(bytes).digest('hex') !== expected.sha256)
        throw new Error(`Engine verification failed: ${name}`);
}
const imports = WebAssembly.Module.imports(new WebAssembly.Module(fs.readFileSync(path.join(dir, 'pikafish.wasm'))));
if (imports.some(entry => entry.kind === 'memory' || /pthread|atomic/.test(entry.name))) throw new Error('Unexpected threading import');
if (fs.readFileSync(path.join(dir, 'pikafish.js'), 'utf8').includes('SharedArrayBuffer')) throw new Error('SharedArrayBuffer dependency');
const multiImports = WebAssembly.Module.imports(new WebAssembly.Module(fs.readFileSync(path.join(dir, 'pikafish-multi.wasm'))));
if (!multiImports.some(entry => entry.kind === 'memory') || !multiImports.some(entry => /pthread|atomic/.test(entry.name)))
    throw new Error('Missing real pthread/shared-memory imports');
const multiLoader = fs.readFileSync(path.join(dir, 'pikafish-multi.js'), 'utf8');
if (!multiLoader.includes('SharedArrayBuffer') || multiLoader.includes('1 + navigator.hardwareConcurrency') ||
    !multiLoader.includes('var pthreadPoolSize = Module["pthreadPoolSize"] || 2;')) throw new Error('Unbounded pthread pool');
const notice = "/* Modified for chinese-chess-game on 2026-10-09: bound pthread pool through Module.pthreadPoolSize.\n * Pikafish integration is GPL-3.0-or-later; see Copying.txt and AUTHORS. */\n";
if (!multiLoader.startsWith(notice)) throw new Error('Missing dated GPL modification notice');
const originalLoader = Buffer.from(multiLoader.replace(notice, '').replace('var pthreadPoolSize = Module["pthreadPoolSize"] || 2;', 'var pthreadPoolSize = 1 + navigator.hardwareConcurrency;'));
if (originalLoader.length !== metadata.originalMultiLoader.bytes || crypto.createHash('sha256').update(originalLoader).digest('hex') !== metadata.originalMultiLoader.sha256)
    throw new Error('Unexpected multi loader modifications');
console.log('All engine/source hashes verified; genuine pthread build + unshared single-thread fallback');
