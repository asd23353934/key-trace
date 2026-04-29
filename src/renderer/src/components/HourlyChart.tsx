import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { HourlyDistributionRow } from '../../../shared/storage-protocol';

type Props = {
  data: HourlyDistributionRow[];
};

export function HourlyChart({ data }: Props) {
  return (
    <div style={{ width: '100%', height: 192 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="hour"
            tick={{ fill: '#a1a1aa', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: '#3f3f46' }}
            tickFormatter={(h: number) => `${h}`}
            interval={2}
          />
          <YAxis
            tick={{ fill: '#a1a1aa', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: '#3f3f46' }}
            width={40}
          />
          <Tooltip
            contentStyle={{
              background: '#18181b',
              border: '1px solid #3f3f46',
              borderRadius: 6,
              fontSize: 12,
              color: '#e4e4e7',
            }}
            cursor={{ fill: '#27272a' }}
            formatter={(value) => [
              Number(value).toLocaleString('zh-Hant'),
              '次數',
            ]}
            labelFormatter={(label) => `${String(label)}:00`}
          />
          <Bar dataKey="count" fill="#10b981" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
