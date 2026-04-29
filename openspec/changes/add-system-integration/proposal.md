## Why

CLAUDE.md 第 113 行明列「系統整合六項全做」是 v1 範圍，目前已落地的兩項是「單一實例鎖」（walking skeleton）+「桌面通知」（隨 pomodoro 加但被撤回後仍保留 main 進程的 Notification API 能力）。剩下四項——**tray icon、開機自動啟動、背景模式（關視窗縮 tray 不退出）、全域熱鍵**——這次一起做。

放一起不是湊大小，是它們**互相依賴才有意義**：tray 沒有就沒有「縮到哪」這個目的地；背景模式沒有就算開機自啟也是每次彈視窗給人關掉；全域熱鍵沒有就算 app 在 tray 裡也要去點圖示才能叫出。四件事一起做才是「一個正常背景常駐桌面 app 該有的樣子」。

撤掉番茄鐘後 v1 剩下的功能（heatmap / markdown 報告 / Claude 寫總結）都是被動 / 自動發生型。系統整合做完，使用者開機後 app 就在 tray 裡靜悄悄記錄，不打擾、隨時可叫出 dashboard。

## What Changes

- **Tray icon**：常駐工作列（Windows 右下角 / macOS 右上角）。左鍵點 → 顯示 / 隱藏主視窗；右鍵點 → 選單（顯示 dashboard / 開機自啟 ✓ / 全域熱鍵 ✓ / 結束）
- **背景模式**：使用者按主視窗右上 X 不退出 app，改為 hide 視窗。tray 選單「結束」才真正退出（`app.quit()`）。需用 `app.isQuitting` 風格 flag 區分「user clicked X」與「user wants to actually quit」
- **開機自動啟動**：`app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true })` Windows 寫 registry / macOS 加 LaunchAgent；`openAsHidden: true` 配合背景模式 → 開機後 app 在 tray、不彈視窗
- **全域熱鍵**：`globalShortcut.register()` 註冊一個叫出 / 隱藏 dashboard 的快捷鍵。預設 `CommandOrControl+Shift+K`（K = key-trace），可在 tray 選單暫時關閉
- 設定持久化：把刪除過的 `src/main/settings-store.ts` 帶回（CLAUDE.md `electron/conventions.md` 第 71 行「設定 / 偏好持久化」即指明此 pattern），存 `system-integration-settings.json` 於 userData，含 `{ autoLaunchEnabled, globalShortcutEnabled }`
- tRPC API：新 namespace `system`：`getSettings` query / `updateSettings` mutation（給 dashboard 設定 UI 用，本 change 暫不做 UI、由 tray 選單直接觸發）

## Non-Goals

- **不**做設定 UI panel（tray 選單已足夠驅動所有 toggle；dashboard 內的 settings 頁面排到後面 change）
- **不**做 tray icon 的最終設計（用佔位灰底圓形 PNG，視覺打磨在功能完成後一次做）
- **不**做 macOS `dock.hide()`（macOS 慣例是同時保留 dock + tray，使用者期待 dock 能 right-click 退出；不主動隱藏 dock）
- **不**做 Linux 平台（CLAUDE.md Q1=B 已決定 Win + macOS 兩平台）
- **不**做多重熱鍵 / 自訂熱鍵（v2 才考慮）
- **不**做開機延遲啟動或啟動順序設定

## Capabilities

### New Capabilities

- `system-integration`: tray icon、背景模式（關視窗縮 tray）、開機自動啟動、全域熱鍵，以及對應的 settings 持久化與 tray 選單。

### Modified Capabilities

(none — tracker / storage 既有 capability 不動)

## Impact

- Affected specs:
  - 新 capability：`system-integration`
- Affected code:
  - New:
    - src/main/system-integration.ts（tray 建立 + 選單 + auto-launch + 全域熱鍵 + 整合 settings-store）
    - src/main/settings-store.ts（撤回後帶回；改用更通用名 `system-integration-settings.json`）
    - assets/tray-icon.png（16x16 / 32x32 placeholder PNG，後續可換）
  - Modified:
    - src/main/index.ts（whenReady 內 createSystemIntegration；移除 main 的 `window-all-closed → app.quit()` 邏輯，改由 tray 選單「結束」觸發）
    - src/main/router.ts（加 `system` namespace：`getSettings` query / `updateSettings` mutation）
    - electron.vite.config.ts（assets 目錄處理：tray PNG 要在 dev / prod 都讀得到，可用 `?asset` 機制或 publicDir）
- Schema：本 change 無 SQLite 動作
- 隱私底線：本 change 不變動既有底線（auto-launch / 熱鍵設定皆無 PII）
- 三進程邊界：所有變動都在 main；renderer 透過 tRPC 讀寫 settings；utility 不涉
- 依賴：無新增 npm 套件（用 Electron 內建 Tray / globalShortcut / setLoginItemSettings）
