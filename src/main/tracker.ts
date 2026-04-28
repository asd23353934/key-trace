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

export function createTracker(
  options: TrackerOptions = {},
  storage?: Pick<Storage, 'flushBucket'>,
): Tracker {
  const captureTitle = options.captureTitle ?? false;
  const blacklist = new Set(options.appBlacklist ?? []);

  const stats: Stats = {
    startedAt: 0,
    keydown: 0,
    mousedown: 0,
    mousemove: 0,
    wheel: 0,
    mouseDistance: 0,
    activeApp: null,
    activeTitle: null,
  };
  const pendingDeltas = new Map<string, AppDelta>();
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let flushTimer: ReturnType<typeof setInterval> | null = null;
  let started = false;
  let pollErrorReported = false;

  function recordPerApp(field: keyof AppDelta, by: number): void {
    const app = stats.activeApp;
    if (!app) return; // null = blacklisted 或尚未 poll；故意不寫進 DB
    let delta = pendingDeltas.get(app);
    if (!delta) {
      delta = emptyDelta();
      pendingDeltas.set(app, delta);
    }
    delta[field] += by;
  }

  async function pollActiveWindow(): Promise<void> {
    try {
      const win = await activeWindow();
      const appName = win?.owner?.name ?? null;
      if (appName && blacklist.has(appName)) {
        stats.activeApp = null;
        stats.activeTitle = null;
        return;
      }
      stats.activeApp = appName;
      stats.activeTitle = captureTitle ? (win?.title ?? null) : null;
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
    if (!storage || pendingDeltas.size === 0) return;
    const perApp: Record<string, AppDelta> = {};
    for (const [app, delta] of pendingDeltas) {
      perApp[app] = { ...delta };
    }
    pendingDeltas.clear();
    storage.flushBucket({
      minuteTs: Math.floor(Date.now() / 60_000),
      perApp,
    });
  }

  function start(): void {
    if (started) return;
    stats.startedAt = Date.now();

    try {
      startHooks({
        onKey: () => {
          stats.keydown++;
          recordPerApp('keydown', 1);
        },
        onMouseClick: () => {
          stats.mousedown++;
          recordPerApp('mousedown', 1);
        },
        onMouseMove: ({ dx, dy }) => {
          stats.mousemove++;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < MAX_MOUSE_DELTA_PX) {
            stats.mouseDistance += distance;
            recordPerApp('mousemove', 1);
            recordPerApp('mouseDistance', distance);
          }
        },
        onWheel: () => {
          stats.wheel++;
          recordPerApp('wheel', 1);
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

    if (storage) {
      flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);
    }
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
    flush(); // 退出前最後一次落盤
  }

  function getStats(): Stats {
    return stats;
  }

  return { start, stop, getStats };
}
