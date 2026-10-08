/* Adapter glue only. The unmodified GPL Pikafish WASM and loader live in engine/. */
let engine = null;
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
        if (data.type === 'init' && !initializing) {
            initializing = true;
            const response = await fetch(new URL('engine/provenance.json', self.location.href));
            if (!response.ok) throw new Error('Engine provenance is missing');
            const { files } = await response.json();
            const net = await verifiedResource('pikafish.data', files['pikafish.data']);
            const wasm = await verifiedResource('pikafish.wasm', files['pikafish.wasm']);
            const js = await verifiedResource('pikafish.js', files['pikafish.js']);
            const script = URL.createObjectURL(new Blob([js], { type: 'text/javascript' }));
            try { importScripts(script); } finally { URL.revokeObjectURL(script); }
            engine = await Pikafish({
                wasmBinary: wasm,
                getPreloadedPackage: () => net,
                locateFile: file => new URL(`engine/${file}`, self.location.href).href,
                read_stdout: line => self.postMessage({ type: 'line', line }),
                printErr: message => self.postMessage({ type: 'line', line: `info string ${message}` }),
                onAbort: message => self.postMessage({ type: 'error', message: String(message) })
            });
            self.postMessage({ type: 'ready' });
        } else if (data.type === 'command' && engine) {
            // send_command accepts one line per invocation.
            for (const command of data.command.split('\n')) engine.send_command(command);
        }
    } catch (error) {
        self.postMessage({ type: 'error', message: error.message || String(error) });
    }
};
