import { activeWindow } from 'get-windows';
import { startHooks, stopHooks } from './hooks';

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
// 多螢幕切窗或 RDP 拉動瞬間 dx/dy 會跳幾千 px，超過此值視為非真實移動，不計入距離
const MAX_MOUSE_DELTA_PX = 4000;

export function createTracker(options: TrackerOptions = {}): Tracker {
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
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let started = false;
  let pollErrorReported = false;

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
        // macOS 第一次未授權會走這裡；輸出一次提示後沉默
        console.warn('[tracker] active-window poll failed (macOS may need Accessibility permission):', err);
      }
    }
  }

  function start(): void {
    if (started) return;
    stats.startedAt = Date.now();

    try {
      startHooks({
        onKey: () => {
          stats.keydown++;
        },
        onMouseClick: () => {
          stats.mousedown++;
        },
        onMouseMove: ({ dx, dy }) => {
          stats.mousemove++;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < MAX_MOUSE_DELTA_PX) {
            stats.mouseDistance += distance;
          }
        },
        onWheel: () => {
          stats.wheel++;
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
  }

  function stop(): void {
    if (!started) return;
    started = false;
    stopHooks();
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function getStats(): Stats {
    return stats;
  }

  return { start, stop, getStats };
}
