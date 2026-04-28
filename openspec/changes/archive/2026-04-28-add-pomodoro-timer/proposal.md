## Why

WhatPulse 沒有番茄鐘整合，使用者必須另開 app 配對追蹤。key-trace 把番茄鐘做進去，加上跨日 streak 累積，能直接把「專注時間」變成可視化目標。這是 v1 三軸差異化裡「任務 tagging + 番茄鐘」軸的起點，也讓既有 deep work time 概念有具體錨點（25 分鐘對齊）。先做番茄鐘是因為它工程量最小、立刻體驗得到、且後續 heatmap / Claude 寫總結都能拿它當素材。

## What Changes

- main 進程新增 pomodoro 模組（與 tracker 平行），負責計時狀態機（idle / work / break）與通知排程；計時器在背景模式（renderer 視窗關閉）持續運作，到時間 tray 通知
- 每完成一個 work session 落盤一筆 `pomodoro_sessions` 紀錄，存 utility process 的 SQLite（與 events 表共存於同 DB）
- streak 由 utility 端從 `pomodoro_sessions` 計算：「連續 N 個工作日（local time）至少完成 1 個 work session」，跨日邊界由 utility 處理
- tRPC router 新增 `pomodoro` namespace：`getState` query（即時狀態 + 剩餘秒數）、`start` / `pause` / `resume` / `stop` / `skipBreak` mutations、`getStats` query（今日已完成幾個 + 當前 streak 長度）
- renderer dashboard 新增 pomodoro 卡片：當前狀態、剩餘時間、今日完成數、streak 長度、控制按鈕；走既有 Section 結構
- 桌面通知透過 Electron Notification API：work 結束 → 「該休息了」、break 結束 → 「回來工作」；兩者預設開、UI 可關（存於 userData 下的 JSON 設定檔）
- 預設 work 25 分鐘 / break 5 分鐘；UI 設定可改（5 / 15 / 25 / 45 / 90 分鐘預設值），存於 userData 下 `pomodoro-settings.json`（透過自寫的 `src/main/settings-store.ts`，避開 electron-store 的 ESM/CJS 衝突）

## Capabilities

### New Capabilities

- `pomodoro`: 番茄鐘計時器 + 跨日 streak 計算 + work session 持久化。涵蓋計時狀態機、通知策略、設定持久化、與 storage 的互動契約。

### Modified Capabilities

(none — tracker 與 storage 既有 capability 在本 change 不動)

## Impact

- Affected specs:
  - 新 capability：`pomodoro`
- Affected code:
  - New:
    - src/main/pomodoro.ts（計時狀態機、Electron Notification、與 storage 互動）
    - src/renderer/src/components/PomodoroCard.tsx（dashboard 卡片）
    - src/shared/pomodoro-protocol.ts（main↔utility 訊息：sessionCompleted / queryStreak / queryTodayCount）
  - Modified:
    - src/main/index.ts（whenReady 內 startPomodoro，before-quit / will-quit stop）
    - src/main/router.ts（加 `pomodoro` namespace 的 query / mutation）
    - src/main/storage.ts（新增 recordPomodoroSession / queryPomodoroStreak / queryPomodoroTodayCount RPC，alive flag 邏輯沿用）
    - src/utility/index.ts（pomodoro_sessions schema 建立 + insert + streak query + today count query）
    - src/shared/storage-protocol.ts（擴 MainToUtilityMessage / UtilityToMainMessage union type）
    - src/renderer/src/App.tsx（在現有 Section 結構加 PomodoroCard）
- Schema 變動：新表 `pomodoro_sessions(id INTEGER PRIMARY KEY AUTOINCREMENT, started_at INTEGER NOT NULL, ended_at INTEGER NOT NULL, type TEXT NOT NULL CHECK(type IN ('work','break')), planned_duration_seconds INTEGER NOT NULL, actual_duration_seconds INTEGER NOT NULL, completed INTEGER NOT NULL CHECK(completed IN (0,1)))` + index on `started_at`
- 隱私底線：本 change 不變動既有底線；`pomodoro_sessions` 不寫 app 名稱、不寫視窗標題、不寫鍵盤事件
- 三進程邊界：main 持有計時器狀態（背景持續運作必須），utility 負責跨 session 持久化與聚合查詢，renderer 純顯示 + 觸發控制 mutation
- 依賴：新增 `zod`（v3，搭 tRPC v10 的 `.input(z.object(...))` schema 驗證）；其餘走 Electron 內建 Notification + 既有 better-sqlite3 + 自寫的小 settings-store（fs+JSON），不引入 electron-store 以避免 ESM/CJS 衝突
