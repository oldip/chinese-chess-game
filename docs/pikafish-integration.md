# Pikafish integration design and verification plan

The requested outcome is the existing website, driven by genuine local Pikafish,
with one unshared WASM worker and all runtime assets hosted beneath the Pages scope.
No remote AI, framework migration or changes to board artwork are required.

## Repository analysis

- Plain static HTML/CSS/JS, no build system; index.html is the only current entry.
- game.js holds the UI, animation/audio, setup, mode/side selection, notation,
  snapshots, undo limits and adjudication. engine-core.js and ai-worker.js implement
  the old handcrafted search, with duplicated synchronous fallback and pondering.
- Board is 10 rows x 9 columns; row 0 is Black's back rank, row 9 Red's.
  r/b are colors and R/H/E/A/G/C/S are piece types. Display rotation never changes
  logical coordinates. UCI maps col to a-i and row to 9-row. Red is FEN w.
- getPseudoMoves handles horse legs, elephant eyes/river, palace, cannon screens,
  crossed soldiers and flying generals. getLegalMovesForPiece rejects self-check.
- getGameState adjudicates captured general, mate, stalemate (loss), and no playable
  moves after existing perpetual check/chase filters. The repetition policy is a
  limited four-ply cycle heuristic, not a complete tournament ruleset; preserve it.
  No general threefold draw or 60-move rule exists; do not invent one during AI replacement.
- performMove stores snapshots, notation and moveSequence, changes sides and calls
  finalizeMove. reset/setup/mode/side/undo invalidate search. Difficulty is locked
  after play starts; retain that behavior. No persisted settings/saved games exist.

## Selected approach and tradeoffs

Use ousc's pinned 2023-03-05 release wasm-single and its corresponding source tag
c01a40cf74b9cec773379d5f5fea835b1fbc0b9f. Newer brianhliou binaries use pthreads;
setting Threads=1 cannot remove their isolation requirement. The older release
includes Skill Level, Hash and UCI. Its packed pikafish.data is exactly one NNUE
file; compare its SHA-256 with the official same-date release before shipping.
Keep the released engine bytes unchanged and provide source, authors and licenses.

The synchronous single-thread search occupies only a dedicated Worker. Idle stop
sends UCI stop; active stop terminates it and rejects the pending request. This
reloads NNUE after cancellation only, never after ordinary completed moves.
One adapter owns initialization, UCI waiters, timeouts, settings and disposal.
The game owns a generation token; stale delayed jobs, results, catch and finally
handlers cannot affect a newer game. Do not fall back to the old AI on errors.

Send the initial FEN plus all UCI moves, and constrain the root with searchmoves
from the existing playable move filter. Independently validate bestmove before
performMove. Preserve UI, local mode and existing undo limits. Use preset thinking
times of 500/1500/4000 ms and custom 0.5–30 seconds. Keep engine details out of the
player UI; prepare automatically on first visit and display simple offline progress.

## Implementation and acceptance sequence

1. Add failing conversion/adapter tests, vendor pinned engine/source, implement
   FEN + UCI adapter/worker. Verify handshake, NNUE and real legal bestmove.
2. Connect game flow and generation cancellation. Verify sides, multi-turn play,
   reset/setup/mode cancellation, timers, rules and difficulty regression tests.
3. Add manifest and versioned Service Worker cache with progress and explicit
   cache-complete acknowledgement. Verify subpath, offline restart/search, missing
   resource failure and same-origin-only requests in real browser automation.
4. Publish ready static files from the branch root. Put hashes, licensing and source
   maintenance in dedicated documentation. Run unit tests, browser tests and hash verification. Record exact
   tested environments; do not claim Android or stock Firefox without running them.

Existing handcrafted AI tests/source remain for historical regression reference;
the browser must not load engine-core.js or ai-worker.js, or call old fallback AI.
