"use client";
import { useMemo, useState } from "react";
import { g } from "@/lib/format";

export default function ReportsView({ report }: { report: any }) {
  const [offset, setOffset] = useState(0);
  const { start, end } = report.range;
  const label = `${new Date(start).toLocaleDateString()} - ${new Date(end).toLocaleDateString()}`;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="font-display text-3xl">Weekly Report</h1>
        <span className="text-sm text-[#8a7c64]">{label}</span>
      </div>
      <div className="grid md:grid-cols-5 gap-4">
        <div className="card p-4"><div className="lbl">Revenue</div><div className="text-2xl text-[#e0bd4a]">{g(report.revenue)}g</div></div>
        <div className="card p-4"><div className="lbl">Profit</div><div className="text-2xl text-[#e0bd4a]">{g(report.profit)}g</div></div>
        <div className="card p-4"><div className="lbl">Expenses</div><div className="text-2xl text-[#e0bd4a]">{g(report.expenses)}g</div></div>
        <div className="card p-4"><div className="lbl">Rent</div><div className="text-2xl text-[#e0bd4a]">{g(report.rent)}g</div></div>
        <div className="card p-4"><div className="lbl">Net (Profit - Expenses)</div><div className="text-2xl text-[#e0bd4a]">{g(report.net)}g</div></div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-4">
          <h2 className="font-display text-lg">Top Items by Profit</h2>
          <table className="ledger mt-2">
            <thead><tr><th>Item</th><th>Qty</th><th>Revenue</th><th>Profit</th></tr></thead>
            <tbody>
              {report.topItems.map((i: any) => <tr key={i.name}><td>{i.name}</td><td>{i.qty}</td><td>{g(i.revenue)}g</td><td>{g(i.profit)}g</td></tr>)}
            </tbody>
          </table>
        </div>
        <div className="card p-4">
          <h2 className="font-display text-lg">Sales by Seller</h2>
          <table className="ledger mt-2">
            <thead><tr><th>Seller</th><th>Sales</th><th>Revenue</th><th>Profit</th></tr></thead>
            <tbody>
              {report.bySeller.map((s: any) => <tr key={s.name}><td>{s.name}</td><td>{s.count}</td><td>{g(s.revenue)}g</td><td>{g(s.profit)}g</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}