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
console.log('All engine/source hashes verified; unshared single-thread runtime');
