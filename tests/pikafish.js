const assert = require('node:assert/strict');
const fs = require('node:fs');
const { initialBoard } = require('../game.js');
assert.ok(fs.existsSync(require('node:path').join(__dirname, '../pikafish-adapter.js')), 'Pikafish adapter must exist');
const { boardToFen, fenToBoard, moveToUci, uciToMove, PikafishEngine } = require('../pikafish-adapter.js');
const start = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';
assert.equal(boardToFen(initialBoard, 'r'), start);
assert.equal(boardToFen(initialBoard, 'b', 8, 15), start.replace('w - - 0 1', 'b - - 8 15'));
assert.deepEqual(fenToBoard(start), { board: initialBoard, color: 'r', halfmove: 0, fullmove: 1 });
for (let row = 0; row < 10; row++) for (let col = 0; col < 9; col++) {
    const move = { fromRow: row, fromCol: col, toRow: 9 - row, toCol: 8 - col };
    assert.deepEqual(uciToMove(moveToUci(move)), move);
}
assert.equal(moveToUci({ fromRow: 6, fromCol: 0, toRow: 5, toCol: 0 }), 'a3a4');
assert.equal(uciToMove('(none)'), null);
assert.throws(() => uciToMove('a0j1'));
assert.throws(() => fenToBoard('invalid'));

class FakeWorker {
    constructor() { this.commands = []; FakeWorker.instances.push(this); }
    postMessage(data) {
        this.commands.push(data);
        if (data.type === 'init') queueMicrotask(() => this.emit({ type: 'ready' }));
        const command = data.command || '';
        if (command === 'uci') queueMicrotask(() => {
            this.emit({ type: 'line', line: 'id name Pikafish test' });
            for (const [name, min, max] of [['Threads', 1, 1024], ['Hash', 1, 2048], ['Skill Level', 0, 20]])
                this.emit({ type: 'line', line: `option name ${name} type spin default ${min} min ${min} max ${max}` });
            this.emit({ type: 'line', line: 'uciok' });
        });
        if (command === 'isready') queueMicrotask(() => this.emit({ type: 'line', line: 'readyok' }));
    }
    emit(data) { this.onmessage?.({ data }); }
    terminate() { this.terminated = true; }
}
FakeWorker.instances = [];
(async () => {
    const engine = new PikafishEngine({ WorkerClass: FakeWorker, baseUrl: 'https://example.test/chess/' });
    await Promise.all([engine.init(), engine.init()]);
    assert.equal(FakeWorker.instances.length, 1, 'initialization is shared');
    await engine.configure({ threads: 1, hash: 16, skill: 3 });
    await assert.rejects(engine.configure({ threads: 2 }), /single|單線程/);
    await engine.setPosition(start, ['a3a4']);
    const worker = FakeWorker.instances[0];
    assert.ok(worker.commands.some(x => x.command === `position fen ${start} moves a3a4`));
    const search = engine.getBestMove({ movetime: 100, depth: 4, searchmoves: ['a6a5'] });
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(worker.commands.some(x => x.command === 'go movetime 100 depth 4 searchmoves a6a5'));
    worker.emit({ type: 'line', line: 'bestmove a6a5 ponder a4a5' });
    assert.deepEqual(await search, uciToMove('a6a5'));
    const pending = engine.getBestMove({ movetime: 1000 });
    const rejected = assert.rejects(pending, /cancel|取消/);
    await new Promise(resolve => setImmediate(resolve));
    await engine.stop();
    await rejected;
    assert.ok(worker.terminated);
    await engine.init();
    assert.equal(FakeWorker.instances.length, 2);
    await engine.reset();
    engine.destroy();
    assert.ok(FakeWorker.instances[1].terminated);
    const rapid = new PikafishEngine({ WorkerClass: FakeWorker, baseUrl: 'https://example.test/chess/' });
    const firstInit = rapid.init();
    const cancelled = assert.rejects(firstInit, /cancel/);
    rapid.stop();
    const secondInit = rapid.init();
    await cancelled;
    await secondInit;
    assert.equal(rapid.ready, true, 'cancelled initializer cannot destroy replacement worker');
    rapid.destroy();
    const resumed = new PikafishEngine({ WorkerClass: FakeWorker, baseUrl: 'https://example.test/chess/' });
    const oldInit = resumed.init();
    FakeWorker.instances.at(-1).emit({ type: 'ready' });
    const oldRejected = assert.rejects(oldInit, /cancel/);
    resumed.stop();
    await resumed.init();
    await oldRejected;
    resumed.destroy();
    console.log('Pikafish conversion, handshake, settings, reuse and cancellation passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
