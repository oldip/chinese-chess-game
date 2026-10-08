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
            await page.waitForFunction(() => document.querySelector('#offline-status').dataset.ready === 'true' && pikafishEngine?.ready, null, { timeout: 120000 });
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
            await page.click('#review-stop');
            assert.equal(await page.evaluate(() => reviewRunning), false);
            await page.click('#review-resume');
            await page.waitForFunction(() => reviewSession.results.filter(Boolean).length === 4 && !reviewRunning, null, { timeout: 30000 });
            await page.click('#review-next');
            assert.equal(await page.evaluate(() => reviewIndex), 1);
            await page.locator('.review-entry').nth(3).click();
            assert.equal(await page.evaluate(() => reviewIndex), 4);
            assert.equal(await page.locator('.review-grade').count(), 4);
            assert.match(await page.locator('#review-best').textContent(), /建議走法：[^—]/);
            assert.match(await page.locator('#position-evaluation').textContent(), /紅方 [+-]\d/);
            assert.equal(await page.evaluate(() => JSON.stringify(board) === window.finalBoard && moveSequence.join('/') === window.finalHistory), true, 'browsing must not alter live board or history');
            await page.click('[data-row="6"][data-col="4"]');
            assert.equal(await page.evaluate(() => selectedCell), null, 'review board is read-only');
            await page.evaluate(() => { leaveReview(); humanColor = 'b'; computerColor = 'r'; startReview(); goToReview(1); });
            assert.equal(await page.locator('#position-evaluation').getAttribute('data-side'), 'black');
            assert.match(await page.locator('#position-evaluation').textContent(), /黑方 [+-]\d/);
            await page.screenshot({ path: `test-results/${channel}-review.png`, fullPage: true });
            const results = await page.evaluate(() => reviewSession.results.map(result => ({ label: result.grade.label, score: result.played.score, depth: result.best.depth })));
            assert.ok(results.every(result => result.score && result.depth > 0 && result.label !== '待分析'));
            await page.evaluate(() => { leaveReview(); undoMove(); });
            assert.equal(await page.evaluate(() => reviewSession === null && gameActive && moveSequence.length === 2), true, 'undoing a reviewed game must invalidate branch analysis');
            await page.evaluate(() => { gameActive = false; renderMoveLog(); startReview(); });
            assert.equal(await page.evaluate(() => reviewSession.moves.length), 2, 'new finished branch uses its own history');
            await page.waitForFunction(() => pikafishEngine.searching);
            await page.evaluate(() => { resetGame(); setGameMode('local'); });
            await page.waitForTimeout(1500);
            assert.equal(await page.evaluate(() => !reviewOpen && reviewSession === null && moveSequence.length === 0), true, 'restart must discard review and stale results');
            assert.equal(await page.locator('#review-panel').isVisible(), false);
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
            console.log(`${channel}: real WASM offline review, end-only gate, stop/resume, all steps, player perspective, read-only history, stale restart and real checkmate review passed`);
        } finally { await browser.close(); }
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
