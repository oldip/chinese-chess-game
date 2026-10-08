let finishOfflinePreparation;
window.offlinePreparation = new Promise(resolve => { finishOfflinePreparation = resolve; });
(async () => {
    const element = document.getElementById('offline-status');
    const status = (text, ready = false) => {
        element.textContent = text;
        element.hidden = ready;
        element.dataset.ready = String(ready);
    };
    const unavailable = () => {
        status('離線資料尚未備妥，連線後會自動下載。');
        finishOfflinePreparation(false);
    };
    if (!('serviceWorker' in navigator) || !window.isSecureContext) { unavailable(); return; }
    let downloading = false;
    const check = () => navigator.serviceWorker.controller?.postMessage({ type: 'cache-status' });
    navigator.serviceWorker.addEventListener('message', ({ data, source }) => {
        // A waiting update must not change the current page's download/readiness state.
        if (navigator.serviceWorker.controller && source !== navigator.serviceWorker.controller) return;
        if (data.type === 'cache-progress') {
            downloading = true;
            status(`正在下載遊戲資料 ${Math.min(100, Math.round(data.loaded / data.total * 100))}%`);
        }
        if (data.type === 'cache-error') {
            downloading = false;
            console.warn(data.message);
            unavailable();
            if (data.updating) status('遊戲已更新，關閉本網站分頁後重新開啟即可完成。');
        }
        if (data.type === 'cache-status') {
            if (data.ready) {
                downloading = false;
                status('', true);
                finishOfflinePreparation(true);
                window.dispatchEvent(new Event('offline-ready'));
            } else if (navigator.onLine && !downloading) {
                downloading = true;
                status('正在下載遊戲資料…');
                navigator.serviceWorker.controller?.postMessage({ type: 'prepare-offline' });
            } else if (!navigator.onLine) unavailable();
        }
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => { downloading = false; check(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    const register = async () => {
        try {
            const registration = await navigator.serviceWorker.register('./service-worker.js', { scope: './', updateViaCache: 'none' });
            const watch = worker => worker?.addEventListener('statechange', () => {
                if (worker.state === 'installed' && registration.waiting) check();
                if (worker.state === 'redundant' && !navigator.serviceWorker.controller) unavailable();
            });
            registration.addEventListener('updatefound', () => watch(registration.installing));
            watch(registration.installing);
            check();
        } catch { unavailable(); }
    };
    window.addEventListener('online', () => { downloading = false; register(); });
    await register();
})();
