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
            await page.waitForFunction(() => document.querySelector('#offline-status')?.dataset.ready === 'true' && typeof pikafishEngine !== 'undefined' && pikafishEngine?.ready, null, { timeout: 120000 });
            await context.setOffline(true); await page.reload({ waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() => pikafishEngine?.ready);
            await page.evaluate(() => { aiLevel = 'intermediate'; startConfiguredGame(); window.originalEngine = pikafishEngine; });
            assert.equal(await page.locator('#hint-button').textContent(), '提示（10）');
            const before = await page.evaluate(() => JSON.stringify(board) + moveSequence.join('/'));
            await page.click('#hint-button');
            await page.waitForFunction(() => !!hintMove && !hintThinking);
            assert.equal(await page.locator('#hint-button').textContent(), '提示（9）');
            assert.equal(await page.locator('#hint-button').isDisabled(), true);
            assert.equal(await page.locator('#undo-button').isDisabled(), true);
            assert.equal(await page.locator('#review-arrow').isVisible(), true);
            assert.match(await page.locator('#hint-status').textContent(), /提示：[^—]/);
            assert.equal(await page.evaluate(() => JSON.stringify(board) + moveSequence.join('/')), before);
            await page.screenshot({ path: `test-results/${channel}-hint-red.png`, fullPage: true });
            await page.evaluate(() => { window.playedHint = { ...hintMove }; performMove(hintMove); });
            await page.waitForFunction(() => currentPlayer === humanColor && !aiThinking && moveSequence.length === 2);
            assert.equal(await page.locator('#review-arrow').isVisible(), false, 'played move clears hint');
            await page.click('#undo-button');
            assert.equal(await page.evaluate(() => remainingHints), 9, 'undo does not refund hints');
            assert.equal(await page.evaluate(() => remainingUndos), 9, 'separate undo budget consumes independently');
            for (let n = 9; n > 0; n--) {
                await page.evaluate(() => cancelPendingHint());
                await page.click('#hint-button');
                await page.waitForFunction(() => !hintThinking);
                assert.equal(await page.evaluate(() => remainingHints), n - 1);
            }
            await page.evaluate(() => cancelPendingHint());
            assert.equal(await page.locator('#hint-button').isDisabled(), true, 'all ten hints exhausted');
            await page.evaluate(() => { openSetupPanel(); setAiLevel('advanced'); startConfiguredGame(); });
            for (let n = 5; n > 0; n--) {
                await page.evaluate(() => cancelPendingHint()); await page.click('#hint-button');
                await page.waitForFunction(() => !hintThinking);
                assert.equal(await page.evaluate(() => remainingHints), n - 1);
            }
            await page.evaluate(() => cancelPendingHint());
            assert.equal(await page.locator('#hint-button').isDisabled(), true, 'all five hints exhausted');
            await page.evaluate(() => { openSetupPanel(); setAiLevel('beginner'); startConfiguredGame(); });
            await page.click('#hint-button'); await page.waitForFunction(() => !!hintMove && !hintThinking);
            assert.equal(await page.locator('#hint-button').textContent(), '提示');
            assert.equal(await page.evaluate(() => remainingHints === Infinity), true);
            await page.evaluate(() => { cancelPendingHint(); requestHint(); });
            await page.waitForFunction(() => pikafishEngine.searching);
            await page.evaluate(() => { openSetupPanel(); setAiLevel('intermediate'); startConfiguredGame(); });
            await page.waitForTimeout(800);
            assert.equal(await page.evaluate(() => !hintMove && !hintThinking && remainingHints === 10), true, 'restart rejects old hint');
            await page.evaluate(async () => { await evaluationTask; window.pendingHint = requestHint(); });
            await page.waitForFunction(() => pikafishEngine.searching && hintThinking);
            await page.click('[data-row="6"][data-col="0"]');
            await page.click('[data-row="5"][data-col="0"]');
            await page.waitForFunction(() => currentPlayer === humanColor && !aiThinking && moveSequence.length === 2);
            await page.evaluate(() => window.pendingHint);
            assert.equal(await page.evaluate(() => !hintMove && !hintThinking && remainingHints === 10), true, 'human moves stay usable during hint search and reject its old result');
            await page.evaluate(() => { openSetupPanel(); setHumanSide('b'); startConfiguredGame(); });
            await page.waitForFunction(() => currentPlayer === 'b' && !aiThinking && moveSequence.length === 1);
            await page.click('#hint-button'); await page.waitForFunction(() => !!hintMove && !hintThinking);
            assert.equal(await page.evaluate(() => hintMove.piece[0]), 'b');
            await page.setViewportSize({ width: 375, height: 850 });
            await page.screenshot({ path: `test-results/${channel}-hint-black-mobile.png`, fullPage: true });
            assert.equal(await page.evaluate(() => pikafishEngine === window.originalEngine), true, 'all hints reuse the original engine');
            assert.equal(await page.locator('#review-arrow').isVisible(), true);
            assert.equal(await page.locator('.piece[data-review-grade]').count(), 0, 'live hints do not fabricate review grades');
            assert.deepEqual(errors, []); assert.deepEqual(external, []);
            fs.writeFileSync(`test-results/${channel}-hints.json`, JSON.stringify({ base, channel, version: browser.version(), offline: true, errors, external }, null, 2));
            console.log(`${channel}: real WASM offline hints, all ten/five uses, unlimited beginner, both sides, independent undo budget, read-only board, duplicate blocking, stale reset and engine reuse passed`);
        } finally { await browser.close(); }
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
