## 1. 刪除實作檔（涵蓋 Timer State Machine、Pause and Resume、Background Continuity、Notification Behavior、Settings）

- [x] 1.1 刪除 `src/main/pomodoro.ts`（涵蓋 Timer State Machine / Pause and Resume / Background Continuity / Notification Behavior / Settings 的 main 實作）
- [x] 1.2 刪除 `src/main/settings-store.ts`（僅 pomodoro 在用；conventions.md 的範例保留作為未來參考）
- [x] 1.3 刪除 `src/renderer/src/components/PomodoroCard.tsx` 與其父目錄 `src/renderer/src/components/`（若空）

## 2. 修改 main 端清掉引用（涵蓋 tRPC API Surface、Session Persistence）

- [x] 2.1 改 `src/main/index.ts`：移除 `createPomodoro` / `createSettingsStore` import 與呼叫；移除 `pomodoro` 變數宣告；before-quit / will-quit 移除 `pomodoro?.stop()`；createWindow 不再檢查 pomodoro
- [x] 2.2 改 `src/main/router.ts`：移除 `pomodoro` namespace 整段（落實 tRPC API Surface 的撤回）；移除 `wrapPomodoroAction` helper、`zod` import、`TRPCError` import（若無其他使用）；`createRouter` 簽章從 `(tracker, storage, pomodoro)` 退回 `(tracker, storage)`
- [x] 2.3 改 `src/main/storage.ts`：`Storage` 介面移除 `recordPomodoroSession` / `queryPomodoroStreak` / `queryPomodoroTodayCount` 三個方法；child.on('message') handler 移除對應 `queryPomodoroStreakResult` / `queryPomodoroTodayCountResult` 分支；移除三個 query function 與 recordPomodoroSession；return 物件對應移除（落實 Session Persistence + tRPC API Surface 的後端撤回）

## 3. 修改 utility 端清掉 schema（涵蓋 Session Persistence、Streak Calculation、Privacy Invariant）

- [x] 3.1 改 `src/utility/index.ts`：移除 `pomodoro_sessions` 的 CREATE TABLE / CREATE INDEX、`insertPomodoroSession` prepared statement、`recordPomodoroSession` transaction wrapper、`pomodoroWorkDaysStmt` / `pomodoroTodayCountStmt`、`startOfTodayMs` / `formatLocalDate` / `readPomodoroStreak` / `readPomodoroTodayCount` 函式、message handler 中 `recordPomodoroSession` / `queryPomodoroStreak` / `queryPomodoroTodayCount` 三個分支。落實 Session Persistence 與 Streak Calculation 撤回；Privacy Invariant 隨表撤一起撤

## 4. 共用 protocol（`src/shared/storage-protocol.ts`）

- [x] 4.1 移除 `PomodoroSessionType` / `PomodoroSessionRecord` 兩個型別 export；`MainToUtilityMessage` union 移除 `recordPomodoroSession` / `queryPomodoroStreak` / `queryPomodoroTodayCount` 三個 variant；`UtilityToMainMessage` union 移除 `queryPomodoroStreakResult` / `queryPomodoroTodayCountResult` 兩個 variant

## 5. 修改 renderer 移除 UI

- [x] 5.1 改 `src/renderer/src/App.tsx`：移除 `PomodoroCard` import；移除「番茄鐘」section（包 PomodoroCard）；移除「番茄鐘統計」section 與對應 `pomodoroStats = trpc.pomodoro.getStats.useQuery(...)` query 與 `pomoItems` 變數

## 6. 卸載依賴

- [x] 6.1 `npm uninstall zod`（router.ts 已不需要）；確認 `package.json` / `package-lock.json` 同步更新

## 7. 驗證

- [x] 7.1 跑 `npm run typecheck` 全綠
- [ ] 7.2 跑 `npm run build` 全綠（main / preload / utility / renderer 四 bundle 都要過）
- [ ] 7.3 跑 `npm run e2e:smoke`：確認原本 6 卡片（live tracker）+ 4 卡片（today DB）共 10 卡片仍渲染、tRPC `tracker.stats` / `historical.totalToday` 仍通；`pomodoro.*` 全部消失
