import Link from "next/link";
import { Empty, Notice, PageHeader, Section, Stat } from "@/components/store-ui";
import { g } from "@/lib/format";
import { requireManager } from "@/lib/store-access";
import { closeWeekAction, payPartnerAction, reopenWeekAction } from "@/lib/store-actions";
import { addDays, partnerBalances, partnerWeek, treasuryEntries, weekStart } from "@/lib/store-data";

export const dynamic = "force-dynamic";

export default async function Payments({ searchParams }: { searchParams: Promise<{ week?: string; error?: string }> }) {
  const access = await requireManager();
  const { week: asked, error } = await searchParams;
  const thisWeek = weekStart();
  const week = /^\d{4}-\d{2}-\d{2}$/.test(asked ?? "") ? weekStart(new Date(`${asked}T00:00:00Z`)) : thisWeek;
  const [w, balances, payouts] = await Promise.all([
    partnerWeek(access.profileId, week),
    partnerBalances(access.profileId),
    treasuryEntries(access.profileId, "Partner payout"),
  ]);

  const over = addDays(week, 7) <= new Date().toISOString().slice(0, 10);
  const balanceOf = (id: string) => balances.find((b) => b.partner_id === id)?.balance ?? 0;
  const shareOf = (p: (typeof w.partners)[number]) => p.amount ?? w.per_partner ?? 0;
  // Former partners with gold left stay payable after they drop out of the week's list.
  const others = balances.filter((b) => b.balance !== 0 && !w.partners.some((p) => p.id === b.partner_id));

  return (
    <>
      <PageHeader title="Payments" subtitle="Profit minus expenses, shared equally by Owners and Managers, week by week.">
        <div className="flex items-center gap-2 text-sm">
          <Link className="btn-ghost !py-1 !px-3" href={`/admin/payments?week=${addDays(week, -7)}`} aria-label="Previous week">←</Link>
          <span className="tabular-nums">{week} – {addDays(week, 6)}</span>
          <Link className="btn-ghost !py-1 !px-3" href={`/admin/payments?week=${addDays(week, 7)}`} aria-label="Next week">→</Link>
          {week !== thisWeek && <Link className="btn-ghost !py-1 text-sm" href="/admin/payments">This week</Link>}
        </div>
      </PageHeader>
      <Notice error={error} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
        <Stat label="Profit" value={`${g(w.sales_profit + w.other_income)}g`} />
        <Stat label="Expenses" value={`${g(w.expenses)}g`} />
        <Stat label="Net" value={`${g(w.net)}g`} tone={w.net < 0 ? "bad" : undefined} />
        <Stat label="Per partner" value={w.per_partner === null ? "—" : `${g(w.per_partner)}g`} tone={(w.per_partner ?? 0) < 0 ? "bad" : undefined} />
      </div>
      <p className="muted text-xs mb-8">
        Profit is sales minus their cost, plus rent income. Purchases aren&apos;t expenses: their cost is already in the sales. Weeks run Monday to Sunday, UTC.
      </p>

      <Section
        title={w.closed ? "Shares (closed)" : "Shares (preview)"}
        aside={
          w.closed ? (
            access.role === "owner" && (
              <form action={reopenWeekAction}>
                <input type="hidden" name="week" value={week} />
                <button className="btn-ghost !py-1 text-xs" type="submit">Reopen week</button>
              </form>
            )
          ) : over ? (
            <form action={closeWeekAction}>
              <input type="hidden" name="week" value={week} />
              <button className="btn-gold !py-1 text-xs" type="submit">Close week</button>
            </form>
          ) : "Can be closed after Sunday"
        }
      >
        <div className="panel overflow-x-auto">
          <table className="ledger min-w-[34rem]">
            <thead><tr><th>Partner</th><th className="text-right">This week</th><th className="text-right">Balance</th><th className="text-right">Pay out</th></tr></thead>
            <tbody>
              {[...w.partners.map((p) => ({ id: p.id, name: p.name, share: shareOf(p) })), ...others.map((b) => ({ id: b.partner_id, name: b.name, share: 0 }))].map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td className="text-right tabular-nums">{g(p.share)}g</td>
                  <td className="text-right tabular-nums">{g(balanceOf(p.id))}g</td>
                  <td>
                    <form action={payPartnerAction} className="flex justify-end gap-2">
                      <input type="hidden" name="week" value={week} />
                      <input type="hidden" name="partner" value={p.id} />
                      <input key={balanceOf(p.id)} name="amount" inputMode="decimal" className="input !w-24 !py-1 text-sm" defaultValue={balanceOf(p.id) > 0 ? g(balanceOf(p.id)) : ""} placeholder="0" aria-label={`Amount for ${p.name}`} />
                      <button className="btn-ghost !py-1 text-sm" type="submit">Pay</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!w.partners.length && !others.length && <Empty>No Owner or Manager has signed in yet.</Empty>}
        </div>
      </Section>

      <Section title="Payment history">
        <div className="panel divide-y divide-[#1c2b31]">
          {!payouts.length && <Empty>No payments yet.</Empty>}
          {payouts.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="min-w-0 truncate">{p.description}</span>
              <span className="shrink-0 text-right">
                <span className="tabular-nums">{g(p.money_out)}g</span>
                <span className="muted text-xs block">{new Date(p.entry_date).toISOString().slice(0, 10)}</span>
              </span>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
