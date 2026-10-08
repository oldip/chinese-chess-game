# 驗證紀錄（2026-10-08）

## 已執行

| 檢查 | 結果／邊界 |
| --- | --- |
| `npm test` | 五組測試通過：FEN/90 格座標往返、UCI handshake/settings/Worker reuse/cancel、原難度及悔棋、原長將/長捉、合法走法及將死/困斃、頁面離開清理 |
| `npm run verify:engine` | loader/WASM/NNUE/source/LICENSE/AUTHORS hash 全部匹配；WASM 無 shared-memory／pthread import，loader 無 SharedArrayBuffer |
| 官方 NNUE 比對 | ousc 的 18,070,595-byte `.data` 與官方 2023-03-05 發布包 `.nnue` SHA-256 完全相同 |
| Chrome 154.0.8037.98／Windows | 真實 WASM UCI、NNUE 啟用輸出、初始合法走法、紅黑交替 8 ply（4 回合）通過 |
| Edge 154.0.4258.62／Windows | 同樣真實 WASM 與 8 ply 通過 |
| 既有 UI 對弈 | 以實際棋盤點擊完成玩家／AI 回合，悔棋回到原局面；玩家改執黑後由 AI 走紅棋；通過 |
| 取消污染 | AI 正在搜尋時 reset/setup/mode 切換，等待舊搜尋時長後新棋盤走步仍為 0；通過 |
| UI 可回應 | AI 思考期間頁面 10ms interval，在 150ms 內仍有至少 5 次執行；通過，不是 FPS/性能基準 |
| 頁面生命週期 | 模擬 persisted pagehide/pageshow，取消 Worker 後恢復 AI 回合；通過。未單獨證明瀏覽器實際採用了 BFCache |
| Pages 形式子路徑 | `/chinese-chess-game/` 本機 HTTPS 下 Worker、WASM、NNUE、icons、manifest、SW 全部可取得；未發布至公開 github.io |
| 完全離線 | Playwright `context.setOffline(true)` 後重新載入頁面，重新建立 Worker／載入 NNUE並完成玩家/AI 回合；Chrome/Edge 通過 |
| 快取遺失／修復 | 離線刪除 NNUE cache → reload 撤銷 ready → 初始化明確失敗 → 恢復網絡按修復 → 完整快取恢復；兩瀏覽器通過 |
| 無 AI server | 上述正常流程追蹤 browser context HTTP/S requests，沒有本站來源以外的請求；pageerror 清單為空 |
| 部署 build | 20 個靜態資源；约 19.34 MB；含原始碼與授權；無舊 handcrafted Worker/engine-core runtime 依賴 |
| Git byte 保護 | `.gitattributes` 對 engine/* 禁止換行轉換，避免 Windows checkout 使 vendor SHA-256 改變 |

完整 browser 程式在 `tests/browser.cjs`；本次 JSON UCI 輸出及截圖在未追蹤的 `test-results/`。
執行器的 HTTP 回應會被本機 AdGuard 注入腳本，所以實際離線驗收改用 **本機自簽 HTTPS**，
只對 loopback 測試憑證啟用 bypass。HTTP 注入情況曾直接觀察到 Service Worker hash/size
驗證拒絕安裝，畫面保持 `data-ready=false`；不將其誤記為網站完整離線成功。

## 已修正的重現問題

- 初始化被取消後立即初始化新 Worker，舊 initializer catch 原先會終止新 Worker。
  新增測試先失敗，再加入 ownership／generation guard；通過。
- ready Promise 已完成但 await 尚未繼續時取消，舊 initializer 原先可以操作新 Worker。
  新增測試先失敗，再在每次 init await 後檢查 Worker owner；通過。
- 思考時離開／還原頁面，原先保留 aiThinking 鎖且沒有 resume。
  lifecycle 重現測試先失敗，再加入 pagehide 清理／persisted pageshow 恢復；通過。

## 尚未實測／限制

- 公開 GitHub Pages 部署、repository Actions 權限、Pages 設定及公開 URL 資源比對。
- 標準 Firefox 與 Android Chrome 真機、PWA 系統安裝操作、低記憶體裝置效能。
- 多版本公開部署的等待更新流程未做端到端部署測試；程式使用完整版本隔離，沒有 skipWaiting。
- 發布者的精確 Emscripten 版本未公開；未自行重編譯，不聲稱 byte-identical rebuild。
- 舊引擎原有四步循環長將/長捉規則不是完整賽事裁判；沒有聲稱覆蓋所有重複局面。
- 單線程原發布構建初始 WASM 記憶體 256 MiB。正在搜尋時取消需 terminate，下一次重載 NNUE。

## 檔案變更

| 檔案 | 用途 |
| --- | --- |
| game.js | 接入 Adapter、完整歷史／root filtering、世代取消、錯誤重試、頁面生命週期；保留規則/UI |
| index.html、styles.css | 載入新 Adapter；Hash/depth、載入／离線状态与重試／修復按鈕 |
| pikafish-adapter.js、pikafish-worker.js | FEN/UCI、握手、設定、載入 hash、搜尋、停止、重置與資源清理 |
| engine/* | 固定真實發布檔、官方相同 NNUE、對應 source ZIP、授權／作者／hash／來源紀錄 |
| service-worker.js、pwa.js、precache.json | 完整驗證快取、下載進度、版本／子路徑隔離、更新與資源遺失處理 |
| manifest.webmanifest、icons/* | 可安裝 PWA metadata、本站圖示 |
| scripts/*、package.json、package-lock.json | 靜態 server/build、vendor hash 驗證、依賴／測試入口 |
| .github/workflows/pages.yml | 測試、建置並部署 dist 到 GitHub Pages |
| tests/pikafish.js、rules.js、lifecycle.js、browser.cjs | 新引擎、規則、取消與真實瀏覽器離線驗收 |
| .gitignore、.gitattributes | 排除本機測試工具／产物；維持 vendor bytes |
| README.md、docs/* | 分析、整合設計、部署／授權／更新及驗證紀錄 |
