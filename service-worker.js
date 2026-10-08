// Regenerate precache.json with `npm run build` whenever a deployable file changes.
const VERSION = 'pikafish-2c91dfde88fc3b8d';
const scope = new URL('./', self.location.href);
const CACHE_PREFIX = `chinese-chess-${encodeURIComponent(scope.pathname)}-`;
const CACHE = `${CACHE_PREFIX}${VERSION}`;
let resources = [];

async function announce(message) {
    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    clients.forEach(client => client.postMessage(message));
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

self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE);
        try {
            const response = await fetch(new URL('precache.json', scope), { cache: 'no-store' });
            if (!response.ok) throw new Error('快取清單下載失敗');
            const manifest = await response.json();
            if (manifest.version !== VERSION) throw new Error('版本不相容，請重新載入');
            resources = manifest.files;
            const total = resources.reduce((sum, file) => sum + file.bytes, 0);
            let loaded = 0;
            for (const file of resources) {
                const url = new URL(file.path, scope);
                const response = await fetch(url, { cache: 'no-store' });
                if (!response.ok) throw new Error(`無法快取 ${file.path}`);
                const bytes = new Uint8Array(file.bytes);
                const reader = response.body.getReader();
                let offset = 0;
                for (;;) {
                    const chunk = await reader.read();
                    if (chunk.done) break;
                    if (offset + chunk.value.length > bytes.length) throw new Error(`資源長度不符：${file.path}`);
                    bytes.set(chunk.value, offset); offset += chunk.value.length;
                    await announce({ type: 'cache-progress', loaded: loaded + offset, total });
                }
                const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join('');
                if (offset !== file.bytes || digest !== file.sha256) throw new Error(`資源不完整或版本不符：${file.path}`);
                await cache.put(url, new Response(bytes, { headers: response.headers }));
                loaded += offset;
            }
            await cache.put(new URL('precache.json', scope), new Response(JSON.stringify(manifest), { headers: { 'Content-Type': 'application/json' } }));
            // Let updates wait until existing clients close; do not mix app generations.
        } catch (error) {
            await caches.delete(CACHE);
            await announce({ type: 'cache-error', message: error.message });
            throw error;
        }
    })());
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
        // Missing data invalidates the offline claim; recover from this host if online.
        if (!await complete()) await announce({ type: 'cache-status', ready: false, version: VERSION });
        return fetch(event.request);
    })());
});
