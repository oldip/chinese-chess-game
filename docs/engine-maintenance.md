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

難度預設每步最多 500／1500／4000 ms，Skill 0／10／20；自訂時間 0.5–30 秒，Skill 20。沒有經人類棋力校準，初級也可能很強。Hash 由程式自動選 8 或 16 MB，單線程；初始 WASM 記憶體 256 MiB。

HTML 可以因本機防護軟體加入標記而改變大小，下載成功後直接快取；JS、WASM、NNUE 等其他資源仍依版本清單驗證長度和 SHA-256。首次全部快取成功及接管頁面後才準備 AI，正常走棋重用同一 Worker／NNUE。已啟用快取遺失時，恢復網絡會自動補回缺少的檔案。
