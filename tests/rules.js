const assert = require('node:assert/strict');
const game = require('../game.js');
const empty = () => Array.from({ length: 10 }, () => Array(9).fill(''));
const board = empty();
board[0][4] = 'bG'; board[9][4] = 'rG';
assert.ok(game.isInCheck(board, 'r'), 'flying generals');
board[5][4] = 'rR';
assert.ok(!game.getLegalMovesForPiece(board, 5, 4).some(m => m.toCol === 3), 'cannot expose own general');
board[9][1] = 'rH'; board[8][1] = 'rS';
assert.ok(!game.getLegalMovesForPiece(board, 9, 1).some(m => m.toRow === 7), 'horse leg');
board[9][2] = 'rE'; board[8][3] = 'rS';
assert.ok(!game.getLegalMovesForPiece(board, 9, 2).some(m => m.toRow === 7 && m.toCol === 4), 'elephant eye');
assert.ok(game.getAllLegalMoves(game.initialBoard, 'r').length > 0);
for (const check of [true, false]) {
    const end = empty();
    end[0][4] = 'bG'; end[9][4] = 'rG'; end[5][4] = 'rS';
    end[2][3] = 'rR'; end[2][5] = 'rR'; end[1][0] = 'rR';
    if (check) end[2][4] = 'rR';
    assert.equal(game.isInCheck(end, 'b'), check);
    assert.equal(game.getAllLegalMoves(end, 'b').length, 0);
    assert.equal(game.getGameState(end, 'b').winner, 'r', check ? 'checkmate' : 'stalemate is a loss');
}
console.log('flying generals, self-check, horse leg, elephant eye, checkmate and stalemate passed');
