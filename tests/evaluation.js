const assert = require('node:assert/strict');
const { parseSearchScore, PikafishEngine } = require('../pikafish-adapter.js');
assert.equal(typeof parseSearchScore, 'function', 'independent position score parser must exist');
assert.deepEqual(parseSearchScore('info depth 8 multipv 1 score cp 700 nodes 10 pv a3a4'), { type: 'cp', value: 700 });
assert.deepEqual(parseSearchScore('info depth 8 score mate -3 pv a3a4'), { type: 'mate', value: -3 });
for (const line of ['info string score cp 700', 'info depth 4 multipv 2 score cp 50', 'info depth 4 score cp 50 lowerbound', 'bestmove a3a4']) assert.equal(parseSearchScore(line), null);
class Worker {
    postMessage({ type, command }) {
        if (type === 'init') queueMicrotask(() => this.emit({ type: 'ready' }));
        if (command === 'uci') queueMicrotask(() => this.emit({ type: 'line', line: 'uciok' }));
        if (command === 'isready') queueMicrotask(() => this.emit({ type: 'line', line: 'readyok' }));
        if (command?.startsWith('go ')) queueMicrotask(() => {
            this.emit({ type: 'line', line: 'info depth 3 multipv 1 score cp -125 pv a3a4' });
            this.emit({ type: 'line', line: 'info depth 3 multipv 2 score cp -300' });
            this.emit({ type: 'line', line: 'bestmove a3a4' });
        });
    }
    emit(data) { this.onmessage?.({ data }); }
    terminate() {}
}
(async () => {
    const engine = new PikafishEngine({ WorkerClass: Worker, baseUrl: 'https://example.test/' });
    assert.equal(typeof engine.getAnalysis, 'function', 'review requires best move, score, depth and principal variation together');
    const analysis = await engine.getAnalysis({ movetime: 100 });
    assert.deepEqual(analysis.score, { type: 'cp', value: -125 });
    assert.equal(analysis.depth, 3);
    assert.deepEqual(analysis.pv, ['a3a4']);
    const updates = [];
    assert.deepEqual(await engine.getEvaluation({ movetime: 150, onScore: score => updates.push(score) }), { type: 'cp', value: -125 });
    assert.deepEqual(updates, [{ type: 'cp', value: -125 }], 'only the principal estimate is used');
    await engine.getBestMove({ movetime: 100 });
    assert.equal(updates.length, 1, 'opponent search must not update independent analysis');
    engine.destroy();
    console.log('independent score parsing, bounds/multipv filtering and search callback ownership passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
