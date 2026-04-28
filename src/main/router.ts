import { initTRPC } from '@trpc/server';
import type { Storage } from './storage';
import type { Tracker } from './tracker';

const t = initTRPC.create({ isServer: true });

export function createRouter(tracker: Tracker, storage: Storage) {
  return t.router({
    tracker: t.router({
      stats: t.procedure.query(() => tracker.getStats()),
    }),
    historical: t.router({
      totalToday: t.procedure.query(() => storage.queryTotalToday()),
    }),
  });
}

export type AppRouter = ReturnType<typeof createRouter>;
