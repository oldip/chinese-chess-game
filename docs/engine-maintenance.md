# 引擎來源與維護紀錄

以下是維護者資料；玩家只需開啟 GitHub Pages 網頁。

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
`npm test`／`npm run test:browser` → `npm run build` 更新根目錄快取清單 → 提交完整靜態檔案。


本站根目錄就是已準備好的靜態網站，GitHub Pages 直接從 fix/chinese-chess-playable 分支根目錄發布，不需要部署建置流程。內部 scripts/build.cjs 用於修改資源後重新產生版本及 precache.json；不是玩家或網站伺服器的執行依賴。

難度預設每步最多 500／1500／2000 ms，Skill 0／10／20；自訂時間 0.5–30 秒，Skill 20。沒有經人類棋力校準，初級也可能很強。Hash 由程式自動選 8 或 16 MB，單線程；初始 WASM 記憶體 256 MiB。

HTML 可以因本機防護軟體加入標記而改變大小，下載成功後直接快取；JS、WASM、NNUE 等其他資源仍依版本清單驗證長度和 SHA-256。首次全部快取成功及接管頁面後才準備 AI，正常走棋重用同一 Worker／NNUE。已啟用快取遺失時，恢復網絡會自動補回缺少的檔案。

## 局面評分與弱化對手

每次走棋／悔棋後，以 Skill 20 獨立搜尋 150 ms，接收 UCI `info depth ... score cp/mate` 主變例的確切值，排除上下界與其他 MultiPV。
數值除以 100，以玩家所選紅／黑方為正負視角，字色固定所選方；正值佔優、負值落後。
短分析是估值，不是勝率或錯招品質評分；將殺另外顯示將殺方。
分析與 AI 共用單一 Worker，序列執行；世代、棋盤與完整歷史檢查隔離舊結果。
AI 正常搜尋前還原其 Skill，避免分析改強初／中級。
原生 Skill 0／10 會選擇次佳走法，但沒有固定失誤比例；開局包走法不弱化。
中級可悔棋 10 次，高級 5 次；快取完成後隱藏提示，錯誤或下載中仍顯示狀態。

## 結束後復盤

`game-review.js` 接收 Adapter `getAnalysis` 的最佳走法、主變例 score／depth／pv；兩次搜尋均從同一初始 FEN 加完整歷史開始，第一個 root 取現有合法規則，第二個只准實際走法。每次最多 500 ms，若實際走法即最佳則重用結果。
`game.js` 只以另存的棋盤序列顯示過去局面，不改動真實 board／moveSequence；分析與 AI 共用同一 Worker。取消、退出、頁面離開、新局及悔棋分支均隔離或清除舊結果。
評級數值門檻、將殺／棄子條件見 README；沒有移用西洋棋勝率校準或假裝 Pikafish 原生輸出「妙手」。

## 官方網頁雲庫

依使用者確認，開局另接入官方網頁指南使用的 [chessdb.cn](https://www.pikafish.com/wiki/guide/web-version.html#查询云库)，
API 行為依 [雲庫公開文件](https://www.chessdb.cn/cloudbook_api.html)。這是棋盤程式外接的服務，
不是 Pikafish WASM／NNUE 內建資料；不能把資料庫走法宣稱為 Pikafish 自己的搜尋結果。

本站前 20 ply 使用 HTTPS `querybest`、`learn=0`，不帶 credentials；最多等待 2.5 秒。
只接受 `move:` 回應，並經既有合法走法與長將／長捉過濾。`search:`、未命中、無效回應或失敗
均回退本機搜尋；沒有呼叫 `queue`／`store` 或自動學習。取消對局會中止查詢，世代檢查隔離舊回應。

本站離線包優先於雲庫查詢；包外查得走法按局面與行棋方保存在 localStorage 的 `chinese-chess-cdb-v1:` key；
離線可直接使用本站包及曾查過的局面，其他局面仍由本機引擎思考。網站資料被清除時需連線補回。
沒有下載整份約 500 GB 雲庫快照；本站只附有限開局分支，雲庫服務內容與可用性由 chessdb.cn 管理。
雲庫沒有固定發布版本；本站固定的是查詢協定與快取格式，原 WASM／NNUE 版本及 hash 不變。

## 本站開局離線包（2026-10-08）

- `books/chessdb-opening.js`：31,004 個局面，2,350,733 bytes；SHA-256
  `e7096c78188101372fe3dec8f2fabe78b2f945771b55c190729badb3f084f8f2`。
- 取自 1,200 次 `querypv&learn=0&stable=1&json=1` 的雲庫回應，僅保存現有棋盤規則接受的主變前綴，
  每條限制在前 20 ply。探索早期合法分支，再補入左右鏡像；沒有使用原 handcrafted 開局表。
- 開局樹是有限分支抽樣，沒有官方人氣統計；不能聲稱每種首步之後 10 回合都一定命中。
- 原始回應壓縮保存於 `books/chessdb-responses.jsonl.gz`，來源、抓取時間及全部 hash 見 `books/provenance.json`。
- 雲庫作者的 README 說明資料庫快照除另有註明外按公有領域發布。來源版
  `ab6c33133dba40e46a6f9828696c959fb4940221` 的 README／Unlicense 原文附於 `books/`；
  這項資料聲明與 Pikafish／NNUE 的獨立授權分開記錄。
- `scripts/download-opening-book.cjs` 是維護者工具，最多兩個並行查詢、1,200 次／3 MB 上限，
  不呼叫 queue/store 或學習。更新需重跑全走法來源／合法性測試及快取清單產生。
  `CHESSDB_ADDRESS` 僅供維護時 DNS 故障的位址替代，HTTPS 主機名稱與憑證驗證保留；
  玩家網站沒有硬編 IP 或 DNS 設定。

首次快取包含開局資料及來源／授權，全部靜態資源合計 21,770,579 bytes。
引擎與 NNUE 二進位檔未修改；正常對弈仍重用既有 Worker。
