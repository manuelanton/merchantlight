import Link from "next/link";
import { Empty, Notice, PageHeader, Section, Stat } from "@/components/store-ui";
import { g } from "@/lib/format";
import { requireManager } from "@/lib/store-access";
import { closeWeekAction, payPartnerAction, reopenWeekAction } from "@/lib/store-actions";
import { addDays, partnerLedger, partnerOpenWeeks, partnerWeek, treasuryEntries, weekStart } from "@/lib/store-data";

export const dynamic = "force-dynamic";

export default async function Payments({ searchParams }: { searchParams: Promise<{ week?: string; error?: string }> }) {
  const access = await requireManager();
  const { week: asked, error } = await searchParams;
  const thisWeek = weekStart();
  const week = /^\d{4}-\d{2}-\d{2}$/.test(asked ?? "") ? weekStart(new Date(`${asked}T00:00:00Z`)) : thisWeek;
  const [w, ledger, current, openWeeks, payouts] = await Promise.all([
    partnerWeek(access.profileId, week),
    partnerLedger(access.profileId, week),
    partnerLedger(access.profileId, thisWeek),
    partnerOpenWeeks(access.profileId, addDays(thisWeek, 7)),
    treasuryEntries(access.profileId, { category: "Partner payout" }),
  ]);

  const over = addDays(week, 7) <= new Date().toISOString().slice(0, 10);
  // What can be paid today, from any week's page: everything from finished weeks, less what went out since.
  const payable = (id: string) => {
    const r = current.find((c) => c.partner_id === id);
    return r ? Math.max(0, r.carried - r.paid) : 0;
  };
  // Former partners with gold left stay payable after they drop out of the week's list.
  const rows = ledger.filter((r) => r.carried || r.share || r.paid || payable(r.partner_id) || w.partners.some((p) => p.id === r.partner_id));

  return (
    <>
      <PageHeader title="Payments" subtitle="Income minus expenses, shared equally by the partners, week by week.">
        <div className="flex items-center gap-2 text-sm">
          <Link className="btn-ghost !py-1 !px-3" href={`/admin/payments?week=${addDays(week, -7)}`} aria-label="Previous week">←</Link>
          <span className="tabular-nums">{week} – {addDays(week, 6)}</span>
          <Link className="btn-ghost !py-1 !px-3" href={`/admin/payments?week=${addDays(week, 7)}`} aria-label="Next week">→</Link>
          {week !== thisWeek && <Link className="btn-ghost !py-1 text-sm" href="/admin/payments">This week</Link>}
        </div>
      </PageHeader>
      <Notice error={error} />
      {openWeeks.length > 0 && (
        <p className="panel px-4 py-3 mb-6 text-sm">
          Finished but not closed yet, already counted below:{" "}
          {openWeeks.map((d, i) => (
            <span key={d}>{i > 0 && ", "}<Link className="underline hover:text-[#e0bd4a] tabular-nums" href={`/admin/payments?week=${d}`}>{d}</Link></span>
          ))}
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
        <Stat label="Income" value={`${g(w.sales_income + w.other_income)}g`} />
        <Stat label="Expenses" value={`${g(w.expenses)}g`} />
        <Stat label="Net" value={`${g(w.net)}g`} tone={w.net < 0 ? "bad" : undefined} />
        <Stat label="Per partner" value={w.per_partner === null ? "—" : `${g(w.per_partner)}g`} tone={(w.per_partner ?? 0) < 0 ? "bad" : undefined} />
      </div>
      <p className="muted text-xs mb-8">
        Income is sales plus rent. Expenses include purchases, so what is bought this week counts this week. Deposits, withdrawals and payouts count for neither. Who shares is set under Users. Shares are rounded down to whole gold, the rest stays in the treasury. What isn't paid out carries over to the next week. Weeks run Monday to Sunday, UTC.
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
          <table className="ledger min-w-[42rem]">
            <thead><tr><th>Partner</th><th className="text-right">Carried over</th><th className="text-right">This week</th><th className="text-right">Paid</th><th className="text-right">Owed</th><th className="text-right">Pay out</th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.partner_id}>
                  <td>{p.name}</td>
                  <td className="text-right tabular-nums">{g(p.carried)}g</td>
                  <td className="text-right tabular-nums">{g(p.share)}g</td>
                  <td className="text-right tabular-nums">{g(p.paid)}g</td>
                  <td className={`text-right tabular-nums ${p.carried + p.share - p.paid < 0 ? "text-[#e08a8a]" : ""}`}>{g(p.carried + p.share - p.paid)}g</td>
                  <td>
                    <form action={payPartnerAction} className="flex justify-end gap-2">
                      <input type="hidden" name="week" value={week} />
                      <input type="hidden" name="partner" value={p.partner_id} />
                      <input key={payable(p.partner_id)} name="amount" inputMode="decimal" className="input !w-24 !py-1 text-sm" defaultValue={payable(p.partner_id) > 0 ? g(payable(p.partner_id)) : ""} placeholder="0" aria-label={`Amount for ${p.name}`} />
                      <button className="btn-ghost !py-1 text-sm" type="submit">Pay</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <Empty>Nobody shares the profit yet.</Empty>}
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
