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

export type MainToUtilityMessage =
  | { type: 'bucket'; payload: BucketPayload }
  | { type: 'queryTotalToday'; requestId: string };

export type UtilityToMainMessage =
  | { type: 'ready' }
  | { type: 'queryTotalTodayResult'; requestId: string; payload: TodayTotals }
  | { type: 'error'; requestId: string; payload: { message: string } };
