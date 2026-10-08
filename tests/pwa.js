const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const handlers = new Map(), commands = [];
const active = { postMessage: message => commands.push(message.type) };
const waiting = { addEventListener() {} };
const element = { textContent: '', dataset: {} };
const window = { isSecureContext: true, addEventListener() {}, dispatchEvent() {} };
const context = vm.createContext({ console, Event, window,
    navigator: { onLine: true, serviceWorker: { controller: active, addEventListener: (name, handler) => handlers.set(name, handler),
        register: async () => ({ installing: waiting, waiting, addEventListener() {} }) } },
    document: { getElementById: () => element, addEventListener() {} }
});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../pwa.js'), 'utf8'), context);
(async () => {
    const message = (source, data) => handlers.get('message')({ source, data });
    message(waiting, { type: 'cache-progress', loaded: 100, total: 100 });
    message(waiting, { type: 'cache-error', message: 'new update interrupted' });
    message(waiting, { type: 'cache-status', ready: true });
    assert.notEqual(element.dataset.ready, 'true', 'waiting version cannot claim active version ready');
    message(active, { type: 'cache-status', ready: false });
    assert.ok(commands.includes('prepare-offline'), 'waiting update progress cannot suppress active-cache repair');
    message(active, { type: 'cache-progress', loaded: 50, total: 100 });
    assert.match(element.textContent, /50%/);
    message(active, { type: 'cache-status', ready: true });
    assert.equal(await window.offlinePreparation, true, 'preparation settles after active generation completes');
    assert.equal(element.textContent, '');
    assert.equal(element.hidden, true, 'completed preparation quietly hides the status');
    message(active, { type: 'cache-progress', loaded: 1, total: 100 });
    assert.equal(element.hidden, false, 'a later repair still displays progress');
    console.log('waiting update isolation and automatic preparation completion passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

(async () => {
    const storage = new Map();
    async function visit(isolated, playing = false) {
        const listeners = new Map(); let reloads = 0, settled = false;
        const element = { dataset: {} };
        const window = { isSecureContext: true, crossOriginIsolated: isolated, addEventListener() {}, dispatchEvent() {},
            location: { pathname: '/chinese-chess-game/', reload: () => reloads++ },
            sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } };
        const controller = { postMessage() {} };
        vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../pwa.js'), 'utf8'), { console, Event, window,
            setupOpen: !playing, gameActive: playing,
            navigator: { onLine: true, serviceWorker: { controller, addEventListener: (name, handler) => listeners.set(name, handler),
                register: async () => ({ addEventListener() {} }) } },
            document: { getElementById: () => element, addEventListener() {} }
        });
        window.offlinePreparation.then(() => { settled = true; });
        const message = () => listeners.get('message')({ source: controller, data: { type: 'cache-status', ready: true } });
        message(); message(); await new Promise(resolve => setImmediate(resolve));
        return { reloads, settled };
    }
    assert.deepEqual(await visit(false, true), { reloads: 0, settled: true }, 'never reload an already started game');
    assert.deepEqual(await visit(false), { reloads: 1, settled: false }, 'reload only after verified cache and do not start a temporary engine');
    assert.deepEqual(await visit(false), { reloads: 0, settled: true }, 'failed isolation falls back without a reload loop');
    assert.deepEqual(await visit(true), { reloads: 0, settled: true }, 'isolated navigation needs no further reload');
    console.log('first-cache isolation reload, no reload loop and ongoing-game preservation passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
