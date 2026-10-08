// SPDX-License-Identifier: GPL-3.0-or-later
(function (root) {
    function parseBookMoves(text) {
        return text.replace(/\0/g, '').trim().split('|').flatMap(entry => {
            const match = entry.trim().match(/^move:([a-i][0-9][a-i][0-9])$/);
            return match ? [match[1]] : [];
        });
    }

    class CloudOpeningBook {
        constructor({ fetcher = root.fetch.bind(root), storage = null, timeout = 2500, openingMoves = root.CHESSDB_OPENINGS || {} } = {}) {
            this.fetcher = fetcher;
            this.storage = storage;
            this.timeout = timeout;
            this.cache = new Map();
            this.openingMoves = openingMoves;
        }

        async getMove(fen, playableMoves, { signal } = {}) {
            if (signal?.aborted) return null;
            const position = fen.trim().split(/\s+/).slice(0, 2).join(' ');
            const bundledMove = this.openingMoves[position]?.find(move => playableMoves.includes(move));
            if (bundledMove) return bundledMove;
            const key = `chinese-chess-cdb-v1:${position}`;
            if (!this.cache.has(position)) {
                try {
                    const saved = this.storage?.getItem(key);
                    if (saved) this.cache.set(position, parseBookMoves(saved));
                } catch { /* Storage can be blocked or cleared by the browser. */ }
            }
            if (this.cache.has(position)) return this.cache.get(position).find(move => playableMoves.includes(move)) || null;
            if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
            const controller = new AbortController();
            const abort = () => controller.abort();
            signal?.addEventListener('abort', abort, { once: true });
            const timer = setTimeout(abort, this.timeout);
            try {
                const url = new URL('https://www.chessdb.cn/chessdb.php');
                url.search = new URLSearchParams({ action: 'querybest', board: position, learn: '0' });
                const response = await this.fetcher(url, { signal: controller.signal, credentials: 'omit', cache: 'no-store' });
                if (!response.ok) return null;
                const moves = parseBookMoves(await response.text());
                if (controller.signal.aborted) return null;
                this.cache.set(position, moves);
                if (moves.length) {
                    try { this.storage?.setItem(key, moves.map(move => `move:${move}`).join('|')); } catch { /* Keep the session cache. */ }
                }
                return moves.find(move => playableMoves.includes(move)) || null;
            } catch { return null; }
            finally {
                clearTimeout(timer);
                signal?.removeEventListener('abort', abort);
            }
        }
    }

    const api = { CloudOpeningBook, parseBookMoves };
    if (typeof module !== 'undefined') module.exports = api;
    else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
