## Why

A2 storage pipeline 把鍵鼠事件累進 SQLite 已經幾天了，但 dashboard 上「今日總計」只是四個 0~ 幾位數的數字卡，看不出**過去一個月哪幾天有衝、哪些時段你最忙**。Heatmap + 一日週期分析是 v1 「漂亮 dashboard」軸線的重點功能：

- **GitHub 風日歷 heatmap**：53 週 × 7 天網格，色階反映該日活動強度。一眼看出工作節奏與斷檔
- **一日週期長條圖**：把 N 天的事件按 0~23 時聚合，顯示一天內每小時的活動分布。一眼看出「我幾點最有產出」「晚上幾點該停」

兩者都是被動 / 自動發生型 — 使用者不需要按任何按鈕就能用，符合 Hsin 工作習慣與「番茄鐘撤回後 v1 重整」精神。資料源是既有 `events` 表，**不需要 schema 變動或新表**。

## What Changes

- 新 tRPC 兩個 query：
  - `historical.heatmapDaily({ weeks })`：回傳最近 N 週每日活動量 `{ date: 'YYYY-MM-DD', count: number }[]`，count 為該日 `keydown + mousedown` 總和（mousemove 排除以免因移動量極大碾壓 keyboard 訊號）
  - `historical.hourlyDistribution({ days })`：回傳最近 N 天的 24 小時分布 `{ hour: 0-23, count: number }[]`，count 為該小時的 `keydown + mousedown` 總和
- 新 renderer 元件：
  - `src/renderer/src/components/HeatmapCalendar.tsx`：純 Tailwind CSS grid（53 × 7 cells），無新依賴；色階 5 級（empty / very-low / low / medium / high / very-high），閾值依當前資料的最大值動態切；hover 顯示 native title tooltip 含日期 + count
  - `src/renderer/src/components/HourlyChart.tsx`：用既有 Recharts BarChart（CLAUDE.md stack 已列）畫 24 bars
- App.tsx 加新 section「活動 heatmap」+「一日週期分析」，5 分鐘 refetchInterval（DB 端聚合查詢，跨日資料變化緩慢）
- 預設視窗：heatmap 53 週、hourly 最近 7 天。renderer 端先寫死，未來設定 UI 給 toggle

## Non-Goals

- **不**做設定 UI 讓使用者改視窗大小（先寫死預設值，等實際用上覺得不夠再加）
- **不**做 per-app 拆分（heatmap 是「整體節奏」概念，per-app 屬不同視角；v2 if needed）
- **不**做匯出 PNG / 分享連結（v2）
- **不**做 zoom in 看單日詳情（v2 加 click → drill-down）
- **不**引入 react-calendar-heatmap 等專門 library（53×7 = 371 cells，Tailwind grid 寫起來不到 50 行，多一個依賴不划算）
- **不**做時區處理（依賴 SQLite 的 `'localtime'` 修飾，跟 pomodoro streak 算法一致；CLAUDE.md L141 已標 v2 跨時區搬遷議題）

## Capabilities

### New Capabilities

- `dashboard-heatmap`: 日歷 heatmap + 一日週期分析；包含 utility 端的 SQL 聚合查詢、tRPC API、renderer 視覺化兩個元件、與 App.tsx 整合。

### Modified Capabilities

(none — tracker / storage / system-integration 既有 capability 不動)

## Impact

- Affected specs:
  - 新 capability：`dashboard-heatmap`
- Affected code:
  - New:
    - src/renderer/src/components/HeatmapCalendar.tsx
    - src/renderer/src/components/HourlyChart.tsx
  - Modified:
    - src/utility/index.ts（加兩個 prepared statement + reader 函式 + message handlers）
    - src/main/storage.ts（Storage 介面加 `queryHeatmapDaily` / `queryHourlyDistribution` 兩個 RPC method）
    - src/main/router.ts（`historical` namespace 加兩個 query；用 zod input schema）
    - src/shared/storage-protocol.ts（擴 message union 加兩個 query type + 對應 result types）
    - src/renderer/src/App.tsx（在既有 Section 結構加兩個 section 包新元件）
- Schema：本 change 無 SQLite 動作（query 既有 events 表）
- 隱私底線：本 change 不變動既有底線（heatmap / hourly 都是聚合 count，無 app 名稱、無時序）
- 三進程邊界：utility 多兩個 query；main storage 多兩個 RPC method；renderer 多兩個元件；無跨界拓樸變動
- 依賴：新增 `recharts`（已在 CLAUDE.md stack 列為「圖表底層」，本次正式引入）；無其他套件
