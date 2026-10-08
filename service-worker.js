// Regenerate precache.json with `npm run build` whenever a deployable file changes.
const VERSION = 'pikafish-a453211f2ca5f819';
const scope = new URL('./', self.location.href);
const CACHE_PREFIX = `chinese-chess-${encodeURIComponent(scope.pathname)}-`;
const CACHE = `${CACHE_PREFIX}${VERSION}`;
let resources = [];
let preparing = null;

async function announce(message) {
    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    clients.forEach(client => client.postMessage({ ...message, version: VERSION }));
}

async function inventory() {
    if (!resources.length) {
        const cache = await caches.open(CACHE);
        const manifest = await cache.match(new URL('precache.json', scope));
        if (!manifest) return [];
        resources = (await manifest.json()).files;
    }
    return resources;
}

async function complete() {
    const files = await inventory();
    if (!files.length) return false;
    const cache = await caches.open(CACHE);
    for (const file of files) if (!await cache.match(new URL(file.path, scope))) return false;
    return true;
}

function prepare(announceReady = true) {
    if (preparing) return preparing;
    preparing = (async () => {
        const cache = await caches.open(CACHE);
        let updating = false;
        try {
            const response = await fetch(new URL('precache.json', scope), { cache: 'no-store' });
            if (!response.ok) throw new Error('快取清單下載失敗');
            let manifest = await response.json();
            if (manifest.version !== VERSION) {
                updating = true;
                // A live page repairs against its own generation while an update waits.
                const saved = await cache.match(new URL('precache.json', scope));
                if (!saved) throw new Error('版本不相容，請重新載入');
                manifest = await saved.json();
                if (manifest.version !== VERSION) throw new Error('版本不相容，請重新載入');
            }
            resources = manifest.files;
            const total = resources.reduce((sum, file) => sum + file.bytes, 0);
            let loaded = 0;
            for (const file of resources) {
                const url = new URL(file.path, scope);
                if (await cache.match(url)) { loaded += file.bytes; continue; }
                const response = await fetch(url, { cache: 'no-store' });
                if (!response.ok) throw new Error(`無法快取 ${file.path}`);
                // Protection software may add markup to HTML. Keep exact checks for code and NNUE/WASM.
                const html = file.path === 'index.html';
                if (html && updating) throw new Error('Cannot restore new HTML into an old generation');
                let bytes = html ? null : new Uint8Array(file.bytes);
                const chunks = [];
                const reader = response.body.getReader();
                let offset = 0;
                for (;;) {
                    const chunk = await reader.read();
                    if (chunk.done) break;
                    if (html) chunks.push(chunk.value);
                    else {
                        if (offset + chunk.value.length > bytes.length) throw new Error(`資源長度不符：${file.path}`);
                        bytes.set(chunk.value, offset);
                    }
                    offset += chunk.value.length;
                    await announce({ type: 'cache-progress', loaded: loaded + Math.min(offset, file.bytes), total });
                }
                if (html) {
                    bytes = new Uint8Array(offset);
                    let position = 0;
                    for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.length; }
                } else {
                    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join('');
                    if (offset !== file.bytes || digest !== file.sha256) throw new Error(`資源不完整或版本不符：${file.path}`);
                }
                await cache.put(url, new Response(bytes, { headers: response.headers }));
                loaded += file.bytes;
            }
            await cache.put(new URL('precache.json', scope), new Response(JSON.stringify(manifest), { headers: { 'Content-Type': 'application/json' } }));
            if (announceReady) await announce({ type: 'cache-status', ready: true, version: VERSION });
            // Let updates wait until existing clients close; do not mix app generations.
        } catch (error) {
            await announce({ type: 'cache-error', message: error.message, updating });
            throw error;
        }
    })().finally(() => { preparing = null; });
    return preparing;
}

self.addEventListener('install', event => {
    event.waitUntil(prepare(false).catch(async error => { await caches.delete(CACHE); throw error; }));
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        if (!await complete()) throw new Error('Incomplete offline cache');
        for (const name of await caches.keys()) {
            if (name.startsWith(CACHE_PREFIX) && name !== CACHE) await caches.delete(name);
        }
        await self.clients.claim();
        await announce({ type: 'cache-status', ready: true, version: VERSION });
    })());
});

self.addEventListener('message', event => {
    if (event.data?.type === 'cache-status') {
        event.waitUntil(complete().then(ready => event.source.postMessage({ type: 'cache-status', ready, version: VERSION })));
    }
    if (event.data?.type === 'prepare-offline') event.waitUntil(prepare().catch(() => {}));
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    if (event.request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
    event.respondWith((async () => {
        const cache = await caches.open(CACHE);
        const key = event.request.mode === 'navigate' && (url.pathname === scope.pathname || url.pathname === scope.pathname + 'index.html')
            ? new URL('index.html', scope) : url;
        const cached = await cache.match(key);
        if (cached) return cached;
        // Repair required files against this generation before returning any live bytes.
        if (!await complete()) await announce({ type: 'cache-status', ready: false, version: VERSION });
        const files = await inventory();
        if (files.some(file => new URL(file.path, scope).pathname === key.pathname)) {
            try {
                await prepare();
                const restored = await cache.match(key);
                if (restored) return restored;
            } catch (error) {
                if (event.request.mode !== 'navigate') throw error;
                await self.registration.update().catch(() => {});
                return new Response('<!doctype html><meta charset="utf-8"><p>遊戲資料尚未備妥，請連線後關閉本網站分頁，再重新開啟。</p>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
            }
        }
        return fetch(event.request);
    })());
});
