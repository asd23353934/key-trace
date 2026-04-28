# key-trace CLAUDE.md

> 本檔給 Claude Code 讀，描述本專案的目標、決議與底線。協助開發時優先依本檔規則回應。
> 最後更新：2026-04-28

---

## 參考來源

請同時參考 `~/Desktop/gitlab/hsin-dev-notes/CLAUDE.md` 的全域規則與慣例（語言、回覆風格、版本驗證、筆記更新流程等）。本檔是該全域規則在 key-trace 專案內的延伸與覆蓋。

---

## 專案目標

key-trace 是 WhatPulse 的替代品，記錄使用者：

- 應用程式的 **total time（前景時間）/ active time（前景且有輸入）/ deep work time（連續無切窗的 active 區段）** 三層時間
- 每個應用程式內 **每鍵 × 滑鼠操作的累計次數**
- 並透過時間 / 次數兩個維度產出報表

---

## 差異化定位

對齊 WhatPulse 的痛點，三軸全做：

1. **更精準的「實際專注時間」算法**（active vs deep work 分層 + AI 自動分類 app 類別）
2. **更好看的 dashboard 與報表**（heatmap、週期分析、視覺優先）
3. **任務 / 專案 tagging + 番茄鐘整合**

---

## 隱私底線（**不可動搖**）

鍵鼠 hook 技術上能取得「按了哪個鍵」的內容，但本專案永不存。**這條規則寫進 spec、寫進 README、寫進 code review checklist**：

- **只記每鍵 × 每 app 的累計次數**，不存按鍵時序、不存按鍵序列、不存按鍵內容
- **視窗標題**記錄為使用者選用，**預設 OFF**（部分視窗標題會洩漏私訊內容、檔名、URL）
- **密碼類 app**（密碼管理器、銀行 app、瀏覽器密碼欄位等）走黑名單，自動完全跳過追蹤
- 任何 PR / 變更想加入「按鍵內容 / 時序記錄」要 Claude 主動擋下並回到此決議，需 Hsin 明確點頭才能放行

---

## 架構決議

### 平台

Windows + macOS。Linux 暫不做。macOS 第一次啟動要引導使用者授權「輔助使用 / 螢幕錄製」權限。

### 技術棧（intent，實際版本以 `package.json` 為準）

- **Shell**：Electron + electron-vite scaffold
- **Renderer**：React 19 + TypeScript strict + Tailwind v4
- **UI 元件**：shadcn/ui 為主、Tremor 補 dashboard 元件、Recharts 為圖表底層
- **狀態**：Zustand（renderer 全域）+ TanStack Query v4（IPC 資料層）
- **設定持久化**：electron-store
- **IPC**：electron-trpc + tRPC v10 + TanStack Query v4（暫時鎖在 v10 / v4，因 electron-trpc 0.7.1 內部仍用 tRPC v10 procedure 結構，未支援 v11；待 electron-trpc 升 v11 後一起升）
- **資料庫**：better-sqlite3（不加密）
- **鍵鼠 hook**：uiohook-napi（macOS 需 Accessibility 權限，prebuilt binary 支援 Win + Node 24）
- **視窗偵測**：get-windows（前身 active-win）
- **測試**：Vitest + @testing-library/react + Playwright（Electron mode）
- **打包 / 更新**：electron-builder + electron-updater（v1 期間先不啟用）

### 進程切分

從第一天就拆三進程，避免後拆痛：

- **main**：原生 hook（uiohook-napi）、視窗偵測（get-windows）、tray、自動啟動、單一實例鎖、全域熱鍵
- **utility process**：SQLite 寫入、每分鐘 bucket 落盤、每日 rollup 聚合、每日 markdown 報告生成、Claude API 呼叫
- **renderer**：UI、報表、設定

main 與 utility 之間用 MessagePort，renderer 與 main 之間用 electron-trpc。

### 取樣與聚合

- **視窗偵測**：每 5 秒輪詢（人類切窗不會比 5 秒快）
- **Idle 閾值**：60 秒（UI 可設定，30 / 60 / 120 / 300）
- **資料粒度**：分鐘級 bucket（每分鐘一筆 `events` row：app + 每鍵計數 + 滑鼠距離 + 點擊數），每日 rollup 出 `daily_app_stats` 給報表用
- **Active time 定義**：app 在前景 **且** 過去 60 秒內有鍵鼠輸入
- **Deep work time 定義**：連續 ≥ N 分鐘的 active time 且不切窗（N 可設定，預設 25 分鐘對齊番茄鐘）

### 系統整合

六項全做：tray icon、開機自動啟動（預設關，UI 可開）、桌面通知、全域熱鍵、單一實例鎖、背景模式（關視窗縮 tray 不退出）。

### 雲同步

不做帳號、不做雲同步。UI 提供「匯出 DB / 匯入 DB」按鈕，使用者自選丟雲端硬碟。

---

## v1 範圍（MVP）

差異化功能 v1 只做四項：

- **番茄鐘 + 專注 streak**
- **GitHub 風 heatmap + 一日週期分析**
- **每日 / 每週自動產生 markdown 報告**（可貼到 dev-notes session-log）
- **Claude API 寫每日總結**（搭 markdown 報告，Hsin 已熟 Anthropic SDK）

## v2 之後

AI 自動分類 app（生產 / 溝通 / 娛樂 / 系統）、專案 tagging（手動 + 規則自動）、健康提醒、本機 HTTP API、Linear / GitHub PR 整合、E2EE 雲同步。**v1 階段不要主動展開實作 v2 項目。**

---

## 散布策略

- **第一階段**（v1 開發中）：只跑 `npm run dev` 自用，不打包
- **核心 MVP 完成後**：啟用 electron-builder 打包 .exe / .dmg、electron-updater 接 GitHub Releases、CI 自動 release。Windows 暫不買簽章證書（接受 SmartScreen 警告），macOS 視需求再決定是否買 Apple Developer

---

## Spectra SDD 導入時機

不在第一天 init `openspec/`。理由：前期大量技術 spike（uiohook-napi 驗證、Playwright Electron mode 驗證、三進程 IPC 驗證），spec 在這階段會被頻繁 ingest，開銷大於收益。

**導入時機**：walking skeleton（Electron + hook + SQLite + 最小 UI 跑通）完成後，進入「功能堆疊」階段（開始堆 dashboard / 番茄鐘等）時 init `openspec/`。屆時前面已穩定的部分一次寫成 base spec。

---

## 本專案版本（以 `package.json` 為準）

_尚未建立 `package.json`。完成 scaffold 後在此填入實際版本號，所有版本走 dev-notes 全域規則第 7 條的版本驗證三步驟。_

---

## 與 dev-notes 的差異 / 限制

- 本專案是 **React 生態**，dev-notes 目前主要覆蓋 Angular / Next.js / Python，**尚無對應的 `react/` 慣例檔**。本專案的 React 寫法暫以 `nextjs/conventions.md` 的「React 19 共通部分」為基準（不採用 App Router / Server Components 那塊）
- 本專案是 **Electron 桌面應用**，main / preload / renderer 三邊的 boundary 與一般 web 專案差距大，dev-notes 的 web 慣例不全部適用
- 本專案有 **原生 hook** 與 **跨進程資料流**，這兩個主題踩坑優先寫進本 repo 的 errors（待建立）

---

## 本專案專屬慣例

- 新增任何 hook 事件處理 code → 審視「有沒有誤入按鍵內容記錄」，是 → 拒絕
- 新增任何 SQLite 欄位 → 審視「會不會落盤敏感資料」，是 → 改用聚合或拒絕
- 任何「視窗標題」相關功能 → 預設 OFF，UI 顯示明確警告才開
- 任何「黑名單 app」清單變更 → 主動提示 Hsin 確認
- 三進程 IPC 一律走 electron-trpc，不要混用裸 `ipcMain.handle`（除非有明確效能理由）

---

## 未來品質 / DX 待辦（已 review、暫不做）

開始堆功能或第一次寫測試時連帶處理：

- **README**：給人類看的「如何 npm run dev / macOS 權限引導 / 隱私聲明摘要」。CLAUDE.md 第 36 行的隱私底線目前只在 spec + code 結構強制，使用者面要在 README 補一份摘要
- **`tsconfig.config.json` 拆分**：目前 `tsconfig.node.json` 同時涵蓋 `electron.vite.config.ts`（Node API）與 `src/main` / `src/preload`（Electron runtime），日後加 Electron-only 型別時會打架，拆 config 出來
- **createTracker hooks DI**：tracker 已支援注入 `storage` 做測試（A2 落地時順手做了），但 hooks layer 仍是直接 import `./hooks`。第一次寫 unit test 時加 `hooks` 注入參數，或於 vitest setup 用 `vi.mock('uiohook-napi')`，二擇一
- **utility entry 拆 pure factory + bootstrap**：`src/utility/index.ts` 目前是 side-effect script（module load 就開 DB、listen parentPort），無法 unit test。重構成 `createUtilityHandler({ db, port })` + 一個 thin bootstrap 檔，讓核心邏輯可注入 mock DB 測試
- **`.vscode/extensions.json`**：寫 Tailwind / TS / ESLint / Prettier 推薦延伸（目前 `.gitignore` 已預留例外但檔案未生）
- **Stats payload 體積**：renderer 每 1 秒 IPC 拉完整 Stats，數字大 / 加 per-app-per-keycode map 後浪費。改 main 端 dirty-flag 或拉長到 2~3 秒
- **render churn**：dashboard 開始放 chart 時，`<Card>` 加 `React.memo` + `getStats` 加結構共享判斷

## 未來安全檢核點（已 review、暫不實作）

每加新功能前回看這份清單，命中時要連帶處理：

- **tRPC input schema 規範**：當 router 開始有 mutation 或帶 input 的 query，每個 `.input(...)` 必填 `z.object(...).strict()`（或 valibot 等價），禁 `z.any()` / `z.unknown()`。建立 `src/main/schemas/` 集中放
- **Native 模組供應鏈**：uiohook-napi 拉進 npmlog/gauge/old-glob（已棄用、6 high CVE），目前僅 dev/build 載入。長線評估 `package.json` 加 `overrides` 強制升 glob/npmlog，或追蹤 uiohook-napi 上游是否升級
- **Deeplink / argv**：v2 若加 `keytrace://` deeplink，`second-instance` 的 argv 必過 schema 驗證（CVE-2018-1000136 系列）
- **HTTP-layer CSP**：v1 release 前在 `session.defaultSession.webRequest.onHeadersReceived` 補一份 HTTP header CSP（meta CSP 在 inline script 已執行後才生效，雙重防線）
- **Claude API 整合（v2）**：API key 走 `safeStorage.encryptString` 落 electron-store；禁止 log 整個 request body（會把 app 名稱寄出去）
- **本機 HTTP API（v2）**：必綁 `127.0.0.1` + token，禁開 `host-rules` 命令列開關
- **匯出 / 匯入 DB**：路徑必過 `dialog.showSaveDialog`/`showOpenDialog`，禁 renderer 直接傳路徑字串
- **E2EE 雲同步（v2）**：金鑰用 `safeStorage`，DB 加密用 sqlite-cipher 或自家 layer

## Git 操作

依 dev-notes 全域規則（不自動 commit、commit 後問是否 push）。本 repo commit scope 用 `main` / `utility` / `renderer` / `db` / `hook` / `ui` / `docs` / `build` / `security` 區分。
