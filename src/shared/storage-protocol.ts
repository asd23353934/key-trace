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

export type HeatmapDailyRow = {
  date: string;
  count: number;
};

export type HourlyDistributionRow = {
  hour: number;
  count: number;
};

export type MainToUtilityMessage =
  | { type: 'bucket'; payload: BucketPayload }
  | { type: 'queryTotalToday'; requestId: string }
  | { type: 'queryHeatmapDaily'; requestId: string; payload: { weeks: number } }
  | {
      type: 'queryHourlyDistribution';
      requestId: string;
      payload: { days: number };
    };

export type UtilityToMainMessage =
  | { type: 'ready' }
  | { type: 'queryTotalTodayResult'; requestId: string; payload: TodayTotals }
  | {
      type: 'queryHeatmapDailyResult';
      requestId: string;
      payload: HeatmapDailyRow[];
    }
  | {
      type: 'queryHourlyDistributionResult';
      requestId: string;
      payload: HourlyDistributionRow[];
    }
  | { type: 'error'; requestId: string; payload: { message: string } };
