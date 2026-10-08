// Static deploy package plus a content-verified, versioned offline inventory.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
require('./verify-engine.cjs');
const root = path.resolve(__dirname, '..');
const files = ['index.html', 'styles.css', 'game.js', 'game-review.js', 'cloud-opening-book.js', 'pikafish-adapter.js', 'pikafish-worker.js', 'pwa.js', 'manifest.webmanifest',
    ...fs.readdirSync(path.join(root, 'books')).map(name => `books/${name}`),
    ...fs.readdirSync(path.join(root, 'icons')).map(name => `icons/${name}`),
    ...fs.readdirSync(path.join(root, 'engine')).map(name => `engine/${name}`)];
const serviceWorkerPath = path.join(root, 'service-worker.js');
const serviceWorker = fs.readFileSync(serviceWorkerPath, 'utf8');
const entries = files.map(file => {
    const bytes = fs.readFileSync(path.join(root, file));
    return { path: file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
});
// Content-derived generations prevent stale HTML from loading new WASM/NNUE.
const digest = crypto.createHash('sha256').update(JSON.stringify(entries)).update(serviceWorker.replace(/const VERSION = '[^']+'/, "const VERSION = 'BUILD'" )).digest('hex').slice(0, 16);
const version = `pikafish-${digest}`;
fs.writeFileSync(serviceWorkerPath, serviceWorker.replace(/const VERSION = '[^']+'/, `const VERSION = '${version}'`));
const inventory = { version, files: entries };
fs.writeFileSync(path.join(root, 'precache.json'), JSON.stringify(inventory, null, 2) + '\n');
for (const file of [...files, 'precache.json', 'service-worker.js']) {
    const target = path.join(root, 'dist', file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, file), target);
}
fs.writeFileSync(path.join(root, 'dist/.nojekyll'), '');
console.log(`${files.length} static resources; offline inventory + dist ready (${inventory.files.reduce((n, f) => n + f.bytes, 0)} bytes)`);
