import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { Storage } from './storage';
import type { SystemIntegration } from './system-integration';
import type { Tracker } from './tracker';

const t = initTRPC.create({ isServer: true });

const systemSettingsInputSchema = z
  .object({
    autoLaunchEnabled: z.boolean(),
    globalShortcutEnabled: z.boolean(),
  })
  .strict();

export function createRouter(
  tracker: Tracker,
  storage: Storage,
  systemIntegration: SystemIntegration,
) {
  return t.router({
    tracker: t.router({
      stats: t.procedure.query(() => tracker.getStats()),
    }),
    historical: t.router({
      totalToday: t.procedure.query(() => storage.queryTotalToday()),
    }),
    system: t.router({
      getSettings: t.procedure.query(() => systemIntegration.getSettings()),
      updateSettings: t.procedure
        .input(systemSettingsInputSchema)
        .mutation(({ input }) => {
          try {
            return systemIntegration.updateSettings(input);
          } catch (err) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: err instanceof Error ? err.message : String(err),
            });
          }
        }),
    }),
  });
}

export type AppRouter = ReturnType<typeof createRouter>;
