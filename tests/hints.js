const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { boardToFen, moveToUci, uciToMove } = require('../pikafish-adapter.js');
const positions = [], searches = [], configurations = [];
let reply = null, stops = 0;
class Engine {
    async init() {}
    async configure(options) { configurations.push(options); }
    async setPosition(fen, moves) { positions.push({ fen, moves }); }
    async getBestMove(options) { searches.push(options); return reply ? await reply(options) : uciToMove(options.searchmoves[0]); }
    async stop() { stops++; }
}
const ctx = vm.createContext({ require, module: { exports: {} }, console, setTimeout, clearTimeout,
    navigator: { deviceMemory: 8 }, PikafishEngine: Engine, boardToFen, moveToUci });
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../game.js'), 'utf8'), ctx);
const run = code => vm.runInContext(code, ctx);
(async () => {
    assert.equal(run('typeof requestHint'), 'function', 'human turns need a local engine hint');
    ctx.window = { offlinePreparation: Promise.resolve(), setTimeout: () => 0 };
    run("updateStatus = () => {}; createBoard = () => {}; renderMoveLog = () => {}; updateSideButtons = () => {}; updateModeButtons = () => {}; updateDifficultyButtons = () => {};");
    for (const [level, limit] of [['beginner', Infinity], ['intermediate', 10], ['advanced', 5], ['custom', Infinity]]) {
        ctx.level = level; run("aiLevel = level; resetGame();");
        assert.equal(run('remainingHints'), limit);
    }
    run("aiLevel = 'intermediate'; resetGame();");
    const original = run('JSON.stringify(board) + moveSequence.join()');
    await run('requestHint()');
    assert.equal(run('remainingHints'), 9);
    assert.equal(run('remainingUndos'), 10, 'hint and undo budgets are independent');
    assert.equal(run('JSON.stringify(board) + moveSequence.join()'), original, 'hint does not play or alter history');
    assert.equal(configurations.at(-1).skill, 20, 'hints use full strength regardless of opponent level');
    assert.equal(searches.at(-1).movetime, 500);
    assert.deepEqual(Array.from(positions.at(-1).moves), []);
    const count = searches.length;
    await run('requestHint()');
    assert.equal(searches.length, count, 'same-position repeated clicks neither search nor consume');
    run('remainingHints = 0; cancelPendingHint();');
    await run('requestHint()');
    assert.equal(searches.length, count, 'exhausted budget blocks hints');
    run("remainingHints = 9; currentPlayer = 'b';");
    await run('requestHint()');
    assert.equal(searches.length, count, 'AI turn blocks hints');
    run("currentPlayer = 'r';");
    let finish;
    reply = options => new Promise(resolve => { finish = () => resolve(uciToMove(options.searchmoves[0])); });
    const stale = run('requestHint()');
    while (!finish) await new Promise(resolve => setImmediate(resolve));
    run('cancelPendingAiJob();'); finish(); await stale;
    assert.equal(run('hintMove'), null);
    assert.equal(run('remainingHints'), 9, 'cancelled result must not consume or draw');
    assert.ok(stops > 0);
    reply = () => { throw new Error('fixture failure'); };
    await run('requestHint()');
    assert.equal(run('remainingHints'), 9, 'failed search is free');
    assert.equal(run('hintThinking'), false);
    reply = null;
    run("gameMode = 'local'; performMove(createMove(board, 6, 0, 5, 0)); gameMode = 'ai'; humanColor = 'b'; computerColor = 'r';");
    await run('requestHint()');
    assert.equal(run('remainingHints'), 8);
    assert.deepEqual(Array.from(positions.at(-1).moves), ['a3a4'], 'hint passes complete move history');
    run('undoMove();');
    assert.equal(run('remainingHints'), 8, 'undo cannot refund hints');
    assert.equal(run('hintMove'), null);
    run('resetGame();');
    assert.equal(run('remainingHints'), 10, 'new game resets only its own hint budget');
    console.log('hint limits, full-strength legal history search, duplicate clicks, independent undo budget, failure and stale cancellation passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
