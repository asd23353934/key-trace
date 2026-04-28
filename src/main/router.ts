import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { Pomodoro } from './pomodoro';
import type { Storage } from './storage';
import type { Tracker } from './tracker';

const t = initTRPC.create({ isServer: true });

const settingsInputSchema = z
  .object({
    workMin: z.number().int().positive().max(180),
    breakMin: z.number().int().positive().max(60),
    notifyWorkEnd: z.boolean(),
    notifyBreakEnd: z.boolean(),
  })
  .strict();

function wrapPomodoroAction(fn: () => void): { ok: true } {
  try {
    fn();
    return { ok: true };
  } catch (err) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

export function createRouter(
  tracker: Tracker,
  storage: Storage,
  pomodoro: Pomodoro,
) {
  return t.router({
    tracker: t.router({
      stats: t.procedure.query(() => tracker.getStats()),
    }),
    historical: t.router({
      totalToday: t.procedure.query(() => storage.queryTotalToday()),
    }),
    pomodoro: t.router({
      getState: t.procedure.query(() => pomodoro.getState()),
      getStats: t.procedure.query(async () => ({
        todayCompleted: await storage.queryPomodoroTodayCount(),
        currentStreak: await storage.queryPomodoroStreak(),
      })),
      getSettings: t.procedure.query(() => pomodoro.getSettings()),
      start: t.procedure.mutation(() => wrapPomodoroAction(() => pomodoro.start())),
      pause: t.procedure.mutation(() => wrapPomodoroAction(() => pomodoro.pause())),
      resume: t.procedure.mutation(() => wrapPomodoroAction(() => pomodoro.resume())),
      stop: t.procedure.mutation(() => wrapPomodoroAction(() => pomodoro.stop())),
      skipBreak: t.procedure.mutation(() =>
        wrapPomodoroAction(() => pomodoro.skipBreak()),
      ),
      updateSettings: t.procedure
        .input(settingsInputSchema)
        .mutation(({ input }) => {
          pomodoro.updateSettings(input);
          return { ok: true };
        }),
    }),
  });
}

export type AppRouter = ReturnType<typeof createRouter>;
