const assert = require('node:assert/strict');
const { selectThreadCount, PikafishEngine } = require('../pikafish-adapter.js');
for (const [cores, memory, expected] of [[32,8,4],[4,8,3],[2,8,1],[1,8,1],[8,4,2],[8,2,1],[8,undefined,4],[undefined,8,1],[0,8,1]]) {
    assert.equal(selectThreadCount({ hardwareConcurrency: cores, deviceMemory: memory }), expected);
}
console.log('automatic CPU reservation, four-thread ceiling and low-memory caps passed');

class FakeWorker {
    constructor() { FakeWorker.instances.push(this); this.commands = []; }
    postMessage(data) {
        this.commands.push(data);
        queueMicrotask(() => {
            if (data.type === 'destroy') return setTimeout(() => this.emit({ type: 'destroyed' }), FakeWorker.destroyDelay || 0);
            if (data.type === 'init' && FakeWorker.hangMulti && data.mode === 'multi') return;
            if (data.type === 'init') return this.emit(FakeWorker.failMulti && data.mode === 'multi'
                ? { type: 'error', message: 'multi initialization failed' } : { type: 'ready' });
            if (data.command === 'uci') {
                for (const name of ['Threads', 'Hash', 'Skill Level']) this.emit({ type: 'line', line: `option name ${name} type spin default 1 min 1 max 1024` });
                this.emit({ type: 'line', line: 'uciok' });
            }
            if (data.command === 'isready') this.emit({ type: 'line', line: 'readyok' });
        });
    }
    emit(data) { this.onmessage?.({ data }); }
    terminate() { this.terminated = true; }
}
FakeWorker.instances = [];
(async () => {
    Object.defineProperty(globalThis.navigator, 'hardwareConcurrency', { value: 16, configurable: true });
    globalThis.crossOriginIsolated = true;
    const makeEngine = () => new PikafishEngine({ WorkerClass: FakeWorker, baseUrl: 'https://example.test/chess/' });
    const engine = makeEngine();
    await engine.configure();
    assert.equal(engine.mode, 'multi');
    assert.equal(engine.threads, 4);
    assert.ok(engine.worker.commands.some(x => x.command === 'setoption name Threads value 4'));
    await assert.rejects(engine.configure({ threads: 5 }), /limit/);
    const old = engine.worker;
    engine.destroy();
    await engine.init();
    assert.ok(old.terminated, 'all old pthreads retire before replacement initialization');
    engine.destroy(); await engine.cleaning;
    FakeWorker.destroyDelay = 40;
    const restarting = makeEngine(); await restarting.init(); restarting.destroy();
    const oldRestart = restarting.init();
    const oldRejected = assert.rejects(oldRestart, /cancel/);
    await restarting.stop();
    await oldRejected;
    await restarting.init();
    assert.equal(restarting.ready, true, 'cancel while awaiting cleanup must not poison future initialization');
    restarting.destroy(); await restarting.cleaning; FakeWorker.destroyDelay = 0;
    FakeWorker.failMulti = true;
    const fallback = makeEngine();
    await fallback.configure();
    assert.equal(fallback.mode, 'single');
    assert.equal(fallback.threads, 1);
    fallback.destroy();
    FakeWorker.failMulti = false; FakeWorker.hangMulti = true;
    const hung = makeEngine();
    const originalWait = hung.waitFor.bind(hung);
    hung.waitFor = (match, timeout) => originalWait(match, timeout === 120000 ? 10 : timeout);
    await hung.configure();
    assert.equal(hung.mode, 'single', 'an initialization timeout must also fall back');
    hung.destroy(); FakeWorker.hangMulti = false;
    const cancelled = makeEngine();
    const pending = cancelled.init();
    const rejection = assert.rejects(pending, /cancel/);
    cancelled.destroy();
    await rejection;
    assert.equal(cancelled.worker, null, 'cancellation must not trigger fallback resurrection');
    await cancelled.cleaning;
    globalThis.crossOriginIsolated = false;
    const unsupported = makeEngine(); await unsupported.init();
    assert.equal(unsupported.mode, 'single'); unsupported.destroy();
    console.log('multi UCI settings, bounded settings, cleanup, initialization fallback and cancellation ownership passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
