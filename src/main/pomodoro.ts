import { Notification } from 'electron';
import type { PomodoroSessionType } from '../shared/storage-protocol';
import type { SettingsStore } from './settings-store';
import type { Storage } from './storage';

export type PomodoroPhase = 'idle' | 'work' | 'break';

export type PomodoroState = {
  phase: PomodoroPhase;
  paused: boolean;
  remainingSec: number;
  plannedSec: number;
};

export type PomodoroSettings = {
  workMin: number;
  breakMin: number;
  notifyWorkEnd: boolean;
  notifyBreakEnd: boolean;
};

export const DEFAULT_POMODORO_SETTINGS: PomodoroSettings = {
  workMin: 25,
  breakMin: 5,
  notifyWorkEnd: true,
  notifyBreakEnd: true,
};

export function validatePomodoroSettings(raw: unknown): PomodoroSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    workMin:
      typeof r['workMin'] === 'number' &&
      Number.isInteger(r['workMin']) &&
      r['workMin'] > 0 &&
      r['workMin'] <= 180
        ? r['workMin']
        : DEFAULT_POMODORO_SETTINGS.workMin,
    breakMin:
      typeof r['breakMin'] === 'number' &&
      Number.isInteger(r['breakMin']) &&
      r['breakMin'] > 0 &&
      r['breakMin'] <= 60
        ? r['breakMin']
        : DEFAULT_POMODORO_SETTINGS.breakMin,
    notifyWorkEnd:
      typeof r['notifyWorkEnd'] === 'boolean'
        ? r['notifyWorkEnd']
        : DEFAULT_POMODORO_SETTINGS.notifyWorkEnd,
    notifyBreakEnd:
      typeof r['notifyBreakEnd'] === 'boolean'
        ? r['notifyBreakEnd']
        : DEFAULT_POMODORO_SETTINGS.notifyBreakEnd,
  };
}

export type PomodoroDeps = {
  storage: Pick<Storage, 'recordPomodoroSession'>;
  settingsStore: SettingsStore<PomodoroSettings>;
  onNotificationClick?: () => void;
};

export type Pomodoro = {
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  skipBreak: () => void;
  getState: () => PomodoroState;
  getSettings: () => PomodoroSettings;
  updateSettings: (s: PomodoroSettings) => void;
};

export function createPomodoro(deps: PomodoroDeps): Pomodoro {
  type Internal = {
    phase: PomodoroPhase;
    paused: boolean;
    plannedSec: number;
    startedAtMs: number;
    endTsMs: number;
    pausedAtMs: number | null;
    phaseEndTimer: ReturnType<typeof setTimeout> | null;
  };

  const internal: Internal = {
    phase: 'idle',
    paused: false,
    plannedSec: 0,
    startedAtMs: 0,
    endTsMs: 0,
    pausedAtMs: null,
    phaseEndTimer: null,
  };

  function clearTimer(): void {
    if (internal.phaseEndTimer !== null) {
      clearTimeout(internal.phaseEndTimer);
      internal.phaseEndTimer = null;
    }
  }

  function remainingSec(): number {
    if (internal.phase === 'idle') return 0;
    if (internal.paused && internal.pausedAtMs !== null) {
      return Math.max(0, Math.ceil((internal.endTsMs - internal.pausedAtMs) / 1000));
    }
    return Math.max(0, Math.ceil((internal.endTsMs - Date.now()) / 1000));
  }

  function transitionToIdle(): void {
    clearTimer();
    internal.phase = 'idle';
    internal.paused = false;
    internal.plannedSec = 0;
    internal.startedAtMs = 0;
    internal.endTsMs = 0;
    internal.pausedAtMs = null;
  }

  function startPhase(phase: 'work' | 'break', plannedSec: number): void {
    const now = Date.now();
    internal.phase = phase;
    internal.paused = false;
    internal.plannedSec = plannedSec;
    internal.startedAtMs = now;
    internal.endTsMs = now + plannedSec * 1000;
    internal.pausedAtMs = null;
    schedulePhaseEnd(plannedSec * 1000);
  }

  function schedulePhaseEnd(ms: number): void {
    clearTimer();
    internal.phaseEndTimer = setTimeout(onPhaseEnd, Math.max(0, ms));
  }

  function emitNotification(endingPhase: 'work' | 'break', breakMin?: number): void {
    const isWorkEnd = endingPhase === 'work';
    const notification = new Notification({
      title: 'key-trace',
      body: isWorkEnd
        ? `工作 session 完成，休息 ${breakMin ?? 5} 分鐘`
        : '休息結束，回來工作吧',
    });
    notification.on('click', () => {
      if (deps.onNotificationClick) deps.onNotificationClick();
    });
    notification.show();
  }

  function onPhaseEnd(): void {
    if (internal.phase === 'idle') return;
    const phase = internal.phase as 'work' | 'break';
    const settings = deps.settingsStore.get();
    const endedAtMs = Date.now();
    // 自然結束：actualSec 必為 plannedSec（remainingSec 已歸零）
    const actualSec = internal.plannedSec;

    deps.storage.recordPomodoroSession({
      startedAt: internal.startedAtMs,
      endedAt: endedAtMs,
      type: phase as PomodoroSessionType,
      plannedDurationSeconds: internal.plannedSec,
      actualDurationSeconds: actualSec,
      completed: true,
    });

    if (phase === 'work') {
      if (settings.notifyWorkEnd) emitNotification('work', settings.breakMin);
      startPhase('break', settings.breakMin * 60);
    } else {
      if (settings.notifyBreakEnd) emitNotification('break');
      transitionToIdle();
    }
  }

  function start(): void {
    if (internal.phase !== 'idle') {
      throw new Error('pomodoro: cannot start when phase is not idle');
    }
    const settings = deps.settingsStore.get();
    startPhase('work', settings.workMin * 60);
  }

  function pause(): void {
    if (internal.phase === 'idle') {
      throw new Error('pomodoro: cannot pause when idle');
    }
    if (internal.paused) {
      throw new Error('pomodoro: already paused');
    }
    internal.paused = true;
    internal.pausedAtMs = Date.now();
    clearTimer();
  }

  function resume(): void {
    if (internal.phase === 'idle') {
      throw new Error('pomodoro: cannot resume when idle');
    }
    if (!internal.paused || internal.pausedAtMs === null) {
      throw new Error('pomodoro: not paused');
    }
    const now = Date.now();
    // 把暫停期間延伸到 endTsMs，遠端 remainingSec 不變
    internal.endTsMs += now - internal.pausedAtMs;
    internal.paused = false;
    internal.pausedAtMs = null;
    schedulePhaseEnd(internal.endTsMs - now);
  }

  function stop(): void {
    if (internal.phase === 'idle') return;
    const phase = internal.phase as 'work' | 'break';
    const endedAtMs = Date.now();
    // 中途停：actualSec = plannedSec - 還剩多少（涵蓋 paused 與運行中兩種情境）
    const actualSec = Math.max(0, internal.plannedSec - remainingSec());

    deps.storage.recordPomodoroSession({
      startedAt: internal.startedAtMs,
      endedAt: endedAtMs,
      type: phase as PomodoroSessionType,
      plannedDurationSeconds: internal.plannedSec,
      actualDurationSeconds: actualSec,
      completed: false,
    });

    transitionToIdle();
  }

  function skipBreak(): void {
    if (internal.phase !== 'break') {
      throw new Error('pomodoro: skipBreak only valid during break phase');
    }
    transitionToIdle();
  }

  function getState(): PomodoroState {
    return {
      phase: internal.phase,
      paused: internal.paused,
      remainingSec: remainingSec(),
      plannedSec: internal.plannedSec,
    };
  }

  function getSettings(): PomodoroSettings {
    return deps.settingsStore.get();
  }

  function updateSettings(s: PomodoroSettings): void {
    deps.settingsStore.set(validatePomodoroSettings(s));
  }

  return {
    start,
    pause,
    resume,
    stop,
    skipBreak,
    getState,
    getSettings,
    updateSettings,
  };
}
