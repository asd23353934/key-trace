## Context

key-trace 已有 walking skeleton（A1）+ storage pipeline（A2）。本 change 是 v1 第一個差異化功能，啟動「功能堆疊」階段。設計重點：番茄鐘需要「視窗關了還在跑」（背景計時器）、跨日 streak 計算（時區邊界處理）、與既有 main/utility/renderer 三進程分工對齊。沒有外部依賴增加。

## Goals / Non-Goals

**Goals:**

- main 進程持有計時狀態，renderer 視窗關閉計時不中斷（既有「關視窗縮 tray」設定的延伸）
- 完成的 work session 持久化到 SQLite，跨 app 重啟後 streak 仍可算
- 提供桌面通知（work 完成、break 完成）讓使用者不必盯著 UI
- 設定（work / break 時長、通知開關）持久化到 electron-store
- streak 計算簡單可預測，使用者眼睛看時間就能算出明天還會不會斷
- 與既有 storage pipeline 共存，schema 演進不破壞現有 events 表

**Non-Goals:**

- 自訂 streak 規則（v2，例：週末免責、寬限日）
- pomodoro 與專案 / 任務 tagging 整合（v2）
- 自動偵測該開 pomodoro（v2）
- 跨裝置同步 pomodoro 紀錄（CLAUDE.md 全專案決策：本機為主）
- 複雜的 work-too-long 警告 / pomodoro 樹模式（保持簡單）
- 中途暫停的時段是否計入「今日完成」（一律不計，僅 completed=1 才算）

## Decisions

### 計時狀態持有於 main 進程

**選 main，不選 utility 或 renderer。** main 已是 tray / 系統整合中心，天然支援背景常駐；renderer 視窗可能被使用者關閉、或被 macOS 暫停；utility 是純運算進程，不適合長時間倒數。renderer 透過 tRPC 1 秒輪詢 `pomodoro.getState` 拿到剩餘秒數即可，用既有 TanStack Query 機制。

**Alternatives 考慮**：
- renderer 持有 → 否決：視窗關閉就停
- utility 持有 → 否決：utility 該專注 SQLite，引入 setInterval 計時器與 IPC 反向通知 main 觸發 Notification 太繞

### 狀態機：idle / work / break + paused 標記

**三個 phase + 一個 paused 旗標**，而非把 paused 當第四個 phase。理由：暫停只是「停止倒數」，不改變語意上「正在做什麼」。狀態機如下：

```
idle ──start work──> work ──work timer expires──> break ──break timer expires──> idle
            │                  │                           │
            └─stop─────────────┴──skipBreak────────────────┘
                                                            ↑
                                                            └─stop── any phase

任何 phase 可疊 paused=true（pause）；resume 把 paused 設回 false。
```

對外暴露：`{ phase: 'idle' | 'work' | 'break', paused: boolean, remainingSec: number, plannedSec: number }`。

### 計時資料結構（main 端）

不存 `setInterval` 倒數，存「結束的絕對時間戳 + 已暫停累計秒數」。每次 `getState` 查詢時計算 `remainingSec = (endTs - now) - pausedAccumulatedMs`。理由：避免時鐘漂移（setInterval 在系統 sleep 後不準）+ 暫停 / 恢復計算簡單。timer 用 `setTimeout(onPhaseEnd, remainingMs)` 在 work / break 結束時觸發狀態轉換 + 通知 + 落盤；pause 時 clearTimeout，resume 時重新 setTimeout 用剩餘 ms。

### 完成判定 + 落盤策略

work session 走完 `setTimeout` 觸發的 `onPhaseEnd` → 視為 completed=1 落盤，含 `started_at` / `ended_at` / `planned_duration_seconds` / `actual_duration_seconds`（兩者一致）。使用者中途按 `stop`：completed=0 落盤（保留紀錄但 streak 不算）。break session 同樣模式但 streak 計算只看 work。

skipBreak：即時結束 break 不落盤（break 本就不計 streak），等同 stop break。

App 關閉中正在跑的 session：main 進程被 `before-quit` / `will-quit` 終止，**不嘗試恢復**。考量：(a) 簡單；(b) 使用者重開 app 時序狀態不明確，硬恢復反而誤導。trade-off 接受。

### Streak 算法（utility 端）

定義：「**包含今天在內，往回連續 N 個 calendar day（local timezone），每天至少有一筆 completed=1 的 work session**」，N 即 streak 長度。今天還沒完成不會打斷 streak（給寬限）；昨天沒有就斷成 0（從今天的完成算起）。

SQL（utility process）：

```sql
SELECT date(started_at / 1000, 'unixepoch', 'localtime') AS day
FROM pomodoro_sessions
WHERE type = 'work' AND completed = 1
GROUP BY day
ORDER BY day DESC;
```

從結果 row 1 起往下走，若該 row 的 day 等於「今天 - i 天」（i 從 0 起），streak++；若等於「今天 - 1 天」則繼續累計（今天空集合不打斷）；遇到斷層即停。**utility 端用 JS 算迴圈**，不在 SQL 內遞迴。

**Alternatives 考慮**：
- 純 SQL 算 streak（CTE）→ 否決：可讀性差，遇到時區邊界除錯困難
- 用「7 日工作日」抽象 → 否決，個人工具，calendar day 簡單

### 通知策略

每個 phase 結束（work / break）→ Electron Notification API。使用者可在設定關閉「work end」與「break end」兩種通知（電子-store 持久化）。標題簡短、body 顯示「該休息 5 分鐘」之類具體資訊。**不**做聲音（v1 簡化）。

`work end` 通知點擊 → 開啟 / 聚焦 main window（既有 `focusMainWindow`）。

### 設定持久化

設定 `{ workMin, breakMin, notifyWorkEnd, notifyBreakEnd }`（預設 `{ 25, 5, true, true }`）以 JSON 檔形式存於 `app.getPath('userData')` 下的 `pomodoro-settings.json`，透過 `src/main/settings-store.ts`（自寫的小工具，~40 行 fs + JSON + 型別驗證）讀寫。renderer 設定頁讀寫透過新 tRPC procedures `pomodoro.getSettings` / `pomodoro.updateSettings`。本 change 不做設定 UI（先用預設），把 mutation / query 端先佈好；UI 在後續 change 加。

**為什麼不用 `electron-store`（與最初提案偏離的理由）**：electron-store v9+ 全是 ESM-only 模組，與本專案 main 進程的 CommonJS + `externalizeDepsPlugin` 設定衝突（require ESM 套件會 throw `ERR_REQUIRE_ESM`）。三個替代選項（自寫 fs+JSON / main 改 ESM / 退到 v8）權衡後選自寫：成本最低（30~40 行），不引入新依賴，不動 build pipeline；換掉的代價是少了 electron-store 的 watch / change events，但本 change 不需要那些。

**注意**：CLAUDE.md 的「未來品質 / DX 待辦」第 7 條提到「Stats payload 體積」，pomodoro state 含倒數秒數每秒會變，所以 1 秒輪詢必要、但 payload 維持小（< 100 bytes）。

### Schema 命名與 index

新表 `pomodoro_sessions`：

```sql
CREATE TABLE IF NOT EXISTS pomodoro_sessions (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at               INTEGER NOT NULL,
  ended_at                 INTEGER NOT NULL,
  type                     TEXT NOT NULL CHECK(type IN ('work','break')),
  planned_duration_seconds INTEGER NOT NULL,
  actual_duration_seconds  INTEGER NOT NULL,
  completed                INTEGER NOT NULL CHECK(completed IN (0,1))
);
CREATE INDEX IF NOT EXISTS idx_pomodoro_started ON pomodoro_sessions (started_at);
```

`started_at` / `ended_at` 為 Unix epoch ms（與 events 表 `minute_ts` 為 epoch minute 對齊單位）。utility 啟動時 `db.exec` 同 events 表一起跑；既有 events 表不動。

## Risks / Trade-offs

- **App 關閉導致進行中 session 丟失** → 設計上接受。Mitigation：UI 顯示「app 關閉會中斷未完成 session」提示，給使用者預期。
- **時鐘調整 / 系統休眠後計時偏差** → 用「結束絕對時間戳」而非 `setInterval` 累加可緩解；但若系統休眠，`setTimeout` 會延遲觸發 → 結束時 `Date.now()` 已超過預期 endTs，把 actual_duration_seconds 寫實際差值。**接受**（極端情境，使用者重開系統再重啟 timer 即可）。
- **pomodoro 與既有 tracker 分屬不同 module** → 沒共享 active app context，pomodoro 不知道使用者在哪個 app 工作。本 change 不串。Future：v2 把 pomodoro 完成 record 串 active app top-N。
- **streak SQL 使用 SQLite localtime** → 依賴使用者本機時區設定。若使用者跨時區搬遷，過去紀錄的 day 會位移。Mitigation：v1 不解（個人工具）；v2 若做雲端同步必須改存 IANA timezone。
- **`pomodoro_sessions` 表遺漏 schema migration 系統** → 目前 utility/index.ts 用 `CREATE TABLE IF NOT EXISTS` 處理新表，但**沒有 migration 機制**。未來改 schema 會有問題。**本 change 不修**（已存在問題），但寫進「未來品質 / DX 待辦」list（CLAUDE.md）。
- **renderer 1 秒 tRPC 輪詢 + tracker.stats 1 秒輪詢 + historical 5 秒輪詢** → 每秒 2 個 IPC call。當前體量可忽略，但堆功能後可能要切換 tRPC subscription 推送，避免 polling 全開。標為 watch item。
