const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const handlers = new Map();
const context = vm.createContext({
    require, module: { exports: {} }, console, setTimeout, clearTimeout,
    window: { addEventListener: (name, handler) => handlers.set(name, handler), setTimeout, alert() {} },
    document: undefined
});
// Do not render the DOM; retain the exact production lifecycle registrations.
let source = fs.readFileSync(require('node:path').join(__dirname, '../game.js'), 'utf8');
source = source.replace(/    createBoard\(\);\n    renderMoveLog\(\);\n    updateSideButtons\(\);\n    updateModeButtons\(\);\n    updateStatus\(\);\n}/, '}');
vm.runInContext(source, context);
vm.runInContext("gameActive = true; setupOpen = false; aiThinking = true; currentPlayer = computerColor;", context);
handlers.get('pagehide')({ persisted: true });
assert.equal(vm.runInContext('aiThinking', context), false, 'hidden AI search must clear thinking lock');
assert.ok(handlers.has('pageshow'), 'restoring a bfcache page must resume the AI turn');
let scheduled = 0, evaluations = 0;
context.window.setTimeout = () => { scheduled++; return 1; };
context.resumedEvaluation = () => { evaluations++; };
vm.runInContext(`
    refreshPositionEvaluation = resumedEvaluation;
    prepareTestEngine = { init: async () => {} };
    ensurePikafish = () => prepareTestEngine;
    humanColor = 'b'; computerColor = 'r'; aiLevel = 'advanced'; remainingUndos = 5;
    currentPlayer = 'r'; gameActive = true; setupOpen = false;
    moveHistory = [snapshotState()]; currentPlayer = 'b';
    undoMove();
`, context);
assert.equal(scheduled, 1, 'undoing the AI first move as black must schedule its red turn again');
assert.equal(vm.runInContext('remainingUndos', context), 4);
vm.runInContext("aiThinking = false; currentPlayer = humanColor;", context);
handlers.get('pageshow')({ persisted: true });
assert.equal(evaluations, 1, 'returning to a human turn must restart the cancelled position assessment');
console.log('page lifecycle cleanup, resumed evaluation and black first-move undo passed');
