import { initTRPC } from '@trpc/server';
import type { Tracker } from './tracker';

const t = initTRPC.create({ isServer: true });

export function createRouter(tracker: Tracker) {
  return t.router({
    stats: t.procedure.query(() => tracker.getStats()),
  });
}

export type AppRouter = ReturnType<typeof createRouter>;
