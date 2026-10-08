const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto, createHash } = require('node:crypto');
const scope = 'https://example.test/chinese-chess-game/';
const source = fs.readFileSync(require('node:path').join(__dirname, '../service-worker.js'), 'utf8');
const version = source.match(/const VERSION = '([^']+)'/)[1];
const bodies = { 'index.html': '<html>chess</html>', 'game.js': '/* game */', 'engine/pikafish.data': 'weights' };
const files = Object.entries(bodies).map(([path, body]) => ({ path, bytes: Buffer.byteLength(body), sha256: createHash('sha256').update(body).digest('hex') }));
const stores = new Map(), handlers = new Map(), messages = [], requests = [];
let missing = true, corrupt = false, online = true, serverVersion = version;
const caches = {
    async open(name) {
        if (!stores.has(name)) stores.set(name, new Map());
        const store = stores.get(name);
        return { match: async url => store.get(String(url))?.clone(), put: async (url, response) => store.set(String(url), response.clone()) };
    },
    keys: async () => [...stores.keys()],
    delete: async name => stores.delete(name)
};
const context = vm.createContext({ URL, Response, Uint8Array, crypto: webcrypto, caches,
    self: { location: { href: scope + 'service-worker.js' }, addEventListener: (name, handler) => handlers.set(name, handler),
        clients: { matchAll: async () => [{ postMessage: message => messages.push(message) }], claim: async () => {} } },
    fetch: async url => {
        if (!online) throw new Error('offline');
        const path = new URL(String(url)).pathname.slice('/chinese-chess-game/'.length);
        requests.push(path);
        if (path === 'precache.json') return new Response(JSON.stringify({ version: serverVersion, files }));
        if (path === 'engine/pikafish.data' && missing) return new Response('', { status: 404 });
        const body = path === 'index.html' ? bodies[path] + '<!-- injected markup -->' : bodies[path];
        return new Response(corrupt && path === 'game.js' ? body + 'bad' : body);
    }
});
vm.runInContext(source, context);
function event(name, extra = {}) {
    let result;
    handlers.get(name)({ ...extra, waitUntil: value => { result = value; }, respondWith: value => { result = value; } });
    return result;
}
(async () => {
    await assert.rejects(event('install'), /無法快取/);
    assert.equal(stores.size, 0, 'failed first download cannot leave a complete cache');
    assert.ok(!messages.some(message => message.type === 'cache-status' && message.ready));
    missing = false; corrupt = true;
    await assert.rejects(event('install'), /長度不符/);
    assert.equal(stores.size, 0, 'modified executable assets remain rejected');
    corrupt = false;
    await event('install'); await event('activate');
    assert.ok(messages.some(message => message.type === 'cache-status' && message.ready));
    online = false;
    const response = await event('fetch', { request: { method: 'GET', mode: 'navigate', url: scope } });
    assert.match(await response.text(), /injected markup/, 'modified HTML remains available offline');
    const store = [...stores.values()][0];
    store.delete(scope + 'engine/pikafish.data');
    let ready;
    await event('message', { data: { type: 'cache-status' }, source: { postMessage: message => { ready = message.ready; } } });
    assert.equal(ready, false);
    online = true; serverVersion = 'next-version'; requests.length = 0;
    await Promise.all([event('message', { data: { type: 'prepare-offline' } }), event('message', { data: { type: 'prepare-offline' } })]);
    assert.equal(requests.filter(path => path === 'engine/pikafish.data').length, 1, 'automatic repairs share one download');
    assert.ok(!requests.includes('index.html'), 'repair reuses verified cached resources');
    await event('message', { data: { type: 'cache-status' }, source: { postMessage: message => { ready = message.ready; } } });
    assert.equal(ready, true);
    store.delete(scope + 'index.html');
    await event('message', { data: { type: 'prepare-offline' } });
    await event('message', { data: { type: 'cache-status' }, source: { postMessage: message => { ready = message.ready; } } });
    assert.equal(ready, false, 'HTML from a new deployment cannot mix with old cached scripts');
    assert.equal(store.has(scope + 'index.html'), false);
    console.log('transformed HTML, interrupted install, executable integrity, offline navigation and active-version cache repair passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
