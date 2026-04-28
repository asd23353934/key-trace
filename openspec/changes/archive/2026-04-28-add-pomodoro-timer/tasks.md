## 1. utility 端：schema 命名與 index、streak 算法（utility 端）、session persistence、privacy invariant

- [x] 1.1 在 `src/utility/index.ts` 加 `pomodoro_sessions` 表（七欄）+ `idx_pomodoro_started` index，落實 schema 命名與 index 決議；確認欄位涵蓋滿足 session persistence 與 privacy invariant 的要求（不寫 app 名稱 / 標題 / 鍵盤事件）
- [x] 1.2 加 prepared statement + transaction wrapper：`insertPomodoroSession`，於 message handler 處理 `recordPomodoroSession` 訊息
- [x] 1.3 在 utility 加 streak calculation 算法：SQL 撈 `DISTINCT date(started_at/1000,'unixepoch','localtime')` 列出有 completed work 的天，JS 端迴圈算 currentStreak（包含「今日尚未完成不打斷」邏輯）；同檔加 `queryPomodoroTodayCount`（count work + completed=1 + started_at >= 今日 0:00 ms）

## 2. 共用 protocol（`src/shared/storage-protocol.ts`）

- [x] 2.1 擴 `MainToUtilityMessage` union 加 `recordPomodoroSession` / `queryPomodoroStreak` / `queryPomodoroTodayCount`；新增 `PomodoroSessionRecord` 型別（七欄對應）
- [x] 2.2 擴 `UtilityToMainMessage` union 加對應 result 訊息（streak / todayCount）

## 3. main 端 storage 橋（`src/main/storage.ts`）

- [x] 3.1 在 `Storage` 介面加 `recordPomodoroSession`（fire-and-forget，dead 時靜默丟棄）+ `queryPomodoroStreak`（return Promise<number>）+ `queryPomodoroTodayCount`（return Promise<number>），沿用既有 alive flag 與 requestId RPC 模式

## 4. main 端 pomodoro 模組（`src/main/pomodoro.ts` 新檔；timer state machine、pause and resume、background continuity、計時狀態持有於 main 進程、狀態機：idle / work / break + paused 標記、計時資料結構（main 端）、完成判定 + 落盤策略、通知策略、設定持久化）

- [x] 4.1 建 `createPomodoro({ storage, store })` factory：依「狀態機：idle / work / break + paused 標記」設計，state 含 phase / paused / endTs / pausedAccumulatedMs / plannedSec / pausedAtMs（即「計時資料結構（main 端）」決議）；對外 method `start` / `pause` / `resume` / `stop` / `skipBreak` / `getState`；timer 用 `setTimeout` + 結束絕對時間戳（不用 setInterval 累加）。實作 timer state machine 與 pause and resume 兩個 requirement，背景持續性靠 main 持有狀態（background continuity 的 main 端責任）
- [x] 4.2 實作 phase-end callback：work 完成 → `storage.recordPomodoroSession({ ..., completed: 1 })` 後轉 `break` 並重排下次 setTimeout；break 完成 → 轉 `idle`；stop 中斷 → 落盤 `completed: 0`；skipBreak → 不落盤直接 `idle`。完整覆蓋完成判定 + 落盤策略
- [x] 4.3 Electron Notification 整合（notification behavior）：phase-end 時依設定 emit `new Notification({ title: 'key-trace', body: ... })`，click 事件呼叫 `focusMainWindow`；通知策略決議落實
- [x] 4.4 用自寫 `src/main/settings-store.ts`（fs + JSON，存 userData/pomodoro-settings.json）持久化 settings `{ workMin, breakMin, notifyWorkEnd, notifyBreakEnd }`，預設 `{25, 5, true, true}`；暴露 `getSettings` / `updateSettings`；start 時讀取最新 work duration（settings 即時）；落實設定持久化（electron-store 因 ESM/CJS 衝突未採用）

## 5. tRPC router（`src/main/router.ts`；tRPC API Surface 落實）

- [x] 5.1 在 router 加 `pomodoro` namespace 完整 tRPC API Surface：`getState` query / `getStats` query / `start` `pause` `resume` `stop` `skipBreak` mutation / `getSettings` query / `updateSettings` mutation；`updateSettings` 帶 zod input schema（workMin/breakMin/notify*）；mutation 在無效轉換時 throw `TRPCError({ code: 'BAD_REQUEST' })`

## 6. main 啟動接線（`src/main/index.ts`）

- [x] 6.1 whenReady 內 `await startStorage()` 後 `createPomodoro({ storage, store })`，把 pomodoro 實例與既有 tracker / storage 一同傳入 `createRouter`；`before-quit` + `will-quit` 雙保險加 `pomodoro.stop()`

## 7. renderer UI

- [x] 7.1 建 `src/renderer/src/components/PomodoroCard.tsx`：顯示 phase / remainingSec / paused / 控制按鈕（start / pause / resume / stop / skipBreak），用 `trpc.pomodoro.getState.useQuery({ refetchInterval: 1000 })`
- [x] 7.2 在 `src/renderer/src/App.tsx` 用既有 `Section` 結構加「番茄鐘」section 包 `PomodoroCard`；另加「今日完成 + streak」資訊（從 `pomodoro.getStats`，5 秒 refetch）

## 8. 驗證

- [x] 8.1 跑 `npm run typecheck` 全綠
- [x] 8.2 跑 `npm run build` 全綠（main / preload / utility / renderer 四 bundle 都要過）
- [x] 8.3 跑 `npm run e2e:smoke`：確認 PomodoroCard 渲染、`pomodoro.getState` IPC 通、初始 phase=idle、settings 預設值正確
- [ ] 8.4 實機驗（`npm run dev`）：縮短 work/break 時長設定（如 6 秒 / 3 秒）後按 start，確認倒數 → phase-end 通知觸發 → click 通知聚焦視窗 → DB 落盤一筆 completed=1 → getStats 顯示 todayCompleted=1、streak=1
