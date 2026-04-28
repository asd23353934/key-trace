## Summary

撤回 `add-pomodoro-timer` change 引入的番茄鐘 + 專注 streak 功能。

## Motivation

番茄鐘是「行為依賴型」功能：必須由使用者主動「按開始」才會發生。Hsin 個人不使用番茄鐘工作法，這個功能只會在 dashboard 占位（卡片放在那、按鈕沒人點），對實際使用價值為零。CLAUDE.md 第 89 行「不過度抽象、不為假想需求設計」直接指向應該撤回。

當初 Q3=D（差異化三軸全要）+ Q16 把番茄鐘排進 v1，理由是「工程量小、適合練 Spectra」。練 Spectra 的價值已透過 add-pomodoro-timer 完整一輪 propose → apply → archive 拿到，繼續留著程式碼只增加維護成本與 UI 噪音。

## Proposed Solution

走 Spectra REMOVED Requirements 流程把 `pomodoro` capability 整顆刪除：
- `openspec/specs/pomodoro/spec.md` 經 archive 流程清空（reason + migration 寫進 spec delta）
- 刪除實作檔：`src/main/pomodoro.ts` / `src/main/settings-store.ts`（settings-store 僅 pomodoro 在用，連帶撤；conventions.md 的「設定持久化」一節保留作為未來參考）/ `src/renderer/src/components/PomodoroCard.tsx`（與其父目錄）
- 改檔移除引用：`src/main/index.ts`（whenReady 移除 pomodoro init）/ `src/main/router.ts`（移除 `pomodoro` namespace；`zod` 連帶不再需要）/ `src/main/storage.ts`（移除 recordPomodoroSession + queryPomodoroStreak + queryPomodoroTodayCount 三個方法 + 對應 RPC handler）/ `src/utility/index.ts`（移除 pomodoro_sessions schema、prepared statements、message handlers、helper 函式）/ `src/shared/storage-protocol.ts`（移除 PomodoroSessionRecord 型別與 message union 中相關 variant）/ `src/renderer/src/App.tsx`（移除番茄鐘 + 番茄鐘統計兩個 section）
- 卸載 npm 依賴：`zod`（原本只給 pomodoro updateSettings 用）
- DB schema 處理：既存使用者（Hsin 自己 dev DB）的 `pomodoro_sessions` 表保留為 orphan（不影響任何運作、占用磁碟微量）；utility/index.ts 移除 CREATE TABLE 後新安裝即不會建表

## Non-Goals

- **不**回頭把 v1 範圍補齊到原本 4 項。撤回後 v1 = heatmap + markdown 報告 + Claude 寫總結三項，皆為被動 / 自動發生型，貼合 Hsin 工作習慣
- **不**做 schema migration 系統（CLAUDE.md 第 183 行已標為未來品質待辦），這次仍走「CREATE/DROP IF EXISTS」鬆散式
- **不**保留 settings-store.ts 給未來用（YAGNI；真有下個 feature 需要設定持久化時再從 dev-notes/electron/conventions.md 抄回 ~40 行）

## Alternatives Considered

- **保留 backend、隱藏 UI**：違反「no half-finished implementations」，DB / state 仍跑但無 UI 觸發，純浪費資源 + 製造未來 confusion
- **直接刪 + 一個 git commit，不走 Spectra**：spec 史不完整（archive 過的 capability 突然 spec 還在但 code 沒了，未來看 spec 會以為功能還活著）。走 Spectra REMOVED 流程是設計給這種情境的正確做法

## Impact

- Affected specs:
  - `pomodoro` capability：整顆 REMOVED（9 個 requirement 全撤）
- Affected code:
  - Removed:
    - src/main/pomodoro.ts
    - src/main/settings-store.ts
    - src/renderer/src/components/PomodoroCard.tsx
    - src/renderer/src/components/（目錄空後刪）
  - Modified:
    - src/main/index.ts（移除 pomodoro init / stop）
    - src/main/router.ts（移除 pomodoro namespace；移除 zod / TRPCError import）
    - src/main/storage.ts（移除 3 個 pomodoro RPC method 與對應 handler 分支）
    - src/utility/index.ts（移除 pomodoro schema、statements、handlers）
    - src/shared/storage-protocol.ts（移除 pomodoro 相關 type 與 message variants）
    - src/renderer/src/App.tsx（移除「番茄鐘」與「番茄鐘統計」兩個 section）
    - package.json（uninstall zod）
- Schema 變動：utility 啟動不再 CREATE pomodoro_sessions 表；既存 DB 表保留為 orphan
- 隱私底線：本 change 不變動既有底線（撤回的 pomodoro_sessions 本就無 PII，不需特別清理）
- 三進程邊界：不變（main / utility / renderer 拓樸維持）
- 依賴：移除 `zod`（v3.25.76）；不新增任何套件
