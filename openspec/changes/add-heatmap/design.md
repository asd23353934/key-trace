## Context

A2 storage pipeline 累積 events 已穩定運作幾天（前次 e2e 看到「今日總計」非零數字證實寫入無問題）。本 change 把這些累積資料**第一次以視覺方式呈現** — heatmap 顯示日節奏、長條圖顯示一日內時段分布。

工作量：~10 個 task。沒新表、沒新依賴（除既有 stack 早已決定的 recharts）。複雜度集中在 utility 端 SQL 聚合 + renderer 端 CSS grid 排版。

## Goals / Non-Goals

**Goals:**

- 53 週日歷 heatmap，**單一活動指標** = `keydown + mousedown` 加總（不含 mousemove），色階 5 級
- 24 小時長條圖（最近 7 天聚合），快速看出工作高峰時段
- 純 SQL 聚合查詢，**不引入 daily_app_stats rollup**（v1 events 表行數還小，full scan 在毫秒級）
- renderer 元件可獨立給未來 dashboard 重排版位移用
- 所有資料都來自既有 events 表，**zero schema migration**

**Non-Goals:**

- 設定 UI 改視窗大小（v1 寫死，覺得不夠再加）
- per-app 拆分視角（heatmap 是整體節奏概念，per-app top-N 在 v2 dashboard 才談）
- 匯出 PNG / 分享連結（v2）
- 點擊 cell drill-down 看單日詳情（v2）
- 跨時區 / DST 處理（依賴 SQLite localtime，Hsin 不跨時區搬遷）
- 互動式 brush / zoom / range slider（過度設計，v1 預設視窗夠用）

## Decisions

### 「活動」單位 = `keydown + mousedown`，排除 mousemove

mousemove 是「使用者有沒有開機 / 有沒有把手放鍵盤上」的訊號，每分鐘可達數百次。直接把它加進活動量會碾壓 keydown + mousedown 訊號（後者每分鐘往往只有 0~50）。對 heatmap「我今天有多忙」「我幾點最有產出」這個語意，**鍵盤打字 + 滑鼠點擊** 才是真正的「主動互動」訊號。

mouse_distance 同理排除（與 mousemove 強相關）。wheel 數量小，併進 `mousedown` 太雜，**忽略**。

未來如果要做「使用時長 vs 互動強度」雙視角，會分兩個 metric 顯示，本 change 只做一個。

### 色階 5 級 + 動態閾值

GitHub 風 heatmap 的視覺直覺是「越深色越多」。我們不知道使用者每日活動量的絕對值（有人每天 1 萬次、有人 10 萬），所以**閾值動態算**：

- Empty（grey）：count = 0
- Level 1：1 ~ p50（中位數一半）
- Level 2：p50 / 2 ~ p50
- Level 3：p50 ~ p75
- Level 4：> p75

或更簡單版：取最大值 max，等距切 4 段。第一輪先用簡單版，使用者看了覺得不準再調 quantile-based。

**Alternatives 考慮**：
- 寫死絕對閾值 → 否決：跨使用者不通用
- log-scale → 否決：對數理工具不直觀，使用者預期線性

### 純 Tailwind CSS grid（不引 react-calendar-heatmap）

53 週 × 7 天 = 371 個 cells。一個 `<div>` 用 `grid grid-rows-7 grid-flow-col gap-1`，每 cell 一個 `<div>` 帶 background color class。整段 < 50 行。

引 `react-calendar-heatmap` 看起來省事，但：
- 多一個依賴 + bundle size
- 它的 SVG-based rendering 在 dark mode + Tailwind 自訂色系會有 conflict
- 我們需要的功能極簡（cell + tooltip + 顏色），不需要它提供的「click → 高亮週/月」等進階互動

### `<div title="...">` native tooltip 不做 custom popover

每個 cell hover 顯示「2026-04-29: 1234 次」就夠了。custom popover 要 portal、定位、z-index 處理，CSS 量翻倍但體驗差不多。

未來真的要做「點 cell drill down」再升級為 custom popover；現在 native title 夠。

### 24 小時 chart 用 Recharts，不自己畫

Heatmap 是 53×7 規格化 grid，CSS 寫比 SVG library 簡單；但 24 個 bar 的長條圖用 Recharts `BarChart + XAxis + YAxis + Tooltip` 可重用，自己畫 SVG bars + axis 反而比較囉嗦。CLAUDE.md L93 已把 Recharts 列為 stack。本 change 是其首次使用 — 順便把套件實際拉進來。

### SQL 聚合：直接 events 表 group by

Heatmap query：
```sql
SELECT
  date(minute_ts * 60, 'unixepoch', 'localtime') AS day,
  SUM(keydown + mousedown) AS count
FROM events
WHERE minute_ts >= ?
GROUP BY day
ORDER BY day
```

Hourly query：
```sql
SELECT
  CAST(strftime('%H', datetime(minute_ts * 60, 'unixepoch', 'localtime')) AS INTEGER) AS hour,
  SUM(keydown + mousedown) AS count
FROM events
WHERE minute_ts >= ?
GROUP BY hour
ORDER BY hour
```

Events 表預期 row 量級：每分鐘 1~5 rows（per-app），1 年 = 525,600 分鐘 × 平均 2 app = ~1M rows。SQLite full scan + GROUP BY 在毫秒級 handle 1M rows 沒問題。**不需要 daily_app_stats rollup**。

如果未來資料量真的大（多年累積），再加 rollup。CLAUDE.md L106 「每日 rollup 出 daily_app_stats」原本就在計畫，但**屬於效能優化軌道**，不在 v1 必做。

### Refetch interval：5 分鐘

Heatmap / hourly 的資料粒度是「天」與「小時」。renderer 沒必要每秒拉。
- Heatmap：5 分鐘 refetch（5 分鐘內就算今日 count 變幾百次，色階不會跳）
- Hourly：5 分鐘 refetch（同理）

### 元件邊界

- `HeatmapCalendar`：input prop = `{ data: { date: string; count: number }[]; weeks: number }`，內部處理 cells 排版 + 色階。**stateless，純 view**
- `HourlyChart`：input prop = `{ data: { hour: number; count: number }[] }`，內部 Recharts wrapper

App.tsx 端負責 query data + 傳入 props。元件本身不打 tRPC。**這讓元件容易單測**（CLAUDE.md L182 testability 待辦的精神）。

## Risks / Trade-offs

- **時區跳變 / DST**：依賴 SQLite localtime，與 pomodoro streak 算法一致。Hsin 不跨時區搬遷 → 接受
- **大量歷史資料時 query 變慢**：events 表跨數年後 GROUP BY 可能慢於 100ms。Mitigation：未來加 daily_app_stats rollup（CLAUDE.md L106 已標）；本 change 不做，因 v1 階段 row 數還小
- **動態色階閾值不穩定**：新使用者前幾天閾值會劇烈跳動（max 從 100 → 10000），cell 色階會變。**接受**，使用者一週後資料量穩定後就 stable
- **Empty cells 與「未來」cells 混淆**：53 週 grid 含未來日期 → 顯示為 empty grey，視覺上跟「過去無活動的日子」一樣。Mitigation：**未來日期不算進 cells**，從今日往前推 53×7 = 371 天回填。這樣 grid 起點不總是星期一，但 GitHub heatmap 也是這樣
- **Recharts bundle size**：~70KB minified gzipped，可接受。本 change 是它首次引入，後續 v1 / v2 圖表都會用到 — 攤平投資
- **「活動」定義使用者可能不同意**：keydown + mousedown 是我設計選擇，使用者可能想看 mouseDistance 或單純 keydown。**接受 v1 寫死**，使用者反饋後 v2 可加切換
