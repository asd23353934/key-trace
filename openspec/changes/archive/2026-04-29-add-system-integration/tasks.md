## 1. 帶回 settings-store + 加 placeholder tray icon（涵蓋 Settings Persistence、Settings 持久化：把 settings-store 帶回來、Tray icon 資源處理）

- [x] 1.1 落實「Settings 持久化：把 settings-store 帶回來」決議：新建 `src/main/settings-store.ts`，內容沿用 dev-notes/electron/conventions.md「設定 / 偏好持久化」範例（fs+JSON + memory cache + 型別驗證）
- [x] 1.2 落實「Tray icon 資源處理」決議：新建 `assets/tray-icon.png`（16x16 + 32x32 灰底圓形或方形 placeholder；用 Node 程式生成或外部工具產一張暫用）

## 2. 建 system-integration 模組（涵蓋 Tray Icon、Background Mode (Close to Tray)、Auto-Launch on System Boot、Background Boot、Global Shortcut；落實「Tray 由 main 進程持有，跟視窗 lifecycle 解耦」「「真退出」標誌：`app.isQuitting`」「Auto-launch：用 Electron 內建 API，不引第三方」「全域熱鍵：預設一個、可關，不可改」決議）

- [x] 2.1 新建 `src/main/system-integration.ts`：`createSystemIntegration({ getMainWindow, settingsStore })` factory，內含 `tray: Tray | null`、`isQuitting: boolean` flag（落實「「真退出」標誌：`app.isQuitting`」）、`updateSettings`/`getSettings` method、`destroy` cleanup。Tray 由 main 進程持有，跟視窗 lifecycle 解耦
- [x] 2.2 在 factory 內：`createTray()` 用 `nativeImage.createFromPath(join(app.getAppPath(), 'assets/tray-icon.png'))`，`tray.setToolTip('key-trace')`，`tray.on('click', toggleMainWindow)`，落實 Tray Icon requirement
- [x] 2.3 `buildContextMenu()` 函式：每次右鍵展開重建選單（讀 `app.getLoginItemSettings()` 對齊 OS 真實狀態），含「顯示 dashboard」「開機自啟（checkbox）」「全域熱鍵（checkbox）」「結束」四項；`tray.popUpContextMenu()` 與 `tray.on('right-click')` 接起。落實 Tray Icon Scenario「右鍵選單顯示」
- [x] 2.4 `applyAutoLaunch(enabled)`（Auto-launch：用 Electron 內建 API，不引第三方）：呼叫 `app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: enabled })`；`applyGlobalShortcut(enabled)`（全域熱鍵：預設一個、可關，不可改）：根據 enabled 呼 `globalShortcut.register` 或 `unregister('CommandOrControl+Shift+K')`，register 回傳 false 時 console.warn。落實 Auto-Launch on System Boot 與 Global Shortcut requirement
- [x] 2.5 全域熱鍵 handler：`toggleMainWindow()`（show/focus 隱藏視窗、hide 顯示視窗）。落實 Global Shortcut Scenario「按下切換主視窗顯示 / 隱藏」
- [x] 2.6 `quit()`：設 `isQuitting = true` → `app.quit()`；exposed 給 tray 選單「結束」綁

## 3. 主視窗 close 行為改寫（涵蓋 Background Mode (Close to Tray)；落實「背景模式取代 `window-all-closed`」決議）

- [x] 3.1 改 `src/main/index.ts`：在 `createWindow` 內加 `mainWindow.on('close', (e) => { if (!systemIntegration.isQuitting()) { e.preventDefault(); mainWindow.hide(); emitFirstHideNotification(); } })`，落實 Background Mode (Close to Tray) Scenario「Closing the main window hides instead of quits」
- [x] 3.2 第一次 hide 時 emit 桌面通知（`new Notification({ title, body: 'key-trace 已縮到工作列，從這邊重新開啟' }).show()`），用 module-level boolean 防多次。落實 Background Mode Scenario「First close emits a notification」
- [x] 3.3 落實「背景模式取代 `window-all-closed`」決議：移除既有 `app.on('window-all-closed', ...) → app.quit()` 整段；統一由 tray「結束」+ `app.quit()` 觸發。Tracker / Storage 的 stop 仍掛 `before-quit` / `will-quit`

## 4. whenReady 接線（涵蓋 Background Boot、Settings Persistence）

- [x] 4.1 改 `src/main/index.ts`：`whenReady` 內 `await startStorage()` 後 `createTracker` 與 `createSystemIntegration` 並行建好；讀 settings 後 `applyAutoLaunch` + `applyGlobalShortcut` 套用 OS 狀態。落實 Settings Persistence Scenario「Settings applied at startup」
- [x] 4.2 處理 Background Boot：偵測 `app.getLoginItemSettings().wasOpenedAsHidden` 為 true（macOS）或 `process.argv` 含 `--openAsHidden`-like marker → 不呼叫 `mainWindow.show()`、保持 hidden；tray 與 tracker 仍正常啟動。落實 Background Boot requirement
- [x] 4.3 應用結束時 cleanup：`before-quit` / `will-quit` 加 `systemIntegration.destroy()`（tray.destroy() + globalShortcut.unregisterAll()）

## 5. tRPC router 加 `system` namespace（涵蓋 tRPC API Surface；落實「tRPC 新 namespace `system`」決議）

- [x] 5.1 改 `src/main/router.ts`：加 `system` namespace 完整 tRPC API Surface：`getSettings` query / `updateSettings` mutation；`updateSettings` 帶 zod input schema（兩個 boolean）；invalid 時 throw `TRPCError BAD_REQUEST`。新增 `zod` 依賴
- [x] 5.2 `createRouter` 簽章 `(tracker, storage, systemIntegration)`：加第三個參數，updateSettings 呼叫 `systemIntegration.updateSettings()`、getSettings 呼叫 `systemIntegration.getSettings()`

## 6. assets 路徑處理

- [x] 6.1 確認 `electron.vite.config.ts` 在 dev / prod 都能讓 main 進程 `app.getAppPath()` 找到 `assets/tray-icon.png`：dev 模式 cwd = project root → 直接讀；prod 模式 electron-builder 會把 `assets/` 一起打包到 asar，路徑相同
- [x] 6.2（如有需要）`electron-vite.config.ts` 加 `publicDir: 'assets'` 或在 build config 配 copy plugin；最壞情況把 PNG embed 成 base64 內嵌

## 7. 安裝依賴

- [x] 7.1 `npm install zod@3.25.76 --save`（router.ts 需要；tRPC v10 配 v3）

## 8. 驗證

- [x] 8.1 跑 `npm run typecheck` 全綠
- [x] 8.2 跑 `npm run build` 全綠（main / preload / utility / renderer 四 bundle）
- [x] 8.3 跑 `npm run e2e:smoke`：確認原本 10 卡片仍渲染、tray 創建不壞 startup、tRPC `system.getSettings` 通並回傳 `{ autoLaunchEnabled: false, globalShortcutEnabled: true }` 預設
- [ ] 8.4 實機驗（`npm run dev`）：(a) 看到 tray 圖示；(b) 主視窗按 X 縮 tray、彈通知；(c) 按 `Ctrl+Shift+K` 主視窗顯示 / 隱藏切換；(d) tray 右鍵選單可開 dashboard / toggle 開機自啟（系統偏好對齊）/ 結束才真退出
