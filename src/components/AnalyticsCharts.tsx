"use client";

import { Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Validated against the panel surface: gold and teal stay apart for colour-blind readers too.
const REVENUE = "#b08c12";
const PROFIT = "#1f96b5";
const GRID = "#2b3336";
const TICK = { fill: "#9a917f", fontSize: 11 };

const shortDay = (day: string) => `${day.slice(8)}.${day.slice(5, 7)}.`;
const amount = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

function ChartTip({ active, payload, label }: { active?: boolean; payload?: readonly { name?: unknown; value?: unknown; color?: string }[]; label?: unknown }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="panel px-3 py-2 text-xs min-w-36">
      <div className="muted mb-1">{shortDay(String(label))}</div>
      {payload.map((p) => (
        <div key={String(p.name)} className="flex items-center gap-2">
          <span className="inline-block w-3 h-0.5 shrink-0" style={{ backgroundColor: p.color }} />
          <span className="muted">{String(p.name)}</span>
          <span className="ml-auto tabular-nums">{amount(Number(p.value))}g</span>
        </div>
      ))}
    </div>
  );
}

const grid = <CartesianGrid stroke={GRID} vertical={false} />;
const xAxis = <XAxis dataKey="day" tickFormatter={shortDay} tick={TICK} stroke={GRID} tickLine={false} minTickGap={24} />;
const yAxis = <YAxis tick={TICK} axisLine={false} tickLine={false} width={48} />;
const tooltip = <Tooltip content={ChartTip} cursor={{ stroke: "#5a4a33" }} />;

export function SalesChart({ days }: { days: { day: string; revenue: number; profit: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={days} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        {grid}{xAxis}{yAxis}{tooltip}
        <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
        <Area name="Revenue" dataKey="revenue" stroke={REVENUE} strokeWidth={2} fill={REVENUE} fillOpacity={0.1} isAnimationActive={false} />
        <Area name="Profit" dataKey="profit" stroke={PROFIT} strokeWidth={2} fill={PROFIT} fillOpacity={0.1} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function BalanceChart({ balances }: { balances: { day: string; balance: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={balances} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        {grid}{xAxis}{yAxis}{tooltip}
        <Line name="Balance" dataKey="balance" stroke={REVENUE} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
