(function (root) {
    const fenPieces = { R: 'r', H: 'n', E: 'b', A: 'a', G: 'k', C: 'c', S: 'p' };
    const boardPieces = { r: 'R', n: 'H', h: 'H', b: 'E', e: 'E', a: 'A', k: 'G', c: 'C', p: 'S' };

    function boardToFen(board, color, halfmove = 0, fullmove = 1) {
        if (board.length !== 10 || !['r', 'b'].includes(color)) throw new Error('Invalid board/color');
        const ranks = board.map(row => {
            if (row.length !== 9) throw new Error('Invalid rank');
            let rank = '', empty = 0;
            for (const piece of row) {
                if (!piece) { empty++; continue; }
                if (empty) { rank += empty; empty = 0; }
                const token = fenPieces[piece[1]];
                if (!token || !['r', 'b'].includes(piece[0])) throw new Error('Invalid piece');
                rank += piece[0] === 'r' ? token.toUpperCase() : token;
            }
            return rank + (empty || '');
        });
        return `${ranks.join('/')} ${color === 'r' ? 'w' : 'b'} - - ${halfmove} ${fullmove}`;
    }

    function fenToBoard(fen) {
        const fields = fen.trim().split(/\s+/);
        if (fields.length !== 6 || !['w', 'b'].includes(fields[1]) || fields[2] !== '-' || fields[3] !== '-' ||
            !/^\d+$/.test(fields[4]) || !/^[1-9]\d*$/.test(fields[5])) throw new Error('Invalid Xiangqi FEN');
        const board = fields[0].split('/').map(rank => {
            const row = [];
            for (const token of rank) {
                if (/^[1-9]$/.test(token)) row.push(...Array(Number(token)).fill(''));
                else {
                    const type = boardPieces[token.toLowerCase()];
                    if (!type) throw new Error('Invalid FEN piece');
                    row.push((token === token.toUpperCase() ? 'r' : 'b') + type);
                }
            }
            if (row.length !== 9) throw new Error('Invalid FEN rank');
            return row;
        });
        if (board.length !== 10) throw new Error('Invalid FEN board');
        return { board, color: fields[1] === 'w' ? 'r' : 'b', halfmove: Number(fields[4]), fullmove: Number(fields[5]) };
    }

    function moveToUci(move) {
        const square = (row, col) => {
            if (!Number.isInteger(row) || row < 0 || row > 9 || !Number.isInteger(col) || col < 0 || col > 8)
                throw new Error('Invalid square');
            return String.fromCharCode(97 + col) + (9 - row);
        };
        return square(move.fromRow, move.fromCol) + square(move.toRow, move.toCol);
    }

    function uciToMove(uci) {
        if (uci === '(none)' || uci === '0000') return null;
        if (!/^[a-i][0-9][a-i][0-9]$/.test(uci)) throw new Error(`Invalid bestmove: ${uci}`);
        return { fromRow: 9 - Number(uci[1]), fromCol: uci.charCodeAt(0) - 97,
            toRow: 9 - Number(uci[3]), toCol: uci.charCodeAt(2) - 97 };
    }

    class PikafishEngine {
        constructor({ WorkerClass = root.Worker, baseUrl = new URL('./', root.location?.href).href,
            onProgress = () => {}, onLine = () => {} } = {}) {
            this.WorkerClass = WorkerClass;
            this.baseUrl = baseUrl;
            this.onProgress = onProgress;
            this.onLine = onLine;
            this.waiters = new Set();
            this.options = new Map();
            this.worker = null;
            this.initializing = null;
            this.ready = false;
            this.searching = false;
            this.generation = 0;
        }

        waitFor(match, timeout = 10000) {
            return new Promise((resolve, reject) => {
                const waiter = { match, resolve, reject };
                waiter.timer = setTimeout(() => this.fail(new Error('Pikafish response timeout')), timeout);
                this.waiters.add(waiter);
            });
        }

        receive(data) {
            if (data.type === 'error') { this.fail(new Error(data.message)); return; }
            if (data.type === 'progress') this.onProgress(data);
            if (data.type === 'line') {
                this.onLine(data.line);
                const option = /^option name (.+) type (\w+).*?(?: min (\d+) max (\d+))?$/.exec(data.line);
                if (option) this.options.set(option[1], { type: option[2], min: Number(option[3]), max: Number(option[4]) });
            }
            for (const waiter of this.waiters) {
                if (waiter.match(data)) {
                    clearTimeout(waiter.timer);
                    this.waiters.delete(waiter);
                    waiter.resolve(data);
                }
            }
        }

        fail(error) {
            this.generation++;
            this.worker?.terminate();
            this.worker = null;
            this.ready = false;
            this.searching = false;
            this.initializing = null;
            for (const waiter of this.waiters) {
                clearTimeout(waiter.timer);
                waiter.reject(error);
            }
            this.waiters.clear();
        }

        command(command) {
            if (!this.worker) throw new Error('Pikafish is unavailable');
            for (const line of command.split('\n')) this.worker.postMessage({ type: 'command', command: line });
        }

        async handshake(command, response) {
            const result = this.waitFor(data => data.type === 'line' && data.line === response);
            this.command(command);
            await result;
        }

        init() {
            if (this.ready) return Promise.resolve();
            if (this.initializing) return this.initializing;
            let initializedWorker = null;
            this.initializing = (async () => {
                if (!this.WorkerClass) throw new Error('Web Worker is required');
                const worker = new this.WorkerClass(new URL('pikafish-worker.js', this.baseUrl));
                initializedWorker = worker;
                this.worker = worker;
                worker.onmessage = event => { if (this.worker === worker) this.receive(event.data); };
                worker.onerror = event => { if (this.worker === worker) this.fail(new Error(event.message || 'Pikafish Worker failed')); };
                const loaded = this.waitFor(data => data.type === 'ready', 120000);
                worker.postMessage({ type: 'init' });
                await loaded;
                const checkOwner = () => { if (this.worker !== worker) throw new Error('Pikafish initialization cancelled'); };
                checkOwner();
                this.options.clear();
                await this.handshake('uci', 'uciok');
                checkOwner();
                await this.handshake('isready', 'readyok');
                checkOwner();
                this.ready = true;
                this.onProgress({ type: 'progress', stage: 'ready', loaded: 1, total: 1 });
            })().catch(error => {
                if (this.worker === initializedWorker) this.fail(error);
                throw error;
            });
            return this.initializing;
        }

        async configure({ threads = 1, hash = 16, skill = 20 } = {}) {
            const generation = this.generation;
            if (threads !== 1) throw new Error('This is a single-thread WASM build');
            if (![8, 16, 32, 64].includes(hash) || !Number.isInteger(skill) || skill < 0 || skill > 20)
                throw new Error('Invalid Hash/Skill Level');
            await this.init();
            if (generation !== this.generation) throw new Error('Pikafish operation cancelled');
            if (this.searching) throw new Error('Search already running');
            for (const [name, value] of [['Threads', 1], ['Hash', hash], ['Skill Level', skill]]) {
                if (!this.options.has(name)) throw new Error(`Pikafish does not support ${name}`);
                this.command(`setoption name ${name} value ${value}`);
            }
            // The existing UI does not adjudicate the engine's optional sixty-move rule.
            if (this.options.has('Sixty Move Rule')) this.command('setoption name Sixty Move Rule value false');
            if (this.options.has('Repetition Rule')) this.command('setoption name Repetition Rule value ChineseRule');
            await this.handshake('isready', 'readyok');
        }

        async setPosition(fen, moves = []) {
            const generation = this.generation;
            fenToBoard(fen);
            moves.forEach(move => { if (!uciToMove(move)) throw new Error('Invalid position move'); });
            await this.init();
            if (generation !== this.generation) throw new Error('Pikafish operation cancelled');
            if (this.searching) throw new Error('Search already running');
            this.command(`position fen ${fen}${moves.length ? ` moves ${moves.join(' ')}` : ''}`);
            await this.handshake('isready', 'readyok');
        }

        async getBestMove({ movetime = 1000, depth = 0, searchmoves = [] } = {}) {
            const generation = this.generation;
            if (!Number.isInteger(movetime) || movetime < 1 || movetime > 30000 ||
                !Number.isInteger(depth) || depth < 0 || depth > 64) throw new Error('Invalid search limits');
            searchmoves.forEach(move => { if (!uciToMove(move)) throw new Error('Invalid searchmove'); });
            await this.init();
            if (generation !== this.generation) throw new Error('Pikafish operation cancelled');
            if (this.searching) throw new Error('Search already running');
            this.searching = true;
            const worker = this.worker;
            try {
                const result = this.waitFor(data => data.type === 'line' && /^bestmove /.test(data.line), movetime + 15000);
                this.command(`go movetime ${movetime}${depth ? ` depth ${depth}` : ''}${searchmoves.length ? ` searchmoves ${searchmoves.join(' ')}` : ''}`);
                return uciToMove((await result).line.split(/\s+/)[1]);
            } finally {
                if (this.worker === worker) this.searching = false;
            }
        }

        async stop() {
            if (this.searching || (this.worker && !this.ready)) this.fail(new Error('Pikafish search cancelled'));
            else {
                this.generation++;
                if (this.worker) this.command('stop');
            }
        }

        async reset() {
            await this.stop();
            await this.init();
            await this.handshake('ucinewgame\nisready', 'readyok');
        }

        destroy() { this.fail(new Error('Pikafish destroyed/cancelled')); }
    }

    const api = { boardToFen, fenToBoard, moveToUci, uciToMove, PikafishEngine };
    if (typeof module !== 'undefined') module.exports = api;
    else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
