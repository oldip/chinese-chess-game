const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const base = process.env.TEST_URL || 'http://127.0.0.1:8080/chinese-chess-game/';
const channels = (process.env.TEST_CHANNELS || 'chrome,msedge').split(',');
const localCertificate = process.env.TEST_LOCAL_CERT === '1' && new URL(base).hostname === '127.0.0.1';
(async () => {
    fs.mkdirSync('test-results', { recursive: true });
    for (const channel of channels) {
        const browser = await chromium.launch({ channel, headless: true, args: localCertificate ? ['--ignore-certificate-errors'] : [] });
        try {
        const context = await browser.newContext({ ignoreHTTPSErrors: localCertificate });
        const page = await context.newPage();
        const errors = [], external = [], lines = [];
        page.on('pageerror', error => errors.push(error.message));
        context.on('request', request => { if (new URL(request.url()).origin !== new URL(base).origin && /^https?:/.test(request.url())) external.push(request.url()); });
        await page.goto(base, { waitUntil: 'domcontentloaded' });
        assert.equal(await page.locator('.cell').count(), 90);
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
        await page.evaluate(() => { setHumanSide('b'); });
        await page.waitForFunction(() => moveSequence.length === 1 && !aiThinking, null, { timeout: 30000 });
        assert.equal(await page.evaluate(() => currentPlayer), 'b');
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
        await page.waitForFunction(() => document.querySelector('#offline-status').dataset.ready === 'true');
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
        await page.waitForFunction(() => document.querySelector('#offline-status').dataset.ready === 'false' && /缺失/.test(document.querySelector('#offline-status').textContent));
        const missing = await page.evaluate(async () => {
            const engine = new PikafishEngine();
            try { await engine.init(); return false; } catch { return true; } finally { engine.destroy(); }
        });
        assert.equal(missing, true, 'missing offline NNUE cannot silently use another AI');
        await context.setOffline(false);
        await page.click('button:has-text("修復快取")');
        await page.waitForFunction(() => document.querySelector('#offline-status').dataset.ready === 'true', null, { timeout: 120000 });
        fs.writeFileSync(`test-results/${channel}.json`, JSON.stringify({ channel, version: browser.version(), result, errors, external, offline: true }, null, 2));
        console.log(`${channel} ${browser.version()}: 8 real engine plies, UI play/undo/sides/cancel/responsiveness/bfcache, subpath + offline replay/eviction/repair passed`);
        } finally { await browser.close(); }
    }
})().catch(error => { console.error(error); process.exit(1); });
