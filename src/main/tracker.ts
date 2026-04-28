import { activeWindow } from 'get-windows';
import { startHooks, stopHooks } from './hooks';
import type { Storage } from './storage';
import type { AppDelta } from '../shared/storage-protocol';

export type Stats = {
  startedAt: number;
  keydown: number;
  mousedown: number;
  mousemove: number;
  wheel: number;
  mouseDistance: number;
  activeApp: string | null;
  activeTitle: string | null;
};

export type TrackerOptions = {
  captureTitle?: boolean;
  appBlacklist?: readonly string[];
};

export type Tracker = {
  start: () => void;
  stop: () => void;
  getStats: () => Stats;
};

const ACTIVE_WINDOW_POLL_MS = 5000;
const FLUSH_INTERVAL_MS = 60_000;
// 多螢幕切窗或 RDP 拉動瞬間 dx/dy 會跳幾千 px，超過此值視為非真實移動，不計入距離
const MAX_MOUSE_DELTA_PX = 4000;

function emptyDelta(): AppDelta {
  return { keydown: 0, mousedown: 0, mousemove: 0, wheel: 0, mouseDistance: 0 };
}

function addDelta(into: AppDelta, from: AppDelta): void {
  into.keydown += from.keydown;
  into.mousedown += from.mousedown;
  into.mousemove += from.mousemove;
  into.wheel += from.wheel;
  into.mouseDistance += from.mouseDistance;
}

export function createTracker(
  options: TrackerOptions = {},
  storage?: Pick<Storage, 'flushBucket'>,
): Tracker {
  const captureTitle = options.captureTitle ?? false;
  const blacklist = new Set(options.appBlacklist ?? []);

  // 已 flush 過的累計 + 還在 pending 的，是 live stats 的單一來源；活窗 / 標題另外維護
  const sessionTotals: AppDelta = emptyDelta();
  const pendingDeltas = new Map<string, AppDelta>();
  let activeApp: string | null = null;
  let activeTitle: string | null = null;
  let startedAt = 0;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let flushTimer: ReturnType<typeof setInterval> | null = null;
  let started = false;
  let pollErrorReported = false;

  function getOrCreateDelta(): AppDelta | null {
    if (!activeApp) return null; // null = blacklisted 或尚未 poll，事件整顆丟掉（隱私 + 一致性）
    let delta = pendingDeltas.get(activeApp);
    if (!delta) {
      delta = emptyDelta();
      pendingDeltas.set(activeApp, delta);
    }
    return delta;
  }

  async function pollActiveWindow(): Promise<void> {
    try {
      const win = await activeWindow();
      const appName = win?.owner?.name ?? null;
      if (appName && blacklist.has(appName)) {
        activeApp = null;
        activeTitle = null;
        return;
      }
      activeApp = appName;
      activeTitle = captureTitle ? (win?.title ?? null) : null;
    } catch (err) {
      if (!pollErrorReported) {
        pollErrorReported = true;
        console.warn(
          '[tracker] active-window poll failed (macOS may need Accessibility permission):',
          err,
        );
      }
    }
  }

  function flush(): void {
    if (pendingDeltas.size === 0) return;
    if (storage) {
      const perApp: Record<string, AppDelta> = {};
      for (const [app, delta] of pendingDeltas) {
        perApp[app] = delta;
        addDelta(sessionTotals, delta);
      }
      storage.flushBucket({
        minuteTs: Math.floor(Date.now() / 60_000),
        perApp,
      });
    } else {
      // 沒接 storage（測試 / 無持久化模式）也要把累計併進去，避免 live stats 歸零
      for (const delta of pendingDeltas.values()) {
        addDelta(sessionTotals, delta);
      }
    }
    pendingDeltas.clear();
  }

  function start(): void {
    if (started) return;
    startedAt = Date.now();

    try {
      startHooks({
        onKey: () => {
          const d = getOrCreateDelta();
          if (d) d.keydown++;
        },
        onMouseClick: () => {
          const d = getOrCreateDelta();
          if (d) d.mousedown++;
        },
        onMouseMove: ({ dx, dy }) => {
          const d = getOrCreateDelta();
          if (!d) return;
          d.mousemove++;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < MAX_MOUSE_DELTA_PX) {
            d.mouseDistance += distance;
          }
        },
        onWheel: () => {
          const d = getOrCreateDelta();
          if (d) d.wheel++;
        },
      });
    } catch (err) {
      console.error('[tracker] failed to start uiohook:', err);
      return;
    }

    started = true;
    pollTimer = setInterval(() => {
      void pollActiveWindow();
    }, ACTIVE_WINDOW_POLL_MS);
    void pollActiveWindow();

    flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);
  }

  function stop(): void {
    if (!started) return;
    started = false;
    stopHooks();
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (flushTimer) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
    flush();
  }

  function getStats(): Stats {
    const totals: AppDelta = { ...sessionTotals };
    for (const delta of pendingDeltas.values()) {
      addDelta(totals, delta);
    }
    return {
      startedAt,
      keydown: totals.keydown,
      mousedown: totals.mousedown,
      mousemove: totals.mousemove,
      wheel: totals.wheel,
      mouseDistance: totals.mouseDistance,
      activeApp,
      activeTitle,
    };
  }

  return { start, stop, getStats };
}
