export type AppDelta = {
  keydown: number;
  mousedown: number;
  mousemove: number;
  wheel: number;
  mouseDistance: number;
};

export type TodayTotals = {
  keydown: number;
  mousedown: number;
  mousemove: number;
  wheel: number;
  mouseDistance: number;
};

export type BucketPayload = {
  minuteTs: number;
  perApp: Record<string, AppDelta>;
};

export type PomodoroSessionType = 'work' | 'break';

export type PomodoroSessionRecord = {
  startedAt: number;
  endedAt: number;
  type: PomodoroSessionType;
  plannedDurationSeconds: number;
  actualDurationSeconds: number;
  completed: boolean;
};

export type MainToUtilityMessage =
  | { type: 'bucket'; payload: BucketPayload }
  | { type: 'queryTotalToday'; requestId: string }
  | { type: 'recordPomodoroSession'; payload: PomodoroSessionRecord }
  | { type: 'queryPomodoroStreak'; requestId: string }
  | { type: 'queryPomodoroTodayCount'; requestId: string };

export type UtilityToMainMessage =
  | { type: 'ready' }
  | { type: 'queryTotalTodayResult'; requestId: string; payload: TodayTotals }
  | {
      type: 'queryPomodoroStreakResult';
      requestId: string;
      payload: { streak: number };
    }
  | {
      type: 'queryPomodoroTodayCountResult';
      requestId: string;
      payload: { count: number };
    }
  | { type: 'error'; requestId: string; payload: { message: string } };
