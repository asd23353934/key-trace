import Database from 'better-sqlite3';
import type {
  AppDelta,
  MainToUtilityMessage,
  PomodoroSessionRecord,
  TodayTotals,
} from '../shared/storage-protocol';

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

  CREATE TABLE IF NOT EXISTS pomodoro_sessions (
    id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at               INTEGER NOT NULL,
    ended_at                 INTEGER NOT NULL,
    type                     TEXT    NOT NULL CHECK(type IN ('work','break')),
    planned_duration_seconds INTEGER NOT NULL,
    actual_duration_seconds  INTEGER NOT NULL,
    completed                INTEGER NOT NULL CHECK(completed IN (0,1))
  );
  CREATE INDEX IF NOT EXISTS idx_pomodoro_started ON pomodoro_sessions (started_at);
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

const applyBucket = db.transaction(
  (minuteTs: number, perApp: Record<string, AppDelta>) => {
    for (const [appName, delta] of Object.entries(perApp)) {
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

const insertPomodoroSession = db.prepare(`
  INSERT INTO pomodoro_sessions (
    started_at, ended_at, type, planned_duration_seconds, actual_duration_seconds, completed
  ) VALUES (@startedAt, @endedAt, @type, @plannedDurationSeconds, @actualDurationSeconds, @completed)
`);

const recordPomodoroSession = db.transaction((session: PomodoroSessionRecord) => {
  insertPomodoroSession.run({
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    type: session.type,
    plannedDurationSeconds: session.plannedDurationSeconds,
    actualDurationSeconds: session.actualDurationSeconds,
    completed: session.completed ? 1 : 0,
  });
});

// 撈每天有過 completed work 的 day key（YYYY-MM-DD，使用者 local timezone），DESC 排
const pomodoroWorkDaysStmt = db.prepare(`
  SELECT DISTINCT date(started_at / 1000, 'unixepoch', 'localtime') AS day
  FROM pomodoro_sessions
  WHERE type = 'work' AND completed = 1
  ORDER BY day DESC
`);

const pomodoroTodayCountStmt = db.prepare(`
  SELECT COUNT(*) AS cnt
  FROM pomodoro_sessions
  WHERE type = 'work' AND completed = 1 AND started_at >= ?
`);

function startOfTodayMinuteTs(): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.floor(now.getTime() / 60_000);
}

function startOfTodayMs(): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
}

function formatLocalDate(d: Date): string {
  // 對齊 SQLite date(..., 'localtime') 的 YYYY-MM-DD 字串格式
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function readTodayTotals(): TodayTotals {
  const row = totalSinceStmt.get(startOfTodayMinuteTs()) as Record<string, unknown>;
  return {
    keydown: Number(row['keydown'] ?? 0),
    mousedown: Number(row['mousedown'] ?? 0),
    mousemove: Number(row['mousemove'] ?? 0),
    wheel: Number(row['wheel'] ?? 0),
    mouseDistance: Number(row['mouseDistance'] ?? 0),
  };
}

function readPomodoroStreak(): number {
  const rows = pomodoroWorkDaysStmt.all() as { day: string }[];
  if (rows.length === 0) return 0;
  const dayDone = new Set(rows.map((r) => r.day));

  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  // 今日已完成 → 計入；今日未完成 → 不打斷，從昨天往回算
  if (dayDone.has(formatLocalDate(cursor))) {
    streak++;
  }
  cursor.setDate(cursor.getDate() - 1);

  while (dayDone.has(formatLocalDate(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function readPomodoroTodayCount(): number {
  const row = pomodoroTodayCountStmt.get(startOfTodayMs()) as Record<string, unknown>;
  return Number(row['cnt'] ?? 0);
}

const parentPort = process.parentPort;
if (!parentPort) {
  throw new Error('process.parentPort missing — utility must be spawned via Electron utilityProcess');
}

parentPort.on('message', (event) => {
  const msg = event.data as MainToUtilityMessage;
  try {
    if (msg.type === 'bucket') {
      applyBucket(msg.payload.minuteTs, msg.payload.perApp);
      return;
    }
    if (msg.type === 'queryTotalToday') {
      parentPort.postMessage({
        type: 'queryTotalTodayResult',
        requestId: msg.requestId,
        payload: readTodayTotals(),
      });
      return;
    }
    if (msg.type === 'recordPomodoroSession') {
      recordPomodoroSession(msg.payload);
      return;
    }
    if (msg.type === 'queryPomodoroStreak') {
      parentPort.postMessage({
        type: 'queryPomodoroStreakResult',
        requestId: msg.requestId,
        payload: { streak: readPomodoroStreak() },
      });
      return;
    }
    if (msg.type === 'queryPomodoroTodayCount') {
      parentPort.postMessage({
        type: 'queryPomodoroTodayCountResult',
        requestId: msg.requestId,
        payload: { count: readPomodoroTodayCount() },
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
