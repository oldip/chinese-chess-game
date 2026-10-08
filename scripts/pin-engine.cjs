// Run only when deliberately updating the pinned distribution, then review all hashes.
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const root = path.join(__dirname, '..');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const files = {};
for (const name of ['pikafish.js', 'pikafish.wasm', 'pikafish.data', 'pikafish-source.zip', 'Copying.txt', 'AUTHORS']) {
    const bytes = fs.readFileSync(path.join(root, 'engine', name));
    files[name] = { bytes: bytes.length, sha256: sha256(bytes) };
}
const officialNetHash = '9bed5ed4f2f356d361c859728c68b1f9103fa982e5d9fe658b38f71dcbcec0a9';
if (files['pikafish.data'].sha256 !== officialNetHash) throw new Error('Does not match verified official 2023-03-05 NNUE');
const metadata = {
    release: 'Pikafish-2023-03-05', variant: 'wasm-single',
    runtimeUciName: 'Pikafish dev 2023-03-08',
    runtimeNameExplanation: 'Published release binary identifies as dev plus __DATE__ build date; do not confuse that with the release tag.',
    distribution: 'https://github.com/ousc/Pikafish-wasm/releases/download/Pikafish-2023-03-05/Pikafish-wasm.2023-03-05.zip',
    sourceCommit: 'c01a40cf74b9cec773379d5f5fea835b1fbc0b9f',
    source: 'https://github.com/ousc/Pikafish-wasm/tree/c01a40cf74b9cec773379d5f5fea835b1fbc0b9f',
    officialNetRelease: 'https://github.com/official-pikafish/Pikafish/releases/tag/Pikafish-2023-03-05',
    nnue: { file: 'pikafish.data', format: 'Unmodified raw pikafish.nnue, preloaded as /pikafish.nnue by upstream loader', sha256: officialNetHash },
    modifications: 'None to distributed engine/loader/NNUE. Adapter and Worker wrapper are separate files.',
    compilation: 'make -j build ARCH=wasm-single COMP=emscripten',
    toolchain: 'Release publisher did not pin exact Emscripten version. Original binary retained; byte-identical rebuild not claimed.',
    files
};
fs.writeFileSync(path.join(root, 'engine/provenance.json'), JSON.stringify(metadata, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'engine/SHA256SUMS'), Object.entries(files).map(([name, meta]) => `${meta.sha256}  ${name}`).join('\n') + '\n');
