const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
assert.ok(fs.existsSync(path.join(__dirname, '../game-review.js')), 'local review classifier and analysis module must exist');
const { classifyMove, analyseMove } = require('../game-review.js');
const cp = value => ({ type: 'cp', value });
const grade = (best, played, same = false, sacrifice = false, depth = 12) => classifyMove({ best: cp(best), played: cp(played), same, sacrifice, depth }).label;
assert.equal(grade(100, 100, true), '正著');
assert.equal(grade(100, 80), '優秀');
assert.equal(grade(100, 40), '良好');
assert.equal(grade(100, 0), '軟招');
assert.equal(grade(100, -200), '錯招');
assert.equal(grade(300, 300, true, true), '妙手');
assert.equal(grade(300, 300, true, true, 5), '正著', 'shallow searches cannot assert brilliance');
assert.equal(classifyMove({ best: { type: 'mate', value: 3 }, played: cp(100), same: false }).label, '漏著');
assert.equal(classifyMove({ best: cp(30), played: { type: 'mate', value: -2 }, same: false }).label, '錯招');
assert.match(classifyMove({ best: cp(30), played: { type: 'mate', value: -2 }, same: false }).reason, /對手.*將殺/, 'mate must be explained without a synthetic numerical loss');
assert.equal(classifyMove({ best: { type: 'mate', value: -2 }, played: { type: 'mate', value: -5 }, same: false }).label, '良好', 'delaying an already forced loss is not a new mistake');
assert.equal(classifyMove({ best: null, played: cp(0) }).label, '待分析');
assert.equal(classifyMove({ best: { type: 'mate', value: 1 }, played: { type: 'mate', value: 5 }, same: false }).label, '優秀', 'slower forced mate is not a mistake');
assert.equal(classifyMove({ best: cp(20), played: { type: 'mate', value: 4 }, same: false }).label, '優秀', 'a later-discovered mate must not be called an error');
(async () => {
    const commands = [];
    let cancelled = false;
    const engine = {
        async setPosition(fen, history) { commands.push({ fen, history }); },
        async getAnalysis(options) { commands.push(options); return { move: { fromRow: 6, fromCol: 0, toRow: 5, toCol: 0 }, score: cp(100), depth: 12, pv: ['a3a4'] }; }
    };
    const result = await analyseMove(engine, { fen: 'initial', history: ['a3a4'], played: 'c3c4', legal: ['a3a4', 'c3c4'], current: () => !cancelled });
    assert.equal(require('../pikafish-adapter.js').moveToUci(result.best.move), 'a3a4');
    assert.deepEqual(commands[1].searchmoves, ['a3a4', 'c3c4']);
    assert.deepEqual(commands[3].searchmoves, ['c3c4'], 'actual move must be searched in the same starting position and perspective');
    assert.deepEqual(commands[0].history, ['a3a4']);
    cancelled = true;
    const count = commands.length;
    assert.equal(await analyseMove(engine, { current: () => !cancelled }), null);
    assert.equal(commands.length, count, 'cancelled review must not issue engine commands');
    const source = fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8');
    const ctx = vm.createContext({ require, module: { exports: {} }, console, setTimeout, clearTimeout });
    vm.runInContext(source, ctx);
    assert.equal(vm.runInContext('typeof startReview', ctx), 'function');
    assert.equal(vm.runInContext('canReviewGame()', ctx), false, 'setup cannot review');
    vm.runInContext("setupOpen = false; gameActive = true; moveSequence = ['6,0-5,0'];", ctx);
    assert.equal(vm.runInContext('canReviewGame()', ctx), false, 'ongoing games cannot review');
    vm.runInContext('gameActive = false;', ctx);
    assert.equal(vm.runInContext('canReviewGame()', ctx), true, 'finished game with a move may review');
    const warnings = [];
    ctx.console = { ...console, warn: (...args) => warnings.push(args) };
    const elements = new Map();
    ctx.document = { getElementById: id => { if (!elements.has(id)) elements.set(id, { dataset: {} }); return elements.get(id); } };
    ctx.window = { offlinePreparation: Promise.resolve() };
    ctx.navigator = { deviceMemory: 8 };
    vm.runInContext(`
        updateUndoButton = () => {};
        ensurePikafish = () => ({ init: async () => {}, configure: async () => { throw new Error('fixture error'); } });
        reviewOpen = true;
        reviewSession = { boards: [cloneBoard(initialBoard)], moves: [{}], keys: [], results: [] };
        reviewIndex = 0;
    `, ctx);
    await vm.runInContext('runReviewAnalysis()', ctx);
    assert.match(elements.get('review-reason').textContent, /分析暫時無法完成/, 'analysis failure must remain visible after finally updates controls');
    assert.equal(warnings.length, 1);
    vm.runInContext("reviewIndex = 1; reviewSession.error = '';", ctx);
    for (const [value, expected] of [[799, '+7'], [-799, '-7'], [-99, '+0']]) {
        ctx.testScore = value;
        vm.runInContext("humanColor = 'r'; reviewSession.results = [{ played: { score: { type: 'cp', value: testScore } }, grade: { label: '正著', reason: '' } }]; updateReviewControls();", ctx);
        assert.equal(elements.get('position-evaluation').textContent, `局勢評分：紅方 ${expected}`);
    }
    vm.runInContext("humanColor = 'b'; reviewSession.results[0].played.score.value = 799; updateReviewControls();", ctx);
    assert.equal(elements.get('position-evaluation').textContent, '局勢評分：黑方 -7');
    assert.equal(elements.get('position-evaluation').dataset.side, 'black');
    ctx.uciToMove = require('../pikafish-adapter.js').uciToMove;
    vm.runInContext(`
        sacrificeBoard = Array.from({ length: 10 }, () => Array(9).fill(''));
        sacrificeBoard[0][4] = 'bG'; sacrificeBoard[9][4] = 'rG'; sacrificeBoard[5][4] = 'rS';
        sacrificeBoard[6][0] = 'rR'; sacrificeBoard[4][0] = 'bR'; sacrificeBoard[6][2] = 'rH';
        sacrificeMove = createMove(sacrificeBoard, 6, 0, 5, 0);
    `, ctx);
    assert.equal(vm.runInContext("isReviewSacrifice(sacrificeBoard, sacrificeMove, ['a3a4','a5a4','c3a4'])", ctx), false, 'ordinary equal exchange is not a brilliant sacrifice');
    console.log('review classification, full-history restricted move comparison, cancellation and end-only gate passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
