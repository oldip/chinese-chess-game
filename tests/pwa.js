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
    assert.equal(element.textContent, '已可離線遊玩');
    console.log('waiting update isolation and automatic preparation completion passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
