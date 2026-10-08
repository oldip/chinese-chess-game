const assert = require('node:assert/strict');
const fs = require('node:fs');
const game = require('../game.js');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
assert.ok(!/engine-hash|engine-depth|本機 Pikafish|Skill 0|修復快取|重試 AI/.test(html), 'player UI must not expose engine internals/cache maintenance');
assert.ok(html.includes('level-custom'), 'custom thinking time replaces depth control');
for (const [level, time] of [['beginner', 500], ['intermediate', 1500], ['advanced', 4000]]) {
    game.setAiLevel(level);
    assert.equal(game.getSearchTimeBudget(game.initialBoard, []), time);
}
game.setAiLevel('custom');
game.setCustomThinkTime(7);
assert.equal(game.getSearchTimeBudget(game.initialBoard, []), 7000);
game.setCustomThinkTime(0);
assert.equal(game.getSearchTimeBudget(game.initialBoard, []), 7000, 'invalid time must not overwrite prior valid setting');
console.log('simple difficulty UI and custom thinking time passed');
