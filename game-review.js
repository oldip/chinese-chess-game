// Review labels are site heuristics, not Pikafish outputs or calibrated win probabilities.
(function (root) {
    const moveToUci = root.moveToUci || (typeof require === 'function' && require('./pikafish-adapter.js').moveToUci);
    function classifyMove({ best, played, same = false, sacrifice = false, depth = 0 }) {
        if (!best || !played) return { label: '待分析', reason: '尚無可靠的主變例評分。' };
        const winningMate = score => score.type === 'mate' && score.value > 0;
        const losingMate = score => score.type === 'mate' && score.value <= 0;
        if (winningMate(best) && !winningMate(played))
            return { label: '漏著', reason: '引擎找到將殺路線，實際走法未保留該路線。', loss: null };
        if (same) {
            const brilliant = sacrifice && depth >= 10 && (winningMate(played) || played.value >= 100);
            return { label: brilliant ? '妙手' : '正著', reason: brilliant
                ? '引擎認可的有利棄子走法；妙手採保守啟發式判定。' : '與本次分析找到的最佳走法一致。', loss: 0 };
        }
        if (winningMate(played))
            return { label: '優秀', reason: '採用不同路線，仍保留引擎找到的將殺。', loss: null };
        if (losingMate(played)) {
            const delays = losingMate(best) && Math.abs(played.value) >= Math.abs(best.value);
            return { label: delays ? '良好' : '錯招', reason: delays
                ? '本來已存在對手的將殺，此走法未縮短抵抗步數。'
                : '相對最佳走法，此走法讓對手獲得更快的將殺路線。', loss: null };
        }
        if (losingMate(best))
            return { label: '優秀', reason: '實際走法的本次分析未找到先前對手的將殺路線。', loss: null };
        const loss = Math.max(0, best.value - played.value);
        const label = loss <= 25 ? '優秀' : loss <= 75 ? '良好' : loss <= 150 ? '軟招' : '錯招';
        return { label, reason: `相對本次最佳走法，評分損失約 ${(loss / 100).toFixed(2)}。`, loss };
    }

    async function analyseMove(engine, { fen, history, played, legal, current }) {
        if (!current()) return null;
        await engine.setPosition(fen, history);
        if (!current()) return null;
        const best = await engine.getAnalysis({ movetime: 2000, searchmoves: legal });
        if (!current()) return null;
        const same = !!best.move && moveToUci(best.move) === played;
        if (same) return { best, played: best, same };
        await engine.setPosition(fen, history);
        if (!current()) return null;
        const actual = await engine.getAnalysis({ movetime: 2000, searchmoves: [played] });
        return current() ? { best, played: actual, same } : null;
    }
    const api = { classifyMove, analyseMove };
    if (typeof module !== 'undefined') module.exports = api;
    else root.GameReview = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
