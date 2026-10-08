# 驗證紀錄（2026-10-09）

## 結束後復盤

- 十六組單元／流程測試通過。新增七類走法、較慢將殺不誤標錯招、普通換子不標妙手、完整歷史與同起點強制實際走法比較、取消、僅結束後入口及錯誤提示保留測試。
- `tests/review-browser.cjs` 在 Windows Chrome／Edge 完成首次快取後斷網重載，使用真實 WASM 分析全部棋譜，逐步點選、停止／續跑、紅黑玩家視角、棋盤只讀與重新開始取消舊結果均通過。
- 四步開局測例以合法走棋加結束旗標隔離復盤 UI；另外注入合法「兵五進一」將死残局，用真實 `finalizeMove` 結束對局，再完成本機將殺復盤，沒有以結束旗標替代該項驗證。
- `4c0db81` 的 GitHub Pages 公開版本 `pikafish-a453211f2ca5f819` 與提交一致；正式 HTTPS Chrome／Edge 完整復盤及原有 browser suite 均通過。
- 最後的將殺說明修正 `0b86f13` 公開版本 `pikafish-d7f3f3fa97b0f86e` 與提交一致；16 組測試及正式 HTTPS Chrome／Edge 離線復盤再次通過。將殺不換算虛構分數損失，延後已存在的將殺不視為新錯招。
- 原有 `tests/browser.cjs` Chrome／Edge 完整对弈、8 ply、悔棋／取消、離線快取遺失／恢復仍通過。復盤新腳本 pageerror／非預期 external 為空。
- 所有復盤執行資源已納入 27 個版本化快取項目；没有遠端分析或額外模型下載。
- 未驗證與 Xiangqi.com 評級一致、專家棋評準確度、整盤長棋譜性能或手機真機。妙手／漏著為保守啟發式，短搜尋可能漏掉深層戰術；復盤只保留在目前頁面的本局。

## 玩家視角評分及難度調整

- 十五組 `npm test` 通過；新增真實程式的 UCI 主變例評分解析、界限值排除、獨立全強度評分、紅黑正負視角／固定字色、舊結果取消及初級搜尋設定還原測試。
- Windows Chrome 154.0.8037.98／Edge 154.0.4258.62 本機 HTTP 子路徑完整 browser suite 通過：紅黑玩家的目前局面評分、悔棋後重新分析、中級 10／高級 5 次限制、高級 2 秒及完成快取隱藏提示。
- 同次驗證真實 WASM／NNUE／8 ply、多回合 UI、取消／不阻塞、從首次快取後完全離線重開、快取遺失及自動補回；pageerror／非預期外部請求為空。
- review 重現並修正執黑玩家悔掉 AI 首步後沒有重排程、保留頁面返回時評分未重新開始；新增 VM 失敗測試後修正通過，實際瀏覽器亦覆蓋這兩條路徑。
- `83fdb89` 正式 GitHub Pages 的公開版本 `pikafish-4217895f6e299eff` 與提交清單一致；Chrome／Edge HTTPS 完整 browser suite 亦通過上述新功能及離線回歸，pageerror／非預期外部請求為空。
- 下方 2026-10-08 紀錄保留先前驗收的版本與環境邊界；短評分不是棋力或勝率校準。


## 已執行

| 檢查 | 結果／邊界 |
| --- | --- |
| `npm test` | 十三組測試通過：本站離線包／完整資料合法性與來源／匯出限制、雲庫協定／離線走法快取、開局命中／取消／合法過濾／本機回退、簡潔設定／自訂時間、快取完整性與版本修復、等待更新隔離、FEN/90 格座標往返與 UCI/Worker、难度及悔棋、長將/長捉、將死/困斃、頁面離開清理 |
| `npm run verify:engine` | loader/WASM/NNUE/source/LICENSE/AUTHORS hash 全部匹配；WASM 無 shared-memory／pthread import，loader 無 SharedArrayBuffer |
| 官方 NNUE 比對 | ousc 的 18,070,595-byte `.data` 與官方 2023-03-05 發布包 `.nnue` SHA-256 完全相同 |
| Chrome 154.0.8037.98／Windows | 真實 WASM UCI、NNUE 啟用輸出、初始合法走法、紅黑交替 8 ply（4 回合）通過 |
| Edge 154.0.4258.62／Windows | 同樣真實 WASM 與 8 ply 通過 |
| 既有 UI 對弈 | 以實際棋盤點擊完成玩家／AI 回合，悔棋回到原局面；玩家改執黑後由 AI 走紅棋；通過 |
| 取消污染 | AI 正在搜尋時 reset/setup/mode 切換，等待舊搜尋時長後新棋盤走步仍為 0；通過 |
| UI 可回應 | AI 思考期間頁面 10ms interval，在 150ms 內仍有至少 5 次執行；通過，不是 FPS/性能基準 |
| 頁面生命週期 | 模擬 persisted pagehide/pageshow，取消 Worker 後恢復 AI 回合；通過。未單獨證明瀏覽器實際採用了 BFCache |
| Pages 形式子路徑 | `/chinese-chess-game/` 本機 HTTPS 下 Worker、WASM、NNUE、icons、manifest、SW 全部可取得 |
| 公開 GitHub Pages | `e50b854` 發布狀態 built，公開 precache 版本 `pikafish-afd50655a5c24289` 與提交一致；https://oldip.github.io/chinese-chess-game/ 的 Chrome／Edge 完整 browser suite 通過，含官方雲庫紅黑開局、自動準備、對弈、離線重開及自動補回 NNUE |
| 完全離線 | Playwright `context.setOffline(true)` 後重新載入頁面，重新建立 Worker／載入 NNUE並完成玩家/AI 回合；Chrome/Edge 通過 |
| 首次準備／簡潔設定 | 不點任何按鈕即可完成全資源快取及真實引擎初始化；準備完成後隱藏載入提示；初／中／高級與自訂秒數控制通過 |
| 快取遺失／修復 | 離線刪除 NNUE cache → reload 撤銷 ready → 初始化失敗 → 恢復網絡自動補回 → 再斷網 reload 並完成自訂時間對弈；兩瀏覽器通過 |
| 開局雲庫網絡邊界 | 僅額外允許使用者選定的 HTTPS chessdb.cn `querybest&learn=0`；没有提交遠端搜尋／學習。其他非預期請求仍使測試失敗；本機防護注入獨立記錄，external／pageerror 清單為空 |
| 靜態發布檔 | 26 個快取資源；約 21.77 MB；根目錄可直接發布，含原始碼與授權；無舊 handcrafted Worker/engine-core runtime 依賴 |
| Git byte 保護 | `.gitattributes` 對 engine/* 禁止換行轉換，避免 Windows checkout 使 vendor SHA-256 改變 |

完整 browser 程式在 `tests/browser.cjs`；本次 JSON UCI 輸出及截圖在未追蹤的 `test-results/`。
本機 AdGuard 會修改 HTTP HTML，已重現使用者的長度不符錯誤，修正後實際 HTTP Chrome
安裝完整快取通過。另以可重現的快取測試驗證修改過的 HTML 可以離線取回；JS/WASM/NNUE
完整性檢查仍保留。完整 Chrome／Edge 對弈測試使用本機自簽 HTTPS，憑證 bypass 僅限 loopback。
Edge 曾有一次首次 HTTPS 導航逾時，獨立重跑完整流程通過。
公開 HTTPS 也被本機 Kaspersky／AdGuard 注入腳本，初次網絡斷言因此失敗；
確認其來源後以 `TEST_ALLOW_PROTECTION_INJECTION=1` 另記錄三個實際觀察到的主機
`local.adguard.org`、`gc.kis.v2.scr.kaspersky-labs.com`、`me.kis.v2.scr.kaspersky-labs.com`。
除了明確允許的雲庫查詢，其他外部 HTTP/S 請求仍直接使測試失敗；未停用防護軟體或移除頁面注入腳本。
Chrome／Edge 在這個實際環境下均完成公開站離線對弈及恢復測試。

## 本站開局包驗證

- 31,004 個局面、2,350,733 bytes；所有走法逐條通過既有合法規則及保存雲庫回應的來源比對。
- SHA-256 與清單一致；開局包、原始回應與上游授權均納入 26 個快取資源。
- 單元測試確認未查過局面不需網絡、非法走法仍被過濾、取消後不返回舊走法，包外保留雲庫回退。
- Chrome 本機 HTTPS、Edge 本機 HTTP 完整 browser suite 通過。首次快取後未曾下棋即清除 localStorage、斷網 reload，紅黑 AI 自訂 30 秒均約 0.39–0.63 秒走棋，雲庫請求為 0。
- Edge 本機自簽 HTTPS 多次導航逾時；單獨診斷曾成功但不穩定，改以 localhost HTTP 通過。導航驗收改等棋盤 DOM 建立及完整快取／引擎 ready，不以隐藏棋盤可見作為條件。
- 本機系統 DNS 解析故障，維護下載使用 HTTPS 查得的來源位址及正常 TLS 驗證；公開站测试亦只在測試行程使用同樣已查證的 DNS 位址，保留正常 HTTPS 憑證驗證，沒有修改系統 DNS 或玩家網站。

- `6bde534` 公開版本 `pikafish-beca8d5bec63b16d` 與根目錄清單一致。正式 GitHub Pages HTTPS 的 Chrome／Edge 完整 browser suite 均通過，含首次未曾對弈就斷網重開、紅黑自訂 30 秒開局直接走棋、本機 WASM 8 ply／對弈／悔棋／取消／頁面生命週期／快取遺失與自動恢復。
- 公開站開局階段雲庫請求為 0，全部使用已快取的本站開局包；pageerror／非預期 external 清單均為空。Edge 正式 HTTPS 已通過，因此本機自簽 HTTPS 的阻塞不影響此次公開站驗收。

## 先前聯網開局整合驗證

Chrome／Edge 均使用真正的 chessdb.cn 回應，紅、黑 AI 在自訂 30 秒下分別測試命中走法，
並斷網重新載入後使用持久快取走出相同局面。引擎 getBestMove 呼叫計數為 0，證明沒有等待 30 秒搜尋。
本機 HTTPS 實測連線開局約 0.87–1.41 秒，離線約 0.33–0.36 秒（含走棋動畫；不是性能保證）。
公開 GitHub Pages 的 Chrome／Edge 同樣通過完整測試：聯網命中約 0.86–1.43 秒，
斷網重新載入後命中約 0.32–0.35 秒；兩者 pageerror／非預期 external 清單均為空。
其餘完整瀏覽器回歸強制雲庫未命中，驗證真正本機 WASM 搜尋、多回合與離線回退。
雲庫網絡失敗／逾時、錯誤座標、規則排除走法、取消舊查詢均有自動測試。

## 已修正的重現問題

- 初始化被取消後立即初始化新 Worker，舊 initializer catch 原先會終止新 Worker。
  新增測試先失敗，再加入 ownership／generation guard；通過。
- ready Promise 已完成但 await 尚未繼續時取消，舊 initializer 原先可以操作新 Worker。
  新增測試先失敗，再在每次 init await 後檢查 Worker owner；通過。
- 思考時離開／還原頁面，原先保留 aiThinking 鎖且沒有 resume。
  lifecycle 重現測試先失敗，再加入 pagehide 清理／persisted pageshow 恢復；通過。
- HTML 被防護軟體加入內容時，原本會中斷全部離線下載；重現後修正，HTTP 實測通過。
- 新版等待啟用時的下載進度原本可能阻止舊版補回快取，使 AI 等待不結束。
  現在依控制中 Worker 隔離訊息，回歸測試通過。
- 線上已有新版時，舊頁面按自己的清單補回未改變的 NNUE；不把新 HTML／JS 放入舊版快取。
  下載中斷、修改 JS、跨版本修復與並行修復去重的測試通過。

## 尚未實測／限制

- GitHub API 已確認 Pages 從 `fix/chinese-chess-playable` 根目錄發布，無需 Actions 建置；本機與公開網站已驗收。
- 開局包為有限分支，不保證每種開局都涵蓋；離線包外未查過的局面會使用完整所選本機思考時間。
- 雲庫服務的可用性及包外涵蓋率不保證。
- 標準 Firefox 與 Android Chrome 真機、PWA 系統安裝操作、低記憶體裝置效能。
- 多版本公開部署的等待更新流程未做端到端部署測試；程式使用完整版本隔離，沒有 skipWaiting。
- 若線上已有新版且被清除的舊版資源已改變，不能混用版本；關閉本網站全部分頁後再開啟會啟用下載好的新版。
- 發布者的精確 Emscripten 版本未公開；未自行重編譯，不聲稱 byte-identical rebuild。
- 舊引擎原有四步循環長將/長捉規則不是完整賽事裁判；沒有聲稱覆蓋所有重複局面。
- 單線程原發布構建初始 WASM 記憶體 256 MiB。正在搜尋時取消需 terminate，下一次重載 NNUE。

## 檔案變更

| 檔案 | 用途 |
| --- | --- |
| game.js | 接入 Adapter、完整歷史／root filtering、世代取消、錯誤重試、頁面生命週期；保留規則/UI |
| index.html、styles.css | 保留原樣式；難度與自訂秒數、簡潔下載／離線狀態，移除技術設定與手動維護按鈕 |
| books/*、scripts/download-opening-book.cjs、tests/bundled-opening.js、tests/opening-download.js、tests/opening-data.js | 本站離線開局包、原始回應／授權／hash、合法性與來源驗證 |
| cloud-opening-book.js、tests/cloud-opening-book.js、tests/opening-flow.js | 官方網頁雲庫查詢、持久回應快取、取消／合法過濾／本機回退測試 |
| pikafish-adapter.js、pikafish-worker.js | FEN/UCI、握手、設定、載入 hash、搜尋、停止、重置與資源清理 |
| engine/* | 固定真實發布檔、官方相同 NNUE、對應 source ZIP、授權／作者／hash／來源紀錄 |
| service-worker.js、pwa.js、precache.json | 完整驗證快取、下載進度、版本／子路徑隔離、更新與資源遺失處理 |
| manifest.webmanifest、icons/* | 可安裝 PWA metadata、本站圖示 |
| scripts/*、package.json、package-lock.json | 靜態 server/build、vendor hash 驗證、依賴／測試入口 |
| .nojekyll | 根目錄直接作為 GitHub Pages 靜態網站；移除本次先前新增但不需要的 Actions 建置流程 |
| tests/simple-ui.js、cache.js、pwa.js、pikafish.js、rules.js、lifecycle.js、browser.cjs | 設定、快取／更新、引擎、規則、取消與真實瀏覽器離線驗收 |
| .gitignore、.gitattributes | 排除本機測試工具／产物；維持 vendor bytes |
| README.md、docs/* | 分析、整合設計、部署／授權／更新及驗證紀錄 |
