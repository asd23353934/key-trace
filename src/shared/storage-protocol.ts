/**
 * main ↔ utility process 訊息協議。雙方共用。renderer 不直接 import 此檔
 * （renderer 只透過 tRPC 與 main 對話）。
 */

export type AppDelta = {
  keydown: number;
  mousedown: number;
  mousemove: number;
  wheel: number;
  mouseDistance: number;
};

export type TotalsRow = {
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

// main → utility
export type MainToUtilityMessage =
  | { type: 'bucket'; payload: BucketPayload }
  | { type: 'queryTotalToday'; requestId: string };

// utility → main
export type UtilityToMainMessage =
  | { type: 'ready' }
  | { type: 'queryTotalTodayResult'; requestId: string; payload: TotalsRow }
  | { type: 'error'; requestId: string; payload: { message: string } };
