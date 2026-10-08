const assert = require('node:assert/strict');
const { CloudOpeningBook } = require('../cloud-opening-book.js');
const fen = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w';
(async () => {
    let requests = 0;
    const book = new CloudOpeningBook({ openingMoves: { [fen]: ['c3c4', 'g3g4'] }, fetcher: async () => { requests++; throw new Error('offline'); } });
    assert.equal(await book.getMove(fen + ' - - 0 1', ['g3g4']), 'g3g4', 'never-queried bundled position works offline');
    assert.equal(requests, 0, 'bundled book never requires the cloud');
    assert.equal(await book.getMove(fen, ['a3a4']), null, 'bundled candidates must respect current rules');
    const cancelled = new AbortController(); cancelled.abort();
    assert.equal(await book.getMove(fen, ['c3c4'], { signal: cancelled.signal }), null);
    const fallback = new CloudOpeningBook({ openingMoves: {}, fetcher: async () => ({ ok: true, text: async () => 'move:c3c4' }) });
    assert.equal(await fallback.getMove(fen, ['c3c4']), 'c3c4', 'unbundled openings retain the cloud fallback');
    console.log('bundled never-queried offline moves, legal filtering, cancellation and cloud fallback passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
