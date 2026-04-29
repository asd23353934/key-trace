import type { HeatmapDailyRow } from '../../../shared/storage-protocol';

type Props = {
  data: HeatmapDailyRow[];
  weeks: number;
};

type Cell = {
  key: string;
  date: string | null;
  count: number;
  intensity: number;
};

function startOfLocalDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// Spec 要求 quantile-derived thresholds：對非零 count 取 p25/p50/p75 切 4 段
function computeThresholds(counts: number[]): [number, number, number] {
  const sorted = counts.filter((c) => c > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return [1, 1, 1];
  const at = (q: number): number => {
    const idx = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
    return sorted[idx] ?? 1;
  };
  return [at(0.25), at(0.5), at(0.75)];
}

function bucketize(
  count: number,
  thresholds: [number, number, number],
): number {
  if (count <= 0) return 0;
  if (count <= thresholds[0]) return 1;
  if (count <= thresholds[1]) return 2;
  if (count <= thresholds[2]) return 3;
  return 4;
}

const INTENSITY_CLASS: Record<number, string> = {
  0: 'bg-zinc-800',
  1: 'bg-emerald-950',
  2: 'bg-emerald-800',
  3: 'bg-emerald-600',
  4: 'bg-emerald-400',
};

export function HeatmapCalendar({ data, weeks }: Props) {
  const counts = new Map(data.map((d) => [d.date, d.count]));
  const thresholds = computeThresholds(data.map((d) => d.count));

  const today = startOfLocalDay(new Date());
  const totalDays = weeks * 7;
  const earliestVisible = addDays(today, -(totalDays - 1));
  // 補回到該週的星期日，欄位才能整齊對齊
  const gridStart = addDays(earliestVisible, -earliestVisible.getDay());

  const cells: Cell[] = [];
  let cursor = gridStart;
  while (cursor <= today) {
    const dateStr = formatLocalDate(cursor);
    const inRange = cursor >= earliestVisible;
    const count = inRange ? (counts.get(dateStr) ?? 0) : 0;
    const intensity = inRange ? bucketize(count, thresholds) : -1;
    cells.push({ key: dateStr, date: inRange ? dateStr : null, count, intensity });
    cursor = addDays(cursor, 1);
  }

  return (
    <div className="overflow-x-auto">
      <div className="inline-grid grid-flow-col grid-rows-7 gap-[3px]">
        {cells.map((c) => (
          <div
            key={c.key}
            className={`h-[12px] w-[12px] rounded-[2px] ${
              c.intensity < 0 ? 'opacity-0' : INTENSITY_CLASS[c.intensity]
            }`}
            title={c.date ? `${c.date}：${c.count.toLocaleString('zh-Hant')} 次` : ''}
          />
        ))}
      </div>
    </div>
  );
}
