// SPDX-License-Identifier: GPL-3.0-or-later
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { initialBoard, getAllLegalMoves, applyMoveToBoard, otherColor } = require('../game.js');
const { boardToFen, moveToUci } = require('../pikafish-adapter.js');
const positionKey = (board, color) => boardToFen(board, color).split(' ').slice(0, 2).join(' ');
const mirrorMove = move => String.fromCharCode(202 - move.charCodeAt(0)) + move[1] + String.fromCharCode(202 - move.charCodeAt(2)) + move[3];

function addLine(book, start, pv) {
    let { board, color, ply } = start;
    const states = [], visited = new Set();
    for (const uci of pv.slice(0, 20 - ply)) {
        const key = positionKey(board, color);
        if (visited.has(key)) break;
        const move = getAllLegalMoves(board, color).find(candidate => moveToUci(candidate) === uci);
        if (!move) break;
        visited.add(key);
        states.push({ board, color, ply });
        for (const [fen, token] of [[key, uci], [positionKey(board.map(row => [...row].reverse()), color), mirrorMove(uci)]]) {
            book[fen] ||= [];
            if (!book[fen].includes(token)) book[fen].push(token);
        }
        board = applyMoveToBoard(board, move); color = otherColor(color); ply++;
    }
    return states;
}

async function download() {
    const directory = path.resolve(__dirname, '../books');
    const responseFile = path.resolve(__dirname, '../.tools/chessdb-opening-responses.jsonl');
    fs.mkdirSync(path.dirname(responseFile), { recursive: true });
    const responses = new Map();
    const archiveFile = path.join(directory, 'chessdb-responses.jsonl.gz');
    const savedResponses = fs.existsSync(responseFile) ? fs.readFileSync(responseFile, 'utf8') :
        fs.existsSync(archiveFile) ? zlib.gunzipSync(fs.readFileSync(archiveFile)).toString() : '';
    for (const line of savedResponses.trim().split('\n').filter(Boolean)) {
        const item = JSON.parse(line); responses.set(item.fen, item);
    }
    // Optional address override for maintenance when system DNS fails; TLS hostname verification remains enabled.
    const agent = new https.Agent({ keepAlive: true, maxSockets: 2, ...(process.env.CHESSDB_ADDRESS ? {
        lookup: (hostname, options, callback) => options.all ? callback(null, [{ address: process.env.CHESSDB_ADDRESS, family: 4 }]) : callback(null, process.env.CHESSDB_ADDRESS, 4)
    } : {}) });
    const book = {}, queue = [{ board: initialBoard, color: 'r', ply: 0 }];
    const seen = new Set([positionKey(initialBoard, 'r')]);
    const maxQueries = 1200, maxBytes = 3000000;
    let cursor = 0, completed = 0, failures = 0;
    const query = fen => new Promise((resolve, reject) => {
        const url = new URL('https://www.chessdb.cn/chessdb.php');
        url.search = new URLSearchParams({ action: 'querypv', board: fen, learn: '0', stable: '1', json: '1' });
        const request = https.get(url, { agent }, response => {
            let text = '';
            response.setEncoding('utf8'); response.on('data', chunk => text += chunk);
            response.on('end', () => {
                if (response.statusCode !== 200) return reject(new Error('HTTP ' + response.statusCode));
                try { resolve(JSON.parse(text.replace(/\0/g, ''))); } catch (error) { reject(error); }
            });
            response.on('error', reject);
        });
        request.setTimeout(15000, () => request.destroy(new Error('timeout')));
        request.on('error', reject);
    });
    while (cursor < queue.length && completed < maxQueries && Buffer.byteLength(JSON.stringify(book)) < maxBytes - 6000) {
        let fetched = false;
        const batch = queue.slice(cursor, cursor + Math.min(2, maxQueries - completed)); cursor += batch.length;
        await Promise.all(batch.map(async state => {
            const fen = positionKey(state.board, state.color);
            if (book[fen]) return;
            let saved = responses.get(fen);
            if (!saved) {
                for (let attempt = 0; attempt < 3 && !saved; attempt++) {
                    try {
                        saved = { fen, fetchedAt: new Date().toISOString(), response: await (fetched = true, query(fen)) };
                        responses.set(fen, saved); fs.appendFileSync(responseFile, JSON.stringify(saved) + '\n');
                    } catch (error) {
                        if (attempt === 2) { failures++; console.error('Query failed:', fen, error.message); }
                    }
                }
            }
            completed++;
            if (saved?.response.status !== 'ok' || !Array.isArray(saved.response.pv)) return;
            const states = addLine(book, state, saved.response.pv);
            // Broad early deviations, followed by the cloud's principal line up to ply 20.
            for (const point of states.slice(0, 4)) {
                for (const move of getAllLegalMoves(point.board, point.color)) {
                    if (point.ply + 1 >= 8) continue;
                    const child = { board: applyMoveToBoard(point.board, move), color: otherColor(point.color), ply: point.ply + 1 };
                    const childKey = positionKey(child.board, child.color);
                    if (!seen.has(childKey)) { seen.add(childKey); queue.push(child); }
                }
            }
        }));
        if (completed && completed % 20 === 0) console.log(JSON.stringify({ queries: completed, positions: Object.keys(book).length, bytes: Buffer.byteLength(JSON.stringify(book)), failures }));
        if (failures >= 10) throw new Error('Too many cloud failures; preserve responses and retry later');
        if (fetched) await new Promise(resolve => setTimeout(resolve, 100));
    }
    agent.destroy();
    if (Object.keys(book).length < 100) throw new Error('Insufficient cloud opening coverage');
    const sorted = Object.fromEntries(Object.entries(book).sort(([a], [b]) => a.localeCompare(b)));
    const bytes = Buffer.from('// chessdb.cn opening subset; source and license: books/provenance.json\n' + 'globalThis.CHESSDB_OPENINGS=' + JSON.stringify(sorted) + ';\n');
    if (bytes.length > maxBytes) throw new Error('Book exceeds 3 MB limit');
    const raw = Buffer.from([...responses.values()].filter(item => seen.has(item.fen)).map(item => JSON.stringify(item)).join('\n') + '\n');
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'chessdb-opening.js'), bytes);
    fs.writeFileSync(path.join(directory, 'chessdb-responses.jsonl.gz'), zlib.gzipSync(raw));
    const provenance = {
        schema: 1, version: new Date().toISOString().slice(0, 10), source: 'https://www.chessdb.cn/chessdb.php',
        sourceProject: 'https://github.com/noobpwnftw/chessdb', upstreamLicenseCommit: 'ab6c33133dba40e46a6f9828696c959fb4940221', license: 'Public domain unless otherwise specified by upstream; see LICENSE.txt',
        query: { action: 'querypv', learn: '0', stable: '1', json: '1' },
        selection: 'Bounded early legal deviations; legal cloud PV prefix through ply 20; left-right mirrored equivalents; no popularity ranking claimed',
        queries: completed, positions: Object.keys(sorted).length, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), failures,
        responseArchive: 'chessdb-responses.jsonl.gz', responseArchiveSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(directory, 'chessdb-responses.jsonl.gz'))).digest('hex')
    };
    fs.writeFileSync(path.join(directory, 'provenance.json'), JSON.stringify(provenance, null, 2) + '\n');
    console.log(JSON.stringify(provenance, null, 2));
}
module.exports = { addLine };
if (require.main === module) download().catch(error => { console.error(error); process.exitCode = 1; });
