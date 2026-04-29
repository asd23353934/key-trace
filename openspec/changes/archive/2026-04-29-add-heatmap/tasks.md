## 1. utility 端 SQL 聚合（涵蓋 Daily Heatmap Query、Hourly Distribution Query；落實「SQL 聚合：直接 events 表 group by」「「活動」單位 = `keydown + mousedown`，排除 mousemove」決議）

- [x] 1.1 落實 Daily Heatmap Query requirement：在 `src/utility/index.ts` 加 `heatmapDailyStmt` prepared statement：`SELECT date(minute_ts*60,'unixepoch','localtime') AS day, SUM(keydown+mousedown) AS count FROM events WHERE minute_ts >= ? GROUP BY day ORDER BY day`（mousemove / wheel / mouse_distance 不計入，符合「活動」單位 = `keydown + mousedown`，排除 mousemove 的決議）
- [x] 1.2 落實 Hourly Distribution Query requirement：加 `hourlyDistributionStmt`：`SELECT CAST(strftime('%H', datetime(minute_ts*60,'unixepoch','localtime')) AS INTEGER) AS hour, SUM(keydown+mousedown) AS count FROM events WHERE minute_ts >= ? GROUP BY hour ORDER BY hour`
- [x] 1.3 加 reader 函式 `readHeatmapDaily(weeks: number): HeatmapDailyRow[]`、`readHourlyDistribution(days: number): HourlyDistributionRow[]`，後者要把 SQL 結果（可能少於 24 列）填補成 24 entries `{ hour: 0..23, count: 0 }`
- [x] 1.4 在 message handler 加 `queryHeatmapDaily` / `queryHourlyDistribution` 兩個訊息分支，回 `queryHeatmapDailyResult` / `queryHourlyDistributionResult`

## 2. 共用 protocol（`src/shared/storage-protocol.ts`）

- [x] 2.1 加型別 `HeatmapDailyRow = { date: string; count: number }`、`HourlyDistributionRow = { hour: number; count: number }`；擴 `MainToUtilityMessage` union 加 `queryHeatmapDaily` / `queryHourlyDistribution` variants（payload 含 weeks / days）；擴 `UtilityToMainMessage` 加對應 result variants（payload 為 row array）

## 3. main 端 storage 橋（`src/main/storage.ts`）

- [x] 3.1 在 `Storage` 介面加 `queryHeatmapDaily(weeks: number)` 與 `queryHourlyDistribution(days: number)` 兩個 Promise 方法；對應 child.on('message') handler 加兩個 result settle 分支；用既有 rpcQuery helper

## 4. tRPC router（`src/main/router.ts`）

- [x] 4.1 在 `historical` namespace 加 `heatmapDaily` query 帶 zod input `{ weeks: z.number().int().min(1).max(104) }`、`hourlyDistribution` query 帶 zod input `{ days: z.number().int().min(1).max(365) }`；invalid 走 `TRPCError BAD_REQUEST`，落實 tRPC API Surface requirement 的兩個 reject scenarios

## 5. renderer Heatmap Calendar Component（落實「色階 5 級 + 動態閾值」「純 Tailwind CSS grid（不引 react-calendar-heatmap）」「`<div title="...">` native tooltip 不做 custom popover」決議）

- [x] 5.1 新建 `src/renderer/src/components/HeatmapCalendar.tsx`，落實 Heatmap Calendar Component requirement：純函式元件，input prop `{ data: HeatmapDailyRow[]; weeks: number }`，內部建 53×7（或 weeks×7）grid；色階 5 級 動態閾值（取資料 max 等距切 4 + empty=0）；每 cell `<div className="bg-...">` + `title` attribute 顯示日期 + count；元件 stateless 不打 tRPC

## 6. renderer Hourly Chart Component（落實「24 小時 chart 用 Recharts，不自己畫」決議）

- [x] 6.1 新建 `src/renderer/src/components/HourlyChart.tsx`，落實 Hourly Chart Component requirement：用 Recharts `<BarChart>` + `<XAxis dataKey='hour'>` + `<YAxis>` + `<Tooltip>` + `<Bar dataKey='count'>`；input prop `{ data: HourlyDistributionRow[] }`；元件 stateless

## 7. App.tsx 整合（落實「元件邊界」「Refetch interval：5 分鐘」決議；同時涵蓋 Privacy Invariant — 整合層不該回傳超過 spec 規定的欄位給 renderer）

- [x] 7.1 在 `src/renderer/src/App.tsx` 加兩個 useQuery：`trpc.historical.heatmapDaily.useQuery({ weeks: 53 }, { refetchInterval: 300_000 })` 與 `trpc.historical.hourlyDistribution.useQuery({ days: 7 }, { refetchInterval: 300_000 })`。回傳資料只含 `{ date, count }` / `{ hour, count }`，符合 Privacy Invariant requirement（不含 app_name、視窗標題、per-key 資料）
- [x] 7.2 加兩個新 Section「活動 heatmap（過去一年）」包 `<HeatmapCalendar>`、「一日週期分析（過去 7 天）」包 `<HourlyChart>`；放在「今日總計（DB）」section 之後

## 8. 安裝 Recharts 依賴

- [x] 8.1 `npm install recharts --save`（CLAUDE.md L84 已列為「圖表底層」，本次首次正式引入）；確認版本走 `npm view` 驗證且與 React 19 相容

## 9. 驗證

- [x] 9.1 跑 `npm run typecheck` 全綠
- [x] 9.2 跑 `npm run build` 全綠（main / preload / utility / renderer 四 bundle，renderer bundle size 因 recharts 增加 ~70KB gzipped）
- [x] 9.3 跑 `npm run e2e:smoke`：擴 IPC test 加測 `historical.heatmapDaily` / `historical.hourlyDistribution`；確認回傳 array 結構正確；HeatmapCalendar + HourlyChart DOM 有渲染
- [ ] 9.4 實機驗（`npm run dev`）：(a) 打開 dashboard 看到 heatmap section 與 hourly chart；(b) heatmap 至少今日 cell 應有顏色（前提是 events 表有今日資料）；(c) hourly chart 顯示 24 bars 高度反映過去 7 天每小時活動量
