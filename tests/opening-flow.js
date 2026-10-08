const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { boardToFen, moveToUci, uciToMove } = require('../pikafish-adapter.js');
const searches = [], positions = [], queries = [];
let reply = 'c3c4';
class FakeEngine {
    async init() {}
    async reset() {}
    async configure() {}
    async setPosition(fen, moves) { positions.push({ fen, moves }); }
    async getBestMove(options) { searches.push(options); return uciToMove(options.searchmoves[0]); }
    async stop() {}
}
class FakeBook {
    async getMove(fen, allowed, options) { queries.push({ fen, allowed, options }); return typeof reply === 'function' ? reply() : reply; }
}
const context = vm.createContext({ require, module: { exports: {} }, console, setTimeout, clearTimeout, AbortController,
    PikafishEngine: FakeEngine, CloudOpeningBook: FakeBook, boardToFen, moveToUci, navigator: { deviceMemory: 8 } });
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../game.js'), 'utf8'), context);
context.window = { offlinePreparation: Promise.resolve() };
const run = expression => vm.runInContext(expression, context);
(async () => {
    run("aiLevel = 'custom'; customThinkTimeMs = 30000;");
    const first = await run("requestComputerMove(cloneBoard(initialBoard), 'r', [])");
    assert.equal(moveToUci(first), 'c3c4', 'use the official cloud response, not the original handcrafted book');
    assert.equal(searches.length, 0, 'known opening must not spend the custom 30-second search budget');
    reply = 'b9c7';
    const black = await run("requestComputerMove(applyMoveToBoard(initialBoard, parseMoveKey('7,7-7,4')), 'b', ['7,7-7,4'])");
    assert.equal(moveToUci(black), reply);
    assert.match(queries[1].fen, / b /, 'query the actual current position and correct side');
    reply = null;
    const unknown = await run("requestComputerMove(applyMoveToBoard(initialBoard, parseMoveKey('6,0-5,0')), 'b', ['6,0-5,0'])");
    assert.ok(unknown);
    assert.equal(searches.length, 1);
    assert.equal(searches[0].movetime, 30000, 'missing book moves preserve custom local-engine time');
    assert.deepEqual(Array.from(positions[0].moves), ['a3a4']);
    reply = 'a9a9';
    await run("requestComputerMove(cloneBoard(initialBoard), 'r', [])");
    assert.equal(searches.length, 2, 'illegal cloud responses cannot bypass current rules');
    run("const originalFilter = filterPlayableMoves; filterPlayableMoves = (...args) => originalFilter(...args).filter(move => getMoveKey(move) !== '6,2-5,2');");
    reply = 'c3c4';
    await run("requestComputerMove(cloneBoard(initialBoard), 'r', [])");
    assert.equal(searches.length, 3, 'cloud moves prohibited by perpetual-rule filters must be rejected');
    run('filterPlayableMoves = originalFilter;');
    let finish;
    reply = () => new Promise(resolve => { finish = resolve; });
    const old = run("requestComputerMove(cloneBoard(initialBoard), 'r', [])");
    run('cancelPendingAiJob();');
    assert.equal(queries.at(-1).options.signal.aborted, true, 'reset cancels the cloud lookup');
    finish('c3c4');
    assert.equal(await old, null, 'late cloud result cannot affect a new game');
    const stale = await run("requestComputerMove(cloneBoard(initialBoard), 'r', [], aiGeneration - 1)");
    assert.equal(stale, null);
    console.log('official book fast path, sides, rule filtering, full-history engine fallback and stale cancellation passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
