const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const base = process.env.TEST_URL || 'http://127.0.0.1:8080/chinese-chess-game/';
(async () => {
    fs.mkdirSync('test-results', { recursive: true });
    for (const channel of (process.env.TEST_CHANNELS || 'chrome,msedge').split(',')) {
        const browser = await chromium.launch({ channel, headless: true, args: process.env.TEST_HOST_RESOLVER_RULES ? ['--host-resolver-rules=' + process.env.TEST_HOST_RESOLVER_RULES] : [] });
        try {
            const context = await browser.newContext(), page = await context.newPage(), errors = [], external = [];
            page.on('dialog', dialog => dialog.dismiss());
            page.on('pageerror', error => errors.push(error.message));
            context.on('request', request => { const url = new URL(request.url()); if (/^https?:/.test(url.protocol) && url.origin !== new URL(base).origin && !['local.adguard.org','gc.kis.v2.scr.kaspersky-labs.com','me.kis.v2.scr.kaspersky-labs.com'].includes(url.hostname)) external.push(request.url()); });
            await page.goto(base, { waitUntil: 'commit' });
            await page.locator('#offline-status').waitFor({ state: 'attached' });
            await page.waitForFunction(() => document.querySelector('#offline-status')?.dataset.ready === 'true' && typeof pikafishEngine !== 'undefined' && pikafishEngine?.ready, null, { timeout: 120000 });
            await context.setOffline(true);
            await page.reload({ waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() => pikafishEngine?.ready);
            await page.evaluate(() => { setGameMode('local'); startConfiguredGame(); });
            assert.equal(await page.locator('#review-button').isVisible(), false, 'ongoing games must not offer review');
            await page.evaluate(() => startReview());
            assert.equal(await page.evaluate(() => reviewOpen), false);
            // Play a real legal opening, then inject only the finished flag to isolate the review UI.
            await page.evaluate(() => {
                for (const coordinates of [[6,0,5,0],[3,0,4,0],[6,2,5,2],[3,2,4,2]]) {
                    const move = createMove(board, ...coordinates);
                    if (!getAllLegalMoves(board, currentPlayer).some(candidate => sameMove(candidate, move))) throw new Error('Illegal fixture move');
                    performMove(move);
                }
                window.finalBoard = JSON.stringify(board); window.finalHistory = moveSequence.join('/');
                gameActive = false; statusMessage = '測試結束狀態'; renderMoveLog(); updateStatus();
            });
            assert.equal(await page.locator('#review-button').isVisible(), true);
            await page.click('#review-button');
            await page.waitForFunction(() => pikafishEngine.searching);
            assert.equal(await page.locator('#review-suggestion').isDisabled(), true, 'pending analysis must not offer a stale arrow');
            await page.click('#review-stop');
            assert.equal(await page.evaluate(() => reviewRunning), false);
            await page.click('#review-resume');
            await page.waitForFunction(() => !!reviewSession.results[0]);
            await page.evaluate(() => goToReview(1));
            await page.click('#review-suggestion');
            await page.waitForFunction(() => reviewSession.results.filter(Boolean).length === 4 && !reviewRunning, null, { timeout: 30000 });
            assert.equal(await page.evaluate(() => reviewSuggestion), true, 'later analysis must preserve the selected step preview');
            assert.equal(await page.locator('#review-arrow line').count(), 1);
            await page.click('#review-suggestion');
            await page.evaluate(() => goToReview(0));
            await page.click('#review-next');
            assert.equal(await page.evaluate(() => reviewIndex), 1);
            await page.locator('.review-entry').nth(3).click();
            assert.equal(await page.evaluate(() => reviewIndex), 4);
            assert.equal(await page.locator('.review-grade').count(), 4);
            assert.match(await page.locator('#review-best').textContent(), /建議走法：[^—]/);
            assert.match(await page.locator('#position-evaluation').textContent(), /紅方 [+-]\d/);
            assert.equal(await page.evaluate(() => JSON.stringify(board) === window.finalBoard && moveSequence.join('/') === window.finalHistory), true, 'browsing must not alter live board or history');
            const assertBoard = async index => {
                assert.equal(await page.evaluate(index => reviewSession.boards[index].every((row, r) => row.every((piece, c) => {
                    const visible = document.querySelector(`.cell[data-row="${r}"][data-col="${c}"] .piece`);
                    return piece ? visible?.textContent === PIECE_LABELS[piece] && visible.classList.contains(piece[0] === 'r' ? 'red' : 'black') : !visible;
                })), index), true, 'rendered board must match the chosen before/after position');
            };
            const assertArrow = async () => {
                const geometry = await page.evaluate(() => {
                    const suggestion = reviewSession.results[Math.max(0, reviewIndex - 1)].best.move;
                    const line = document.querySelector('#review-arrow line'), svg = document.getElementById('review-arrow');
                    const point = (x, y) => new DOMPoint(Number(line.getAttribute(x)), Number(line.getAttribute(y))).matrixTransform(svg.getScreenCTM());
                    const nearCell = (point, row, col) => {
                        const rect = document.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`).getBoundingClientRect();
                        return Math.hypot(point.x - rect.x - rect.width / 2, point.y - rect.y - rect.height / 2) / Math.max(rect.width, rect.height);
                    };
                    return { from: nearCell(point('x1', 'y1'), suggestion.fromRow, suggestion.fromCol),
                        to: nearCell(point('x2', 'y2'), suggestion.toRow, suggestion.toCol), pointer: getComputedStyle(svg).pointerEvents, display: getComputedStyle(svg).display, hiddenAttribute: svg.hasAttribute('hidden') };
                });
                assert.ok(geometry.from < 0.3 && geometry.to < 0.3, 'arrow endpoints must align with engine squares at every orientation and size: ' + JSON.stringify(geometry));
                assert.equal(geometry.pointer, 'none');
                assert.equal(await page.locator('#review-arrow line').count(), 1);
            };
            await assertBoard(4);
            assert.equal(await page.locator('#review-arrow').isVisible(), false, 'ordinary review retains the after-move board without an arrow');
            await page.click('#review-suggestion');
            await assertBoard(3); await assertArrow();
            assert.match(await page.locator('#review-step').textContent(), /走棋前/);
            assert.equal(await page.locator('#review-suggestion').getAttribute('aria-pressed'), 'true');
            await page.screenshot({ path: `test-results/${channel}-review-arrow-red.png`, fullPage: true });
            await page.click('#review-suggestion'); await assertBoard(4);
            assert.equal(await page.locator('#review-arrow').isVisible(), false);
            await page.click('#review-suggestion'); await page.click('#review-prev');
            assert.equal(await page.evaluate(() => reviewSuggestion), false, 'step navigation clears the prior suggestion');
            assert.equal(await page.locator('#review-arrow').isVisible(), false);
            await page.click('[data-row="6"][data-col="4"]');
            assert.equal(await page.evaluate(() => selectedCell), null, 'review board is read-only');
            await page.evaluate(() => { leaveReview(); humanColor = 'b'; computerColor = 'r'; startReview(); goToReview(1); });
            assert.equal(await page.locator('#position-evaluation').getAttribute('data-side'), 'black');
            assert.match(await page.locator('#position-evaluation').textContent(), /黑方 [+-]\d/);
            await page.click('#review-suggestion');
            await page.waitForTimeout(250);
            await assertBoard(0); await assertArrow();
            await page.setViewportSize({ width: 375, height: 850 });
            await assertArrow();
            await page.screenshot({ path: `test-results/${channel}-review-arrow-black-mobile.png`, fullPage: true });
            assert.equal(await page.evaluate(() => JSON.stringify(board) === window.finalBoard && moveSequence.join('/') === window.finalHistory), true, 'arrow preview must not alter live history');
            await page.click('#review-suggestion'); await assertBoard(1);
            await page.setViewportSize({ width: 1280, height: 720 });
            await page.screenshot({ path: `test-results/${channel}-review.png`, fullPage: true });
            const results = await page.evaluate(() => reviewSession.results.map(result => ({ label: result.grade.label, score: result.played.score, depth: result.best.depth })));
            assert.ok(results.every(result => result.score && result.depth > 0 && result.label !== '待分析'));
            await page.evaluate(() => { leaveReview(); undoMove(); });
            assert.equal(await page.locator('#review-arrow').isVisible(), false, 'leaving review removes its arrow');
            assert.equal(await page.evaluate(() => reviewSession === null && gameActive && moveSequence.length === 2), true, 'undoing a reviewed game must invalidate branch analysis');
            await page.evaluate(() => { gameActive = false; renderMoveLog(); startReview(); });
            assert.equal(await page.evaluate(() => reviewSession.moves.length), 2, 'new finished branch uses its own history');
            await page.waitForFunction(() => pikafishEngine.searching);
            await page.evaluate(() => { resetGame(); setGameMode('local'); });
            await page.waitForTimeout(1500);
            assert.equal(await page.evaluate(() => !reviewOpen && reviewSession === null && moveSequence.length === 0), true, 'restart must discard review and stale results');
            assert.equal(await page.locator('#review-panel').isVisible(), false);
            assert.equal(await page.locator('#review-arrow').isVisible(), false);
            // Seed a legal mate-in-one endgame and use the real finalizeMove to finish it.
            await page.evaluate(() => {
                initialBoard.forEach(row => row.fill(''));
                for (const [row, col, piece] of [[0,4,'bG'],[9,4,'rG'],[2,4,'rS'],[2,2,'rH'],[2,5,'rR'],[1,0,'rR']]) initialBoard[row][col] = piece;
                humanColor = 'r'; computerColor = 'b'; resetGame();
                if (isInCheck(board, 'b')) throw new Error('Fixture is already checking black');
                performMove(createMove(board, 2, 4, 1, 4));
                if (gameActive || getGameState(board, currentPlayer)?.winner !== 'r') throw new Error('Real checkmate must finish the game');
            });
            assert.equal(await page.locator('#review-button').isVisible(), true);
            await page.click('#review-button');
            await page.waitForFunction(() => reviewSession.results.length === 1 && !reviewRunning, null, { timeout: 30000 });
            await page.click('#review-next');
            assert.match(await page.locator('#position-evaluation').textContent(), /紅方將殺/);
            assert.notEqual(await page.locator('.review-grade').textContent(), '待分析');
            await page.evaluate(() => leaveReview());
            assert.equal(await page.evaluate(() => !gameActive && moveSequence.length === 1), true);
            assert.deepEqual(errors, []); assert.deepEqual(external, []);
            fs.writeFileSync(`test-results/${channel}-review.json`, JSON.stringify({ base, channel, version: browser.version(), results, offline: true, errors, external }, null, 2));
            console.log(`${channel}: real WASM offline review, before/after suggestion toggle, one arrow, flipped/mobile alignment, async navigation cleanup, end-only gate, stop/resume, all steps, player perspective, read-only history, stale restart and real checkmate review passed`);
        } finally { await browser.close(); }
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
