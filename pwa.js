(async () => {
    const element = document.getElementById('offline-status');
    const status = (text, ready = false) => {
        element.textContent = text;
        element.dataset.ready = String(ready);
    };
    if (!('serviceWorker' in navigator) || !window.isSecureContext) {
        status('離線安裝需要 HTTPS 或 localhost'); return;
    }
    navigator.serviceWorker.addEventListener('message', ({ data }) => {
        if (data.type === 'cache-progress') status(`下載離線資源：${Math.round(data.loaded / data.total * 100)}%`);
        if (data.type === 'cache-error') status(`離線快取未完成：${data.message}；請連線後重新載入。`);
        if (data.type === 'cache-status') status(data.ready ? '已可完全離線遊玩（瀏覽器仍可能清除儲存空間）' : '離線資源缺失；請連線後按修復快取。', data.ready);
    });
    const check = () => navigator.serviceWorker.controller?.postMessage({ type: 'cache-status' });
    navigator.serviceWorker.addEventListener('controllerchange', check);
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    try {
        const registration = await navigator.serviceWorker.register('./service-worker.js', { scope: './', updateViaCache: 'none' });
        const watch = worker => worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && registration.waiting) status('新版本已下載；請關閉所有本網站分頁後重新開啟。');
            if (worker.state === 'redundant' && !navigator.serviceWorker.controller) status('離線資源安裝失敗；請確認網絡及儲存空間後重新載入。');
        });
        registration.addEventListener('updatefound', () => watch(registration.installing));
        watch(registration.installing);
        check();
        window.repairOfflineCache = async () => {
            status('正在修復快取；即將重新載入');
            await registration.unregister();
            const prefix = `chinese-chess-${encodeURIComponent(new URL('./', location.href).pathname)}-`;
            for (const name of await caches.keys()) if (name.startsWith(prefix)) await caches.delete(name);
            location.reload();
        };
    } catch (error) { status(`離線安裝失敗：${error.message}`); }
})();
