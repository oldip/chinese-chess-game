const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { fenToBoard, boardToFen, moveToUci } = require('../pikafish-adapter.js');
const { getAllLegalMoves, initialBoard, applyMoveToBoard } = require('../game.js');
const { addLine } = require('../scripts/download-opening-book.cjs');
const directory = path.join(__dirname, '../books');
assert.ok(fs.existsSync(path.join(directory, 'chessdb-opening.js')), 'downloaded cloud opening subset must exist');
const bytes = fs.readFileSync(path.join(directory, 'chessdb-opening.js'));
const context = vm.createContext({}); vm.runInContext(bytes.toString(), context);
const book = context.CHESSDB_OPENINGS;
const provenance = JSON.parse(fs.readFileSync(path.join(directory, 'provenance.json'), 'utf8'));
assert.ok(bytes.length <= 3000000);
assert.equal(bytes.length, provenance.bytes);
assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), provenance.sha256);
assert.equal(Object.keys(book).length, provenance.positions);
assert.ok(provenance.positions > 1000, 'real data must cover more than a few sample lines');
const archive = fs.readFileSync(path.join(directory, provenance.responseArchive));
assert.equal(crypto.createHash('sha256').update(archive).digest('hex'), provenance.responseArchiveSha256);
const sourceMoves = {};
for (const item of zlib.gunzipSync(archive).toString().trim().split('\n').map(JSON.parse)) {
    if (item.response.status === 'ok') addLine(sourceMoves, { ...fenToBoard(item.fen + ' - - 0 1'), ply: 0 }, item.response.pv);
}
for (const [fen, moves] of Object.entries(book)) {
    const { board, color } = fenToBoard(fen + ' - - 0 1');
    const legal = getAllLegalMoves(board, color).map(moveToUci);
    assert.ok(moves.length > 0);
    for (const move of moves) {
        assert.ok(legal.includes(move), 'illegal bundled move: ' + fen + ' ' + move);
        assert.ok(sourceMoves[fen]?.includes(move), 'move missing from saved cloud provenance: ' + fen + ' ' + move);
    }
}
const root = boardToFen(initialBoard, 'r').split(' ').slice(0, 2).join(' ');
assert.ok(book[root]?.length);
for (const uci of ['b2e2', 'h2e2', 'c3c4', 'g3g4', 'b0c2', 'h0g2', 'c0e2', 'g0e2']) {
    const move = getAllLegalMoves(initialBoard, 'r').find(candidate => moveToUci(candidate) === uci);
    const fen = boardToFen(applyMoveToBoard(initialBoard, move), 'b').split(' ').slice(0, 2).join(' ');
    assert.ok(book[fen]?.length, 'common first-move response missing: ' + uci);
}
console.log(provenance.positions + ' real cloud positions: all moves legal, source-backed, hash-verified and within 3 MB');
