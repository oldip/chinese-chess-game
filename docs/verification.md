# 驗證紀錄（2026-10-08）

## 已執行

| 檢查 | 結果／邊界 |
| --- | --- |
| `npm test` | 八組測試通過：簡潔設定／自訂時間、快取完整性與版本修復、等待更新隔離、FEN/90 格座標往返與 UCI/Worker、难度及悔棋、長將/長捉、將死/困斃、頁面離開清理 |
| `npm run verify:engine` | loader/WASM/NNUE/source/LICENSE/AUTHORS hash 全部匹配；WASM 無 shared-memory／pthread import，loader 無 SharedArrayBuffer |
| 官方 NNUE 比對 | ousc 的 18,070,595-byte `.data` 與官方 2023-03-05 發布包 `.nnue` SHA-256 完全相同 |
| Chrome 154.0.8037.98／Windows | 真實 WASM UCI、NNUE 啟用輸出、初始合法走法、紅黑交替 8 ply（4 回合）通過 |
| Edge 154.0.4258.62／Windows | 同樣真實 WASM 與 8 ply 通過 |
| 既有 UI 對弈 | 以實際棋盤點擊完成玩家／AI 回合，悔棋回到原局面；玩家改執黑後由 AI 走紅棋；通過 |
| 取消污染 | AI 正在搜尋時 reset/setup/mode 切換，等待舊搜尋時長後新棋盤走步仍為 0；通過 |
| UI 可回應 | AI 思考期間頁面 10ms interval，在 150ms 內仍有至少 5 次執行；通過，不是 FPS/性能基準 |
| 頁面生命週期 | 模擬 persisted pagehide/pageshow，取消 Worker 後恢復 AI 回合；通過。未單獨證明瀏覽器實際採用了 BFCache |
| Pages 形式子路徑 | `/chinese-chess-game/` 本機 HTTPS 下 Worker、WASM、NNUE、icons、manifest、SW 全部可取得 |
| 公開 GitHub Pages | `d3ad1b7` 發布狀態 built，公開 precache 版本與提交一致；https://oldip.github.io/chinese-chess-game/ 的 Chrome／Edge 完整 browser suite 通過，含自動準備、對弈、離線重開及自動補回 NNUE |
| 完全離線 | Playwright `context.setOffline(true)` 後重新載入頁面，重新建立 Worker／載入 NNUE並完成玩家/AI 回合；Chrome/Edge 通過 |
| 首次準備／簡潔設定 | 不點任何按鈕即可完成全資源快取及真實引擎初始化；準備完成後隱藏載入提示；初／中／高級與自訂秒數控制通過 |
| 快取遺失／修復 | 離線刪除 NNUE cache → reload 撤銷 ready → 初始化失敗 → 恢復網絡自動補回 → 再斷網 reload 並完成自訂時間對弈；兩瀏覽器通過 |
| 無 AI server | 本機 HTTPS 正常流程沒有本站來源以外的請求。公開網站測試另記錄本機防護軟體注入請求，網站本身 external 與 pageerror 清單為空 |
| 靜態發布檔 | 20 個快取資源；約 19.34 MB；根目錄可直接發布，含原始碼與授權；無舊 handcrafted Worker/engine-core runtime 依賴 |
| Git byte 保護 | `.gitattributes` 對 engine/* 禁止換行轉換，避免 Windows checkout 使 vendor SHA-256 改變 |

完整 browser 程式在 `tests/browser.cjs`；本次 JSON UCI 輸出及截圖在未追蹤的 `test-results/`。
本機 AdGuard 會修改 HTTP HTML，已重現使用者的長度不符錯誤，修正後實際 HTTP Chrome
安裝完整快取通過。另以可重現的快取測試驗證修改過的 HTML 可以離線取回；JS/WASM/NNUE
完整性檢查仍保留。完整 Chrome／Edge 對弈測試使用本機自簽 HTTPS，憑證 bypass 僅限 loopback。
Edge 曾有一次首次 HTTPS 導航逾時，獨立重跑完整流程通過。
公開 HTTPS 也被本機 Kaspersky／AdGuard 注入腳本，初次網絡斷言因此失敗；
確認其來源後以 `TEST_ALLOW_PROTECTION_INJECTION=1` 另記錄三個實際觀察到的主機
`local.adguard.org`、`gc.kis.v2.scr.kaspersky-labs.com`、`me.kis.v2.scr.kaspersky-labs.com`。
其他外部 HTTP/S 請求仍直接使測試失敗；未停用防護軟體或移除頁面注入腳本。
Chrome／Edge 在這個實際環境下均完成公開站離線對弈及恢復測試。

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
| pikafish-adapter.js、pikafish-worker.js | FEN/UCI、握手、設定、載入 hash、搜尋、停止、重置與資源清理 |
| engine/* | 固定真實發布檔、官方相同 NNUE、對應 source ZIP、授權／作者／hash／來源紀錄 |
| service-worker.js、pwa.js、precache.json | 完整驗證快取、下載進度、版本／子路徑隔離、更新與資源遺失處理 |
| manifest.webmanifest、icons/* | 可安裝 PWA metadata、本站圖示 |
| scripts/*、package.json、package-lock.json | 靜態 server/build、vendor hash 驗證、依賴／測試入口 |
| .nojekyll | 根目錄直接作為 GitHub Pages 靜態網站；移除本次先前新增但不需要的 Actions 建置流程 |
| tests/simple-ui.js、cache.js、pwa.js、pikafish.js、rules.js、lifecycle.js、browser.cjs | 設定、快取／更新、引擎、規則、取消與真實瀏覽器離線驗收 |
| .gitignore、.gitattributes | 排除本機測試工具／产物；維持 vendor bytes |
| README.md、docs/* | 分析、整合設計、部署／授權／更新及驗證紀錄 |
