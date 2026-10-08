const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const base = process.env.TEST_URL || 'http://127.0.0.1:8080/chinese-chess-game/';
(async () => {
    for (const channel of (process.env.TEST_CHANNELS || 'chrome,msedge').split(',')) {
        const browser = await chromium.launch({ channel, headless: true, args: process.env.TEST_HOST_RESOLVER_RULES ? ['--host-resolver-rules=' + process.env.TEST_HOST_RESOLVER_RULES] : [] });
        try {
            const cdp = await browser.newBrowserCDPSession();
            const workers = async () => (await cdp.send('Target.getTargets')).targetInfos.filter(t => t.type === 'worker' && t.url.startsWith(base));
            const waitWorkers = async expected => {
                for (let i = 0; i < 100; i++) { const targets = await workers(); if (targets.length === expected) return; await new Promise(resolve => setTimeout(resolve, 100)); }
                assert.equal((await workers()).length, expected, 'Worker count must settle without leaked pthreads');
            };
            const results = [];
            for (const [cores, memory, expected, isolated] of [[8,8,4,true],[4,8,3,true],[8,4,2,true],[8,2,1,true],[1,8,1,true],[8,8,1,false]]) {
                const context = await browser.newContext(), page = await context.newPage(), errors = [];
                page.on('pageerror', e => errors.push(e.message));
                await context.addInitScript(({ cores, memory, isolated }) => {
                    Object.defineProperty(navigator, 'hardwareConcurrency', { value: cores });
                    Object.defineProperty(navigator, 'deviceMemory', { value: memory });
                    if (!isolated) delete Navigator.prototype.serviceWorker;
                }, { cores, memory, isolated });
                await page.goto(base, { waitUntil: 'commit' });
                await page.waitForFunction(() => typeof pikafishEngine !== 'undefined' && pikafishEngine?.ready, null, { timeout: 120000 });
                const search = async () => page.evaluate(async () => {
                    await pikafishEngine.configure();
                    await pikafishEngine.setPosition(boardToFen(initialBoard, 'r'));
                    const move = await pikafishEngine.getBestMove({ movetime: 100 });
                    if (!getAllLegalMoves(initialBoard, 'r').some(m => sameMove(m, move))) throw new Error('Illegal engine move');
                    return { mode: pikafishEngine.mode, threads: pikafishEngine.threads, isolated: crossOriginIsolated };
                });
                const result = await search();
                assert.equal(result.threads, expected);
                assert.equal(result.mode, expected > 1 ? 'multi' : 'single');
                assert.equal(result.isolated, isolated);
                await waitWorkers(expected > 1 ? expected + 2 : 1); // root wrapper + search pool + one control pthread
                if (expected === 4) {
                    for (let cycle = 0; cycle < 3; cycle++) {
                        await page.evaluate(() => { window.cancelledSearch = pikafishEngine.getBestMove({ movetime: 30000 }).then(() => false, () => true); });
                        await page.waitForFunction(() => pikafishEngine.searching);
                        assert.ok(await page.evaluate(async () => { await pikafishEngine.stop(); await pikafishEngine.cleaning; return await window.cancelledSearch; }));
                        await waitWorkers(0);
                        await search(); await waitWorkers(6);
                    }
                    await page.evaluate(async () => { pikafishEngine.destroy(); await pikafishEngine.cleaning; });
                    await waitWorkers(0);
                    // A damaged/unavailable multi binary must still permit real single-thread AI.
                    await page.evaluate(async () => {
                        const cache = await caches.open((await caches.keys()).find(n => n.startsWith('chinese-chess-')));
                        const url = new URL('engine/pikafish-multi.wasm', location.href);
                        window.originalMulti = await cache.match(url);
                        await cache.put(url, new Response('damaged multi runtime'));
                        window.fallbackEngine = new PikafishEngine();
                        await fallbackEngine.configure();
                        await fallbackEngine.setPosition(boardToFen(initialBoard, 'r'));
                        const move = await fallbackEngine.getBestMove({ movetime: 100 });
                        if (!getAllLegalMoves(initialBoard, 'r').some(m => sameMove(m, move))) throw new Error('Illegal fallback move');
                        await cache.put(url, window.originalMulti);
                    });
                    assert.deepEqual(await page.evaluate(() => ({ mode: fallbackEngine.mode, threads: fallbackEngine.threads })), { mode: 'single', threads: 1 });
                    await waitWorkers(1);
                    await page.evaluate(() => fallbackEngine.destroy()); await waitWorkers(0);
                    await context.setOffline(true);
                    await page.reload({ waitUntil: 'domcontentloaded' });
                    await page.waitForFunction(() => typeof pikafishEngine !== 'undefined' && pikafishEngine?.ready);
                    assert.equal((await search()).threads, 4, 'genuine multi engine also initializes and searches entirely offline');
                }
                assert.deepEqual(errors, []);
                results.push({ cores, memory, ...result });
                await context.close(); await waitWorkers(0);
            }
            fs.mkdirSync('test-results', { recursive: true });
            fs.writeFileSync(`test-results/${channel}-threads.json`, JSON.stringify({ browser: browser.version(), results }, null, 2));
            console.log(`${channel} ${browser.version()}: real 4/3/2/1-thread search, no-isolation single fallback, damaged-multi fallback, three 30-second search cancellations without leaked pthreads, offline multi reload passed`);
        } finally { await browser.close(); }
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
