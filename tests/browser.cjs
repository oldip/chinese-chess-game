const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const base = process.env.TEST_URL || 'http://127.0.0.1:8080/chinese-chess-game/';
const channels = (process.env.TEST_CHANNELS || 'chrome,msedge').split(',');
const localCertificate = process.env.TEST_LOCAL_CERT === '1' && new URL(base).hostname === '127.0.0.1';
const protectionHosts = process.env.TEST_ALLOW_PROTECTION_INJECTION === '1'
    ? new Set(['local.adguard.org', 'gc.kis.v2.scr.kaspersky-labs.com', 'me.kis.v2.scr.kaspersky-labs.com']) : new Set();
(async () => {
    fs.mkdirSync('test-results', { recursive: true });
    for (const channel of channels) {
        const browser = await chromium.launch({ channel, headless: true, args: [...(localCertificate ? ['--ignore-certificate-errors'] : []), ...(process.env.TEST_HOST_RESOLVER_RULES ? ['--host-resolver-rules=' + process.env.TEST_HOST_RESOLVER_RULES] : [])] });
        try {
        const context = await browser.newContext({ ignoreHTTPSErrors: localCertificate });
        const page = await context.newPage();
        const errors = [], external = [], protectionRequests = [], cloudRequests = [], lines = [];
        page.on('pageerror', error => errors.push(error.message));
        context.on('request', request => {
            const url = new URL(request.url());
            if (url.origin !== new URL(base).origin && /^https?:/.test(url.protocol)) {
                if (url.origin === 'https://www.chessdb.cn' && url.pathname === '/chessdb.php' &&
                    url.searchParams.get('action') === 'querybest' && url.searchParams.get('learn') === '0') cloudRequests.push(request.url());
                else if (protectionHosts.has(url.hostname)) protectionRequests.push(url.origin);
                else external.push(request.url());
            }
        });
        await page.goto(base, { waitUntil: 'commit' });
        await page.locator('.cell').last().waitFor({ state: 'attached' });
        assert.equal(await page.locator('.cell').count(), 90);
        await page.waitForFunction(() => document.querySelector('#offline-status').dataset.ready === 'true' && pikafishEngine?.ready, null, { timeout: 120000 });
        assert.equal(await page.locator('#engine-status').isVisible(), false, 'opponent automatically prepares on first visit');
        assert.equal(await page.locator('#offline-status').isVisible(), false, 'offline readiness is quiet');
        await page.click('#level-intermediate');
        assert.equal(await page.evaluate(() => getUndoLimit()), 10);
        await page.click('#level-advanced');
        assert.equal(await page.evaluate(() => getUndoLimit()), 5);
        assert.equal(await page.evaluate(() => getSearchTimeBudget(board, [])), 2000);
        assert.equal(await page.locator('#custom-time').isVisible(), false);
        assert.equal(await page.locator('#engine-hash, #engine-depth').count(), 0);
        await page.click('#level-custom');
        await page.fill('#custom-time', '1');
        await page.locator('#custom-time').dispatchEvent('change');
        assert.equal(await page.evaluate(() => getSearchTimeBudget(board, [])), 1000);
        await page.screenshot({ path: `test-results/${channel}-settings.png`, fullPage: true });
        const bookTimings = [];
        for (const offline of [true, false]) {
            await context.setOffline(offline);
            if (offline) {
                await page.evaluate(() => localStorage.clear());
                await page.reload({ waitUntil: 'domcontentloaded' });
                await page.waitForFunction(() => document.querySelector('#offline-status').dataset.ready === 'true' && pikafishEngine?.ready);
            }
            for (const side of ['b', 'r']) {
                await page.evaluate(() => {
                    openSetupPanel();
                    window.engineSearchCalls = 0;
                    const search = pikafishEngine.getBestMove.bind(pikafishEngine);
                    pikafishEngine.getBestMove = options => { if (!options.onScore) window.engineSearchCalls++; return search(options); };
                });
                await page.click('#level-custom');
                await page.fill('#custom-time', '30');
                await page.locator('#custom-time').dispatchEvent('change');
                await page.click(side === 'b' ? '#side-black' : '#side-red');
                const started = Date.now();
                await page.click('#start-game-button');
                if (side === 'r') {
                    await page.click('[data-row="6"][data-col="2"]');
                    await page.click('[data-row="5"][data-col="2"]');
                }
                await page.waitForFunction(expected => moveSequence.length === expected && !aiThinking, side === 'b' ? 1 : 2, { timeout: 6000 });
                assert.equal(await page.evaluate(() => window.engineSearchCalls), 0, '30-second openings use bundled official data without searching');
                await page.waitForFunction(() => { const element = document.querySelector('#position-evaluation'); return element.dataset.side === (humanColor === 'r' ? 'red' : 'black') && element.textContent.startsWith('局勢評分：' + colorName(humanColor) + ' ') && / [+-]\d/.test(element.textContent); });
                const elapsed = Date.now() - started;
                assert.ok(elapsed < 6000, 'book must not wait 30 seconds');
                bookTimings.push({ offline, aiSide: side === 'b' ? 'red' : 'black', elapsed });
            }
            await page.evaluate(() => openSetupPanel());
        }
        await context.setOffline(false);
        assert.equal(cloudRequests.length, 0, 'never-queried openings work offline without external cloud requests');
        // Remaining checks deliberately exercise the actual local WASM path.
        await page.evaluate(() => { cloudOpeningBook.getMove = async () => null; setHumanSide('r'); });
        const result = await page.evaluate(async () => {
            const lines = [];
            const engine = new PikafishEngine({ onLine: line => lines.push(line) });
            await engine.init();
            await engine.configure({ hash: 16, skill: 20 });
            let position = cloneBoard(initialBoard), color = 'r', moves = [];
            for (let index = 0; index < 8; index++) {
                const legal = getAllLegalMoves(position, color);
                await engine.setPosition(boardToFen(initialBoard, 'r'), moves);
                const best = await engine.getBestMove({ movetime: 100, searchmoves: legal.map(moveToUci) });
                const move = legal.find(candidate => sameMove(candidate, best));
                if (!move) throw new Error('Illegal Pikafish move');
                position = applyMoveToBoard(position, move); moves.push(moveToUci(move)); color = otherColor(color);
            }
            engine.destroy();
            return { lines, moves, isolated: crossOriginIsolated, shared: typeof SharedArrayBuffer };
        });
        lines.push(...result.lines);
        assert.equal(result.isolated, false);
        assert.equal(result.shared, 'undefined');
        assert.ok(lines.some(line => /NNUE/.test(line)), 'NNUE evaluation confirmed');
        assert.ok(lines.includes('uciok') && lines.includes('readyok'));
        await page.click('#level-beginner');
        await page.click('#start-game-button');
        await page.click('[data-row="6"][data-col="0"]');
        await page.click('[data-row="5"][data-col="0"]');
        await page.waitForFunction(() => moveSequence.length === 2 && !aiThinking, null, { timeout: 120000 });
        await page.screenshot({ path: `test-results/${channel}-game.png`, fullPage: true });
        await page.click('#undo-button');
        assert.equal(await page.evaluate(() => moveSequence.length), 0);
        await page.waitForFunction(() => { const element = document.querySelector('#position-evaluation'); return element.dataset.side === (humanColor === 'r' ? 'red' : 'black') && element.textContent.startsWith('局勢評分：' + colorName(humanColor) + ' ') && / [+-]\d/.test(element.textContent); });
        await page.evaluate(() => { setHumanSide('b'); });
        await page.waitForFunction(() => moveSequence.length === 1 && !aiThinking, null, { timeout: 30000 });
        assert.equal(await page.evaluate(() => currentPlayer), 'b');
        await page.click('#undo-button');
        await page.waitForFunction(() => moveSequence.length === 1 && !aiThinking, null, { timeout: 30000 });
        assert.equal(await page.evaluate(() => currentPlayer), 'b', 'black first-move undo must replay AI red turn');
        await page.waitForFunction(() => /局勢評分：黑方 [+-]\d/.test(document.querySelector('#position-evaluation').textContent));
        await page.evaluate(() => {
            window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
            window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
        });
        await page.waitForFunction(() => /局勢評分：黑方 [+-]\d/.test(document.querySelector('#position-evaluation').textContent));
        await page.evaluate(() => { resetGame(); openSetupPanel(); setHumanSide('r'); startConfiguredGame(); });
        await page.click('[data-row="6"][data-col="0"]');
        await page.click('[data-row="5"][data-col="0"]');
        await page.waitForFunction(() => pikafishEngine?.searching);
        const ticks = await page.evaluate(async () => { let ticks = 0; const id = setInterval(() => ticks++, 10); await new Promise(r => setTimeout(r, 150)); clearInterval(id); return ticks; });
        assert.ok(ticks >= 5, 'UI timer remains responsive');
        await page.evaluate(() => { resetGame(); openSetupPanel(); setGameMode('local'); startConfiguredGame(); });
        await page.waitForTimeout(1800);
        assert.equal(await page.evaluate(() => moveSequence.length), 0, 'cancelled result must not apply');
        await page.evaluate(() => { openSetupPanel(); setGameMode('ai'); setAiLevel('beginner'); });
        await page.evaluate(() => { startConfiguredGame(); });
        await page.click('[data-row="6"][data-col="0"]');
        await page.click('[data-row="5"][data-col="0"]');
        await page.waitForFunction(() => pikafishEngine?.searching);
        await page.evaluate(() => {
            window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
            window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
        });
        await page.waitForFunction(() => moveSequence.length === 2 && !aiThinking, null, { timeout: 30000 });
        await page.evaluate(() => openSetupPanel());
        await page.waitForFunction(() => document.querySelector('#offline-status').dataset.ready === 'true', null, { timeout: 120000 });
        await page.screenshot({ path: `test-results/${channel}.png`, fullPage: true });
        await context.setOffline(true);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.querySelector('#offline-status').dataset.ready === 'true' && pikafishEngine?.ready);
        await page.evaluate(() => { ensureCloudOpeningBook().getMove = async () => null; });
        await page.click('#level-beginner');
        await page.click('#start-game-button');
        await page.click('[data-row="6"][data-col="2"]');
        await page.click('[data-row="5"][data-col="2"]');
        await page.waitForFunction(() => moveSequence.length === 2 && !aiThinking, null, { timeout: 30000 });
        assert.deepEqual(external, []);
        assert.deepEqual(errors, []);
        // Cache eviction must revoke readiness and fail the engine clearly when offline.
        await page.evaluate(async () => {
            const prefix = `chinese-chess-${encodeURIComponent(new URL('./', location.href).pathname)}-`;
            const name = (await caches.keys()).find(key => key.startsWith(prefix));
            await (await caches.open(name)).delete(new URL('engine/pikafish.data', location.href));
        });
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.querySelector('#offline-status').dataset.ready === 'false' && /尚未備妥/.test(document.querySelector('#offline-status').textContent));
        const missing = await page.evaluate(async () => {
            const engine = new PikafishEngine();
            try { await engine.init(); return false; } catch { return true; } finally { engine.destroy(); }
        });
        assert.equal(missing, true, 'missing offline NNUE cannot silently use another AI');
        await context.setOffline(false);
        await page.waitForFunction(() => document.querySelector('#offline-status').dataset.ready === 'true' && pikafishEngine?.ready, null, { timeout: 120000 });
        await context.setOffline(true);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.querySelector('#offline-status').dataset.ready === 'true' && pikafishEngine?.ready);
        await page.click('#level-custom');
        await page.fill('#custom-time', '0.5');
        await page.locator('#custom-time').dispatchEvent('change');
        await page.click('#start-game-button');
        await page.click('[data-row="6"][data-col="0"]');
        await page.click('[data-row="5"][data-col="0"]');
        await page.waitForFunction(() => moveSequence.length === 2 && !aiThinking, null, { timeout: 30000 });
        assert.equal(await page.locator('#custom-time').isDisabled(), true);
        assert.deepEqual(errors, []);
        assert.deepEqual(external, []);
        fs.writeFileSync(`test-results/${channel}.json`, JSON.stringify({ url: base, channel, version: browser.version(), result, bookTimings, cloudRequests, errors, external, protectionRequests, offline: true }, null, 2));
        console.log(`${channel} ${browser.version()}: bundled never-queried offline 30-second openings for both sides, quiet preparation, undo limits, player-perspective position scores, custom time, 8 real engine plies, UI play/undo/sides/cancel/responsiveness/bfcache, subpath + offline replay/eviction/automatic recovery passed`);
        } finally { await browser.close(); }
    }
})().catch(error => { console.error(error); process.exit(1); });
