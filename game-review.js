// Review labels are site heuristics, not Pikafish outputs or calibrated win probabilities.
(function (root) {
    const moveToUci = root.moveToUci || (typeof require === 'function' && require('./pikafish-adapter.js').moveToUci);
    function classifyMove({ best, played, same = false, sacrifice = false, depth = 0 }) {
        if (!best || !played) return { label: '待分析', reason: '尚無可靠的主變例評分。' };
        const value = score => score.type === 'mate'
            ? (score.value > 0 ? 100000 - Math.abs(score.value) * 100 : -100000 + Math.abs(score.value) * 100)
            : score.value;
        const loss = Math.max(0, value(best) - value(played));
        if (best.type === 'mate' && best.value > 0 && !(played.type === 'mate' && played.value > 0))
            return { label: '漏著', reason: '引擎找到將殺路線，實際走法未保留該路線。', loss };
        if (same) {
            const brilliant = sacrifice && depth >= 10 && value(played) >= 100;
            return { label: brilliant ? '妙手' : '正著', reason: brilliant
                ? '引擎認可的有利棄子走法；妙手採保守啟發式判定。' : '與本次分析找到的最佳走法一致。', loss: 0 };
        }
        if (best.type === 'mate' && best.value > 0 && played.type === 'mate' && played.value > 0)
            return { label: '優秀', reason: '採用不同路線，仍保留引擎找到的將殺。', loss: 0 };
        const label = loss <= 25 ? '優秀' : loss <= 75 ? '良好' : loss <= 150 ? '軟招' : '錯招';
        return { label, reason: `相對本次最佳走法，評分損失約 ${(loss / 100).toFixed(2)}。`, loss };
    }

    async function analyseMove(engine, { fen, history, played, legal, current }) {
        if (!current()) return null;
        await engine.setPosition(fen, history);
        if (!current()) return null;
        const best = await engine.getAnalysis({ movetime: 500, searchmoves: legal });
        if (!current()) return null;
        const same = !!best.move && moveToUci(best.move) === played;
        if (same) return { best, played: best, same };
        await engine.setPosition(fen, history);
        if (!current()) return null;
        const actual = await engine.getAnalysis({ movetime: 500, searchmoves: [played] });
        return current() ? { best, played: actual, same } : null;
    }
    const api = { classifyMove, analyseMove };
    if (typeof module !== 'undefined') module.exports = api;
    else root.GameReview = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
