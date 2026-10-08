# 中國象棋 · 本機 Pikafish WASM

在原有網頁上整合真正的 Pikafish NNUE／Alpha-Beta 引擎。保留棋盤、翻轉、走棋動畫、音效、
紅黑選擇、雙人模式、難度、悔棋限制及棋譜。AI 在玩家裝置的 Web Worker 運算，沒有後端、
遠端 AI、CDN 或運行時 npm 依賴。適用於 GitHub Pages 的 `/repository-name/` 子路徑。

## 啟動、測試與建置

需要 Node.js 22 僅用於本機工具／CI；玩家使用網站不需要 Node.js。

```powershell
npm ci --ignore-scripts
npm test
npm run verify:engine
npm run build
npm start
```

開啟 `http://127.0.0.1:8080/chinese-chess-game/`。不要用 `file://`：Worker、WASM、Service Worker
需要 HTTP localhost 或 HTTPS。`dist/` 是可直接託管的靜態檔案，包含 GPL 原始碼和授權。
原始專案根目錄也可直接託管，但每次修改部署檔案後必須先執行 `npm run build` 更新 `precache.json`。
建置依全部檔案與 Service Worker 內容產生快取版本，避免遺漏手動更新版本號。

瀏覽器測試需要本機 Chrome、Edge；預設兩者都跑：

```powershell
npm start
# 在另一個終端
npm run test:browser
# 選擇其中一個
$env:TEST_CHANNELS='chrome'
npm run test:browser
```

測試輸出與截圖在 `test-results/`，不加入版本控制。防毒／代理若修改 HTTP HTML，例如本機 AdGuard
插入腳本，內容 hash 驗證會拒絕快取。可改用有有效憑證的本機 HTTPS；測試伺服器支援
`HTTPS_CERT`、`HTTPS_KEY`、`PORT`。`TEST_URL` 可指定網址。
`TEST_LOCAL_CERT=1` 只供 `127.0.0.1` 自簽憑證自動測試，不能用於公開網站。

## GitHub Pages 部署

1. 將本分支的變更 commit／push 至你的 GitHub repository。
2. Repository **Settings → Pages → Source** 選 **GitHub Actions**。
3. **Actions → Deploy GitHub Pages → Run workflow**，分支選 `fix/chinese-chess-playable`。
   合併至 `main` 後，後續推送會自動建置部署。
4. 開啟 `https://username.github.io/repository-name/`。首次完整下載約 **19.4 MB**。
5. 等「已可完全離線遊玩」後，可安裝 PWA／加入主畫面；關閉網絡、重新開啟仍能與 AI 下棋。

部署 workflow 只上傳 `dist/`。不需要 COOP／COEP、自建伺服器或雲端運算服務。
本次沒有替你修改 GitHub 設定或發布公開網站；公開 URL 的驗收需在部署後進行。

## 精確引擎與權重

| 項目 | 固定來源／版本 |
| --- | --- |
| WASM 發布 | [ousc/Pikafish-wasm · Pikafish-2023-03-05](https://github.com/ousc/Pikafish-wasm/releases/tag/Pikafish-2023-03-05)，`wasm-single` |
| 對應移植原始碼 tag commit | `c01a40cf74b9cec773379d5f5fea835b1fbc0b9f`；完整包 `engine/pikafish-source.zip` |
| UCI 實測名稱 | `Pikafish dev 2023-03-08`，原始碼以 `__DATE__` 顯示編譯日期，與發布 tag 日期不同 |
| NNUE | [官方 Pikafish-2023-03-05](https://github.com/official-pikafish/Pikafish/releases/tag/Pikafish-2023-03-05) 隨附 `pikafish.nnue` |
| NNUE SHA-256 | `9bed5ed4f2f356d361c859728c68b1f9103fa982e5d9fe658b38f71dcbcec0a9` |
| WASM SHA-256 | `d2f21bfed669fc66546cbe312d25796ab65a13ba7d5277305c7ecdf3a5a043c3` |
| JS loader SHA-256 | `f3771bcdbd344d1efa9b17092b0b72bca708633a66eb7d7a0add248049c5a4d5` |

`pikafish.data` 是上游 Emscripten 預載包，其內容**恰好只有完整原始 NNUE**，18,070,595 bytes；
已與官方發布的 `.nnue` 做 SHA-256 比對，完全相同。原始 JS loader、WASM、權重均沒有修改。
所有其他檔案 hash、大小及來源保存在 `engine/provenance.json` 與 `engine/SHA256SUMS`。
Worker 初始化會驗證三個執行資源的大小及 SHA-256，再把 NNUE 放進引擎虛擬檔案系統。

這是較舊但已有真正單線程構建的 Pikafish，不是最新主線。
[brianhliou 的較新移植](https://github.com/brianhliou/pikafish-wasm) 使用 pthreads，要求跨來源隔離；
把 Threads 改為 1 不能消除其 SharedArrayBuffer 要求，所以本次沒有採用其二進位檔。

## Adapter 與遊戲控制

```javascript
const engine = new PikafishEngine({ onProgress: progress => console.log(progress) });
await engine.init();                         // uci/uciok + isready/readyok
await engine.configure({ threads: 1, hash: 16, skill: 10 });
await engine.setPosition(boardToFen(initialBoard, 'r'), ['a3a4']);
const move = await engine.getBestMove({ movetime: 1000, depth: 0 });
await engine.stop();
await engine.reset();                        // ucinewgame
engine.destroy();
```

- 邏輯棋盤 row 0 在黑方底線，row 9 在紅方底線；UCI `a0` 是 row 9／col 0。
  紅方為 FEN `w`；FEN 使用 `r n b a k c p`，UI `R H E A G C S` 透過轉換函式映射。
  棋盤翻轉只影響顯示。`fenToBoard` 可讀取完整 Xiangqi FEN。
- 每次發送初始 FEN 與全部走步；使用既有合法走法與長將／長捉过滤結果產生 `searchmoves`。
  回傳 bestmove 再驗證一次，才執行動畫／棋譜／勝負判斷。
- 一個 Adapter 管理一個 Worker，正常每步重用 NNUE。搜尋同步佔用 Worker，不會佔用 UI 執行緒。
  此構建不能在搜尋中處理新 UCI 輸入，`stop()` 會直接終止正在搜尋的 Worker，拒絕等待中的 Promise；
  下次搜尋從本站／離線快取重載。閒置時使用 UCI stop。重新開局／悔棋會送 ucinewgame。
- 取消、重新開始、切換模式與頁面離開會使搜尋世代失效，連舊 timer、catch、finally 都不能修改新局。
  取消初始化後的舊 Promise 不能終止新 Worker。返回快取頁面會恢復未完成的 AI 回合。
- 引擎失敗時顯示錯誤，可按「重試 AI」；不會偷偷回退到舊 AI 或遠端服務。
- 背景預判目前關閉，避免玩家回合也持續耗用 CPU。舊 `engine-core.js`、`ai-worker.js` 與手工 AI
  戰術測試留作歷史參考，不載入網站，也不打包到 `dist/`。`tests/regression.js` 屬舊引擎戰術測試，
  不代表 Pikafish 驗收；新引擎以真實 WASM 瀏覽器測試驗收。

## 難度與規則

保留原本初／中／高級思考時間範圍 1200–1500／3600–5000／6500–10000 ms，以及無限／3／0 次悔棋。
對應 Pikafish Skill Level 0／10／20，不是單純限制深度，但沒有經過人類棋力／Elo 校準；初級仍可能很強。
深度上限可選 4／8／12／20，或僅按原本思考時間；搜尋以先到達的限制停止。
Hash 可選 8／16／32／64 MB，預設 16 MB。固定一個 CPU 搜尋執行緒。
上游構建初始 WASM 記憶體為 **256 MiB**；Hash 並非整個引擎記憶體上限。
低記憶體手機請選 8 MB Hash／初級；Android 真機記憶體與效能尚未驗收。

保留原有將軍、自將、飛將、馬腿、象眼、河界、宮界、將死與困斃判定。
原有長將／長捉只判斷特定四步循環，並非完整賽事規則；没有新增完整三次重複和棋或六十回合裁決。
為與 UI 一致，關閉引擎 `Sixty Move Rule`，選用 `Repetition Rule=ChineseRule`；根節點仍由現有規則控制。
既有難度在開始走棋後鎖定，變更時請進入「對局設定」再開始新局。
本專案沒有持久化棋譜或設定，離線資源快取不等同於自動保存對局。

## 離線與更新

Service Worker 先逐檔下載並驗證 HTML、JS、CSS、WASM、NNUE、manifest、icons、授權與原始碼，
全部成功才完成安裝。顯示 byte 下載進度；中斷／長度不符／hash 不符會移除未完成的新快取。
快取依網站子路徑隔離；完整快取可重新開頁與初始化新 Worker，無需網絡。

新版本會保留舊版運行中的完整快取，等待所有舊分頁關閉，再啟用新一代快取。
不要混用不同版本的 NNUE／WASM。每次修改先 build，再把同一次 build 的整個 `dist/` 部署。
瀏覽器可能清除儲存；網站重新檢查必要檔案是否存在，缺失時撤銷離線就緒標示。
恢復網絡後按「修復快取」重新下載；離線時若連 HTML 都被清除，網站無法自行啟動，必須先連線。

## 授權及重新編譯／更新

- Pikafish／WASM 移植是 **GPL-3.0-or-later**；保留 `engine/Copying.txt`、`engine/AUTHORS`，
  對應 fork 原始碼隨網站提供於 `engine/pikafish-source.zip`。上游單線程修改包含在原始碼包中。
- NNUE 的獨立限制見 `engine/NNUE-License.md` 和官方發布原文 `engine/official-release-README.md`：
  **未經許可禁止商業用途**，另有合法使用及特定使用者限制。權重不會因引擎 GPL 而變成無限制商用。
- 原倉庫未附網站程式碼授權。本次沒有替原作者重新授權，或聲稱獨立 Worker 通訊必然排除 GPL
  對組合作品的要求。新增 Adapter／Worker 包裝及整合程式碼按 GPL-3.0-or-later 提供；
  對外重發網站時仍需確認你對原網站程式碼的權利及組合作品義務，不能把整站宣稱為閉源／MIT。

重編譯現有版本，在隔離工具目錄解壓 `engine/pikafish-source.zip`，準備 Emscripten SDK、GNU make，
將本站 `engine/pikafish.data` 複製為 source 的 `src/emscripten/pikafish.nnue`，執行：

```sh
cd <extracted-source>/src
make -j build ARCH=wasm-single COMP=emscripten
# 產物在 src/emscripten/pikafish.{js,wasm,data}
```

發布者未提供精確 Emscripten 工具鏈版本，所以本次保留原始發布二進位檔，**不聲稱可逐 byte 重現其編譯結果**。
自行編譯／升級時記錄你實際使用的 SDK 版本、source commit、全部修改與權重來源；不能只替換最新版 NNUE。
更新引擎流程：核實 source／授權／權重相容性 → 替換三個資源及對應 source 包 → 修改
`scripts/pin-engine.cjs` 的版本資料與官方權重 hash → 執行該腳本 → `npm run verify:engine` →
`npm test`／`npm run test:browser` → `npm run build` → 部署完整 dist。

測試結果與未能驗證項目見 [docs/verification.md](docs/verification.md)。
