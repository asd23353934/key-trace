import { trpc } from '../trpc';

function formatMmSs(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function phaseLabel(phase: 'idle' | 'work' | 'break'): string {
  if (phase === 'work') return '工作中';
  if (phase === 'break') return '休息中';
  return '待機';
}

export function PomodoroCard() {
  const utils = trpc.useContext();
  const stateQuery = trpc.pomodoro.getState.useQuery(undefined, {
    refetchInterval: 1000,
  });

  function invalidateState(): void {
    void utils.pomodoro.getState.invalidate();
  }
  function invalidateAll(): void {
    void utils.pomodoro.getState.invalidate();
    void utils.pomodoro.getStats.invalidate();
  }

  const startMutation = trpc.pomodoro.start.useMutation({ onSuccess: invalidateAll });
  const pauseMutation = trpc.pomodoro.pause.useMutation({ onSuccess: invalidateState });
  const resumeMutation = trpc.pomodoro.resume.useMutation({ onSuccess: invalidateState });
  const stopMutation = trpc.pomodoro.stop.useMutation({ onSuccess: invalidateAll });
  const skipMutation = trpc.pomodoro.skipBreak.useMutation({ onSuccess: invalidateAll });

  if (stateQuery.isLoading || !stateQuery.data) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-zinc-500">
        loading…
      </div>
    );
  }

  const { phase, paused, remainingSec, plannedSec } = stateQuery.data;
  const isIdle = phase === 'idle';
  const isBreak = phase === 'break';

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
      <div className="flex items-baseline justify-between">
        <div className="text-xs uppercase tracking-wider text-zinc-500">
          {phaseLabel(phase)}
          {paused ? ' · 暫停中' : ''}
        </div>
        <div className="text-xs text-zinc-600">
          {isIdle ? '—' : `預計 ${Math.round(plannedSec / 60)} 分鐘`}
        </div>
      </div>

      <div className="my-4 text-center text-6xl font-semibold tabular-nums text-zinc-100">
        {isIdle ? '--:--' : formatMmSs(remainingSec)}
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {isIdle && (
          <Button
            onClick={() => startMutation.mutate()}
            disabled={startMutation.isLoading}
            primary
          >
            開始
          </Button>
        )}
        {!isIdle && !paused && (
          <Button
            onClick={() => pauseMutation.mutate()}
            disabled={pauseMutation.isLoading}
          >
            暫停
          </Button>
        )}
        {!isIdle && paused && (
          <Button
            onClick={() => resumeMutation.mutate()}
            disabled={resumeMutation.isLoading}
            primary
          >
            繼續
          </Button>
        )}
        {!isIdle && (
          <Button
            onClick={() => stopMutation.mutate()}
            disabled={stopMutation.isLoading}
            danger
          >
            停止
          </Button>
        )}
        {isBreak && (
          <Button
            onClick={() => skipMutation.mutate()}
            disabled={skipMutation.isLoading}
          >
            跳過休息
          </Button>
        )}
      </div>
    </div>
  );
}

function Button({
  children,
  onClick,
  primary,
  danger,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  let className =
    'rounded-md border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50';
  if (primary) {
    className =
      'rounded-md border border-emerald-700 bg-emerald-700 px-4 py-2 text-sm text-emerald-50 hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50';
  } else if (danger) {
    className =
      'rounded-md border border-red-800 bg-red-900/40 px-4 py-2 text-sm text-red-200 hover:bg-red-900/70 disabled:cursor-not-allowed disabled:opacity-50';
  }
  return (
    <button type="button" className={className} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
