import { trpc } from './trpc';

function formatNumber(n: number): string {
  return new Intl.NumberFormat('zh-Hant').format(Math.round(n));
}

function formatElapsed(startedAt: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function App() {
  const stats = trpc.stats.useQuery(undefined, {
    refetchInterval: 1000,
  });

  if (stats.isLoading || !stats.data) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-400">
        loading…
      </div>
    );
  }

  if (stats.error) {
    return (
      <div className="flex h-full items-center justify-center text-red-400">
        錯誤：{stats.error.message}
      </div>
    );
  }

  const data = stats.data;

  return (
    <div className="flex h-full flex-col gap-6 p-8">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">key-trace</h1>
        <span className="text-sm text-zinc-500">
          已運行 {formatElapsed(data.startedAt)}
        </span>
      </header>

      <section className="grid grid-cols-2 gap-4">
        <Card label="鍵盤按下" value={formatNumber(data.keydown)} />
        <Card label="滑鼠點擊" value={formatNumber(data.mousedown)} />
        <Card label="滑鼠移動" value={formatNumber(data.mousemove)} unit="次事件" />
        <Card
          label="滑鼠移動距離"
          value={formatNumber(data.mouseDistance)}
          unit="px"
        />
        <Card label="滾輪" value={formatNumber(data.wheel)} />
        <Card
          label="當前 App"
          value={data.activeApp ?? '—'}
          subtitle={data.activeTitle ?? undefined}
        />
      </section>

      <footer className="mt-auto text-xs text-zinc-600">
        walking skeleton · 按鍵內容永不記錄，僅累計次數
      </footer>
    </div>
  );
}

function Card({
  label,
  value,
  unit,
  subtitle,
}: {
  label: string;
  value: string;
  unit?: string | undefined;
  subtitle?: string | undefined;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 truncate text-2xl font-semibold tabular-nums">
        {value}
      </div>
      {unit ? <div className="mt-1 text-xs text-zinc-500">{unit}</div> : null}
      {subtitle ? (
        <div className="mt-1 truncate text-xs text-zinc-500">{subtitle}</div>
      ) : null}
    </div>
  );
}
