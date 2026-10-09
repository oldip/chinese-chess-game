const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { boardToFen, moveToUci, uciToMove } = require('../pikafish-adapter.js');
const configurations = [], positions = [], searches = [];
let reply = { type: 'cp', value: 799 };
class Engine {
    async init() {}
    async configure(options) { configurations.push(options); }
    async reset() {}
    async setPosition(fen, moves) { positions.push({ fen, moves }); }
    async getEvaluation({ onScore }) { const score = typeof reply === 'function' ? await reply() : reply; onScore(score); return score; }
    async getBestMove(options) { searches.push(options); return uciToMove(options.searchmoves[0]); }
    async stop() {}
}
const element = { textContent: '', dataset: {} };
const context = vm.createContext({ require, module: { exports: {} }, console, setTimeout, clearTimeout,
    AbortController, navigator: { deviceMemory: 8 }, PikafishEngine: Engine,
    CloudOpeningBook: class { async getMove() { return null; } }, boardToFen, moveToUci });
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../game.js'), 'utf8'), context);
context.window = { offlinePreparation: Promise.resolve() };
context.document = { getElementById: id => id === 'position-evaluation' ? element : null };
const run = code => vm.runInContext(code, context);
(async () => {
    assert.equal(run('typeof refreshPositionEvaluation'), 'function', 'independent current-board analysis must exist');
    run("setupOpen = false; gameActive = true; aiLevel = 'beginner';");
    await run('refreshPositionEvaluation()');
    assert.match(element.textContent, /紅方 \+7$/);
    assert.equal(configurations[0].skill, 20, 'assessment must use full strength despite beginner opponent');
    run("currentPlayer = 'b';");
    await run('refreshPositionEvaluation()');
    assert.match(element.textContent, /紅方 -7$/, 'Black-positive UCI score converts to red perspective');
    assert.equal(element.dataset.side, 'red', 'red player retains red text even with a negative score');
    run("humanColor = 'b';");
    await run('refreshPositionEvaluation()');
    assert.match(element.textContent, /黑方 \+7$/, 'black player uses black perspective');
    assert.equal(element.dataset.side, 'black');
    run("currentPlayer = 'r';");
    await run('refreshPositionEvaluation()');
    assert.match(element.textContent, /黑方 -7$/);
    assert.equal(element.dataset.side, 'black', 'black player retains black text when behind');
    run("currentPlayer = 'r'; humanColor = 'r';");
    for (const [value, expected] of [[799, '+7'], [101, '+1'], [-799, '-7'], [-101, '-1'], [-99, '+0'], [0, '+0']]) {
        reply = { type: 'cp', value };
        await run('refreshPositionEvaluation()');
        assert.equal(element.textContent, `局勢評分：紅方 ${expected}`, 'truncate toward zero; never round or floor negatives');
    }
    reply = { type: 'mate', value: 3 };
    await run('refreshPositionEvaluation()');
    assert.equal(element.textContent, '局勢評分：紅方將殺（3）');
    let finish;
    reply = () => new Promise(resolve => { finish = resolve; });
    const old = run('refreshPositionEvaluation()');
    await new Promise(resolve => setImmediate(resolve));
    run("setupOpen = true; cancelPendingAiJob(); refreshPositionEvaluation();");
    const cleared = element.textContent;
    finish({ type: 'cp', value: 900 }); await old;
    assert.equal(element.textContent, cleared, 'cancelled old position must not overwrite the new UI');
    reply = { type: 'cp', value: 0 };
    run("setupOpen = false; currentPlayer = 'r'; humanColor = 'r';");
    const evaluation = run('refreshPositionEvaluation()');
    const move = run("requestComputerMove(cloneBoard(initialBoard), 'r', [])");
    await evaluation; await move;
    assert.equal(configurations.at(-1).skill, 0, 'independent assessment must not strengthen the beginner opponent');
    assert.equal(searches[0].movetime, 500);
    console.log('independent full-strength current-board score, red/black perspective, stale cancellation and weak AI restoration passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
