## Context

key-trace 從 walking skeleton 至今主視窗是「點 X 就 quit」的一般 web-app 風格，而非桌面常駐 app 的「縮 tray」UX。這次把四件背景常駐 app 該有的系統整合一次到位：tray、背景模式、開機自啟、全域熱鍵。

四件事彼此互相依賴的順序（如何串成一個自洽 UX）：
- 不做 tray，背景模式無「縮到哪裡」
- 不做背景模式，開機自啟意義減半（每次開機彈視窗）
- 不做全域熱鍵，使用者要從 tray 點才能叫出 dashboard，常駐 app 體感差很多

## Goals / Non-Goals

**Goals:**

- 開啟 app 後，使用者點主視窗 X 不退出，視窗 hide；tray 圖示常駐
- tray 左鍵切換主視窗顯示 / 隱藏；右鍵彈選單，可開啟 dashboard / 切換 auto-launch / 切換全域熱鍵 / 結束
- 「結束」是退出 app 的唯一明確路徑（除了 OS 層 task manager 強制終止）
- 開機自啟跟著 tray 選單 toggle 同步寫進 OS（Windows registry / macOS LoginItems）
- 全域熱鍵預設 `Ctrl+Shift+K`（macOS：`Cmd+Shift+K`），按下切換主視窗顯示 / 隱藏；可在 tray 選單暫時關閉
- 設定持久化於 userData，重啟後 toggle 狀態保留

**Non-Goals:**

- 設定 UI panel（tray 選單已涵蓋所有 toggle；dashboard 設定頁排後續 change）
- tray icon 視覺打磨（用 placeholder PNG，等其他 v1 功能完工後一次美術 pass）
- 自訂全域熱鍵 / 多組熱鍵（v2）
- macOS dock 隱藏（保留 dock 是 macOS 慣例）
- Linux 支援（Q1=B 已決定僅 Win + macOS）
- 開機延遲啟動 / 啟動參數（OS 級設定，超出 app 範圍）
- 跨平台複雜的權限引導（macOS 第一次跑會跳「開機項目」權限，給原生對話框讓使用者點即可）

## Decisions

### Tray 由 main 進程持有，跟視窗 lifecycle 解耦

**規則**：Tray 由 main 進程在 `whenReady` 內建立一次，整個 app 生命週期都活；視窗 hide / show 不影響 tray 存在。

**Alternatives 考慮**：
- 視窗存活時才有 tray → 否決：背景模式下 tray 才是 app 的「實體」，反而視窗才該是次要
- 用 macOS Status Bar Item / Windows NotifyIcon 各別實作 → 否決：Electron 的 `Tray` API 已抽象掉跨平台差異

### 「真退出」標誌：`app.isQuitting`

**規則**：`isQuitting` flag 預設 false。tray 選單「結束」按鈕 → 設 true → `app.quit()`。`mainWindow.on('close')` handler 若 `isQuitting` 為 false → `event.preventDefault()` + `mainWindow.hide()`；為 true → 不擋，讓視窗正常關閉觸發 `before-quit`。

**為何不用 `app.on('before-quit', ev => isQuitting = true)`**：那會讓任何途徑（包括視窗 close）都被視為真退出，與意圖反過來。要在「結束」這個明確意圖點才設 flag。

```ts
let isQuitting = false;
mainWindow.on('close', (event) => {
  if (!isQuitting) {
    event.preventDefault();
    mainWindow.hide();
  }
});
trayMenu.append({ label: '結束', click: () => { isQuitting = true; app.quit(); } });
```

### 背景模式取代 `window-all-closed`

**規則**：移除既有 `app.on('window-all-closed', ...) → app.quit()`（非 darwin）邏輯。所有平台**都不**因為視窗全關就退出 — 改由 tray 選單「結束」唯一驅動。

**Alternatives 考慮**：
- 保留 `window-all-closed` 為 macOS 行為 → 否決：macOS 慣例是「視窗關了 dock 還在不退出」，跟我們的 tray 模型一致，反而是 Windows 改變較大；統一處理乾淨
- 配合 `app.on('window-all-closed', e => e.preventDefault())` → 不需要：因為 close 已被 preventDefault，視窗不會真的 close，事件本就不會觸發

### Auto-launch：用 Electron 內建 API，不引第三方

**規則**：用 `app.setLoginItemSettings({ openAtLogin, openAsHidden, args })` 處理。`openAsHidden: true` 搭配背景模式 → 開機後 app 在 tray、不彈視窗。讀回時用 `app.getLoginItemSettings()` 對齊我們的 settings 持久化檔（OS 為 source of truth，settings 檔只記「使用者期望狀態」）。

**Alternatives 考慮**：
- npm `auto-launch` 套件 → 否決：Electron 內建已涵蓋 Win + macOS，多一個 dependency 沒必要
- 手寫 registry 操作 → 否決：跨平台複雜度

**邊界**：使用者可能在 OS 層手動關掉 LoginItems（macOS 系統偏好 → 登入項目）。tray 選單顯示 checkbox 時應讀 `getLoginItemSettings()` 而非僅讀我們的 settings file，避免 UI 與真實狀態不一致。

### 全域熱鍵：預設一個、可關，不可改

**規則**：寫死 `CommandOrControl+Shift+K`。tray 選單只有「啟用 / 關閉」toggle。**v1 不做自訂**（複雜度：衝突偵測 / 設定 UI / 持久化格式），v2 再說。

**為什麼預設 K**：K = key-trace，方便記，且 `Ctrl+Shift+K` 在 Chrome / VS Code / 其他常見 app 多半未占用（K 通常綁字串相關功能且要 shift 修飾）。

**衝突處理**：`globalShortcut.register()` 回傳 boolean，false 代表已被其他 app 占用。發生時 console.warn（v1 不做 toast 通知）；使用者期望開但實際 register 失敗 → settings 仍記 enabled，下次重啟可能成功。

### Settings 持久化：把 settings-store 帶回來

**規則**：把刪過的 `src/main/settings-store.ts`（fs+JSON + memory cache + 型別驗證）帶回。改名 `system-integration-settings.json` 存 `{ autoLaunchEnabled: boolean, globalShortcutEnabled: boolean }`，預設 `{ false, true }`（auto-launch 預設關，全域熱鍵預設開）。

**為何 auto-launch 預設關**：CLAUDE.md L114「開機自動啟動（預設關，UI 可開）」明示。使用者裝完 app 第一次跑要主動勾才會啟用，避免裝完不知不覺多了一個開機項目。

### tRPC 新 namespace `system`

**規則**：tray 操作直接呼叫 main 的 system module；renderer 走 tRPC `system.getSettings` / `system.updateSettings`（給未來 dashboard 設定 UI 用，本 change 不做 UI 但先佈好 API）。

**Why dual-path**：tray 與 renderer 是兩個獨立 UI 入口。tray 不走 tRPC（直接呼叫同進程的 module），但 renderer 走 tRPC（跨進程）。兩邊呼叫的最終是同一份 system module 的方法。

### Tray icon 資源處理

**規則**：placeholder PNG 放 `assets/tray-icon.png`（16x16 + 32x32 兩份或一份高解析）。dev 模式：electron-vite 把 `assets/` 當靜態資源，`nativeImage.createFromPath(join(app.getAppPath(), 'assets/tray-icon.png'))` 讀入。prod 模式：electron-builder 會把 assets 一起打包，路徑相同。

**Alternatives 考慮**：
- 內嵌 base64 PNG 在程式碼裡 → 否決：醜，且未來換圖要改 code
- 用 `?asset` Vite import 機制 → 適合 renderer，main 進程則用 fs 讀路徑簡單

## Risks / Trade-offs

- **使用者「失蹤」app**：把 close → hide 後，新使用者可能困惑「我關掉了它怎麼還在背景」。Mitigation：第一次 hide 時 emit balloon 通知「key-trace 已縮到工作列，從這邊重新開啟」（macOS / Win 都支援）。本 change 包進來
- **強制終止繞過 cleanup**：使用者用 task manager 殺 process → tracker.stop / storage.stop 不觸發。`will-quit` 也不會跑。tracker 累計可能落丟最後一分鐘 bucket（因 flush 是分鐘級）。**接受**，這是 OS 級終止本來的代價
- **macOS 開機項目權限對話框**：第一次 setLoginItemSettings 會跳「key-trace 想要在啟動時打開」對話框。使用者可拒絕，settings 仍記 enabled 但實際沒生效。Mitigation：tray 選單顯示時 reconciliation OS 真實狀態
- **全域熱鍵衝突**：`Ctrl+Shift+K` 已被某 app 占用 → 我們 register 失敗。tray 選單顯示 enabled 但實際無作用。**接受**，v1 不做衝突 UI；v2 加自訂熱鍵時順便做
- **assets 路徑在 packaged app 與 dev 不同**：`app.getAppPath()` 在 dev 是 cwd、prod 是 asar 內。需驗證兩邊都讀得到 PNG（task 中包含驗證步驟）
- **Tray 選單 checkbox 與真實狀態不同步**：使用者切到 OS 層改 LoginItems 後我們不知道。Mitigation：每次右鍵展開 tray 選單時呼 `getLoginItemSettings()` 重建選單，而非快取選單物件
