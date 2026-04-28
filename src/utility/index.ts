/**
 * Utility process：背景 SQLite 寫入 + 聚合查詢。
 *
 * 透過 Electron utilityProcess 由 main spawn。與 main 走 `process.parentPort` 訊息通道
 * （Electron 33+ 標配）。所有訊息採 `{ type, requestId?, payload }` 結構，
 * main 端維護 requestId → resolver 的 Map 做 RPC。
 *
 * 隱私底線（同 hooks.ts）：本檔不會寫任何按鍵內容、按鍵時序、按鍵字元。
 * 只儲存「分鐘 bucket × 應用程式 × 計數」聚合。
 */

import Database from 'better-sqlite3';

type AppDelta = {
  keydown: number;
  mousedown: number;
  mousemove: number;
  wheel: number;
  mouseDistance: number;
};

type BucketMessage = {
  type: 'bucket';
  payload: {
    minuteTs: number;
    perApp: Record<string, AppDelta>;
  };
};

type QueryTotalTodayMessage = {
  type: 'queryTotalToday';
  requestId: string;
};

type IncomingMessage = BucketMessage | QueryTotalTodayMessage;

type TotalRow = {
  keydown: number;
  mousedown: number;
  mousemove: number;
  wheel: number;
  mouseDistance: number;
};

const dbPath = process.env['KEYTRACE_DB_PATH'];
if (!dbPath) {
  throw new Error('KEYTRACE_DB_PATH env var is required');
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    minute_ts      INTEGER NOT NULL,
    app_name       TEXT    NOT NULL,
    keydown        INTEGER NOT NULL DEFAULT 0,
    mousedown      INTEGER NOT NULL DEFAULT 0,
    mousemove      INTEGER NOT NULL DEFAULT 0,
    wheel          INTEGER NOT NULL DEFAULT 0,
    mouse_distance REAL    NOT NULL DEFAULT 0,
    PRIMARY KEY (minute_ts, app_name)
  );
  CREATE INDEX IF NOT EXISTS idx_events_minute ON events (minute_ts);
`);

const upsertBucket = db.prepare(`
  INSERT INTO events (minute_ts, app_name, keydown, mousedown, mousemove, wheel, mouse_distance)
  VALUES (@minuteTs, @appName, @keydown, @mousedown, @mousemove, @wheel, @mouseDistance)
  ON CONFLICT (minute_ts, app_name) DO UPDATE SET
    keydown        = keydown        + excluded.keydown,
    mousedown      = mousedown      + excluded.mousedown,
    mousemove      = mousemove      + excluded.mousemove,
    wheel          = wheel          + excluded.wheel,
    mouse_distance = mouse_distance + excluded.mouse_distance
`);

const writeBucket = db.transaction(
  (minuteTs: number, perApp: Record<string, AppDelta>) => {
    for (const appName in perApp) {
      const delta = perApp[appName];
      if (!delta) continue;
      upsertBucket.run({
        minuteTs,
        appName,
        keydown: delta.keydown,
        mousedown: delta.mousedown,
        mousemove: delta.mousemove,
        wheel: delta.wheel,
        mouseDistance: delta.mouseDistance,
      });
    }
  },
);

const totalSinceStmt = db.prepare(`
  SELECT
    COALESCE(SUM(keydown), 0)        AS keydown,
    COALESCE(SUM(mousedown), 0)      AS mousedown,
    COALESCE(SUM(mousemove), 0)      AS mousemove,
    COALESCE(SUM(wheel), 0)          AS wheel,
    COALESCE(SUM(mouse_distance), 0) AS mouseDistance
  FROM events
  WHERE minute_ts >= ?
`);

function startOfTodayMinuteTs(): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.floor(now.getTime() / 60_000);
}

const parentPort = process.parentPort;
if (!parentPort) {
  throw new Error('process.parentPort missing — utility must be spawned via Electron utilityProcess');
}

parentPort.on('message', (event) => {
  const msg = event.data as IncomingMessage;
  try {
    if (msg.type === 'bucket') {
      writeBucket(msg.payload.minuteTs, msg.payload.perApp);
      return;
    }
    if (msg.type === 'queryTotalToday') {
      const row = totalSinceStmt.get(startOfTodayMinuteTs()) as TotalRow;
      parentPort.postMessage({
        type: 'queryTotalTodayResult',
        requestId: msg.requestId,
        payload: row,
      });
      return;
    }
  } catch (err) {
    console.error('[utility] message handler failed:', err);
    if ('requestId' in msg && msg.requestId) {
      parentPort.postMessage({
        type: 'error',
        requestId: msg.requestId,
        payload: { message: err instanceof Error ? err.message : String(err) },
      });
    }
  }
});

parentPort.postMessage({ type: 'ready' });
