import { auth, isQuartermaster } from "@/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { payrollRuns, payrollEntries } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import {
  createPayrollRunAction,
  approvePayrollRunAction,
  markPayrollPaidAction,
} from "@/lib/admin-actions";
import { getWeekRange } from "@/lib/reports";
import { g } from "@/lib/format";

export const dynamic = "force-dynamic";

const fmtDate = (d: Date) => new Date(d).toLocaleDateString();

export default async function PayrollPage() {
  const session = await auth();
  const discordId = (session as unknown as { discordId?: string } | null)?.discordId;
  if (!session?.user || !discordId || !isQuartermaster(discordId)) redirect("/admin");
  const db = await getDb();
  const runs = await db.select().from(payrollRuns).orderBy(desc(payrollRuns.weekStart));
  const entriesByRun = new Map<string, (typeof payrollEntries.$inferSelect)[]>();
  for (const r of runs) {
    entriesByRun.set(r.id, await db.select().from(payrollEntries).where(eq(payrollEntries.runId, r.id)));
  }
  const { start, end } = getWeekRange();
  const hasThisWeek = runs.some((r) => {
    const s = new Date(r.weekStart);
    return s >= start && s <= end;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Payroll</h1>
        <p className="text-sm text-[#8a7c64]">
          Weekly Sat–Fri runs. Commission is 50% of each employee&apos;s confirmed sale profit, minus their logged purchases.
          Approving locks the run; marking it paid posts payouts and purchases to the ledger.
        </p>
      </div>

      <form action={createPayrollRunAction}>
        <button className="btn-gold !py-2 !px-4 text-sm" type="submit" disabled={hasThisWeek}>
          {hasThisWeek ? "Run already exists for this week" : "Create run for this week"}
        </button>
      </form>

      {runs.map((run) => {
        const entries = entriesByRun.get(run.id) || [];
        const totalPay = entries.reduce((a, e) => a + Number(e.totalPay || 0), 0);
        const totalCommission = entries.reduce((a, e) => a + Number(e.commission || 0), 0);
        const totalPurchases = entries.reduce((a, e) => a + Number(e.purchasesTotal || 0), 0);
        return (
          <div key={run.id} className="card p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-display text-xl">
                {fmtDate(run.weekStart)} – {fmtDate(run.weekEnd)}
              </h2>
              <span className="badge uppercase">{run.status}</span>
              <span className="text-sm text-[#8a7c64]">
                Commission {g(totalCommission)}g · Purchases {g(totalPurchases)}g · Net {g(totalPay)}g
              </span>
              <div className="ml-auto flex gap-2">
                {run.status === "draft" && (
                  <form action={approvePayrollRunAction}>
                    <input type="hidden" name="run_id" value={run.id} />
                    <button className="btn-gold !py-1 !px-3 text-xs" type="submit">Approve</button>
                  </form>
                )}
                {run.status === "approved" && (
                  <form action={markPayrollPaidAction}>
                    <input type="hidden" name="run_id" value={run.id} />
                    <button className="btn-gold !py-1 !px-3 text-xs" type="submit">Mark paid (post to ledger)</button>
                  </form>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="ledger min-w-[720px]">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Sales</th>
                    <th>Profit</th>
                    <th>Commission (50%)</th>
                    <th>Purchases −</th>
                    <th>Net pay</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id}>
                      <td>{e.employeeName}</td>
                      <td>{e.salesCount}</td>
                      <td>{g(e.salesProfit)}g</td>
                      <td>{g(e.commission)}g</td>
                      <td>{g(e.purchasesTotal)}g</td>
                      <td className="text-[#e0bd4a]">{g(e.totalPay)}g</td>
                      <td className="text-xs">{e.status}</td>
                    </tr>
                  ))}
                  {!entries.length && (
                    <tr><td colSpan={7} className="text-[#8a7c64]">No employees with linked Discord accounts.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      {!runs.length && <p className="text-sm text-[#8a7c64]">No payroll runs yet.</p>}
    </div>
  );
}
