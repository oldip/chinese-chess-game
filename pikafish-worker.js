/* Adapter glue only. The GPL Pikafish WASM and loader live in engine/. */
let engine = null;
let runtime = null;
let initializing = false;

async function verifiedResource(file, metadata) {
    const response = await fetch(new URL(`engine/${file}`, self.location.href));
    if (!response.ok) throw new Error(`無法載入 ${file} (${response.status})`);
    const reader = response.body.getReader();
    const bytes = new Uint8Array(metadata.bytes);
    let loaded = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (loaded + value.length > bytes.length) throw new Error(`${file} size mismatch`);
        bytes.set(value, loaded);
        loaded += value.length;
        self.postMessage({ type: 'progress', stage: file, loaded, total: bytes.length });
    }
    if (loaded !== bytes.length) throw new Error(`${file} incomplete; please reconnect and retry`);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join('');
    if (hash !== metadata.sha256) throw new Error(`${file} SHA-256 mismatch; please update/reinstall cached resources`);
    return bytes.buffer;
}

self.onmessage = async ({ data }) => {
    try {
        if (data.type === 'destroy') {
            (engine || runtime)?.PThread?.terminateAllThreads();
            self.postMessage({ type: 'destroyed' });
            self.close();
            return;
        }
        if (data.type === 'init' && !initializing) {
            initializing = true;
            const response = await fetch(new URL('engine/provenance.json', self.location.href));
            if (!response.ok) throw new Error('Engine provenance is missing');
            const { files } = await response.json();
            const net = await verifiedResource('pikafish.data', files['pikafish.data']);
            const multi = data.mode === 'multi';
            if (multi && (!self.crossOriginIsolated || typeof SharedArrayBuffer !== 'function')) throw new Error('Shared memory is unavailable');
            const prefix = multi ? 'pikafish-multi' : 'pikafish';
            const wasm = await verifiedResource(`${prefix}.wasm`, files[`${prefix}.wasm`]);
            const js = await verifiedResource(`${prefix}.js`, files[`${prefix}.js`]);
            const script = URL.createObjectURL(new Blob([js], { type: 'text/javascript' }));
            try { importScripts(script); } finally { URL.revokeObjectURL(script); }
            runtime = {
                wasmBinary: wasm,
                pthreadPoolSize: Math.max(1, Math.min(4, data.threads || 1)) + 1,
                mainScriptUrlOrBlob: new URL(`engine/${prefix}.js`, self.location.href).href,
                getPreloadedPackage: () => net,
                locateFile: file => new URL(`engine/${multi && file === 'pikafish.worker.js' ? 'pikafish-multi.worker.js' : file}`, self.location.href).href,
                read_stdout: line => self.postMessage({ type: 'line', line }),
                printErr: message => self.postMessage({ type: 'line', line: `info string ${message}` }),
                onAbort: message => self.postMessage({ type: 'error', message: String(message) })
            };
            engine = await Pikafish(runtime);
            self.postMessage({ type: 'ready' });
        } else if (data.type === 'command' && engine) {
            // send_command accepts one line per invocation.
            for (const command of data.command.split('\n')) engine.send_command(command);
        }
    } catch (error) {
        self.postMessage({ type: 'error', message: error.message || String(error) });
    }
};
