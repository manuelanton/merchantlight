import Link from "next/link";
import CommissionForm from "@/components/CommissionForm";
import ConfirmButton from "@/components/ConfirmButton";
import { Empty, Notice, PageHeader, Pager, Section, Stat } from "@/components/store-ui";
import SuggestInput from "@/components/SuggestInput";
import TickForm from "@/components/TickForm";
import { pageHref } from "@/lib/date-range";
import { g } from "@/lib/format";
import { isManager, requireStaff } from "@/lib/store-access";
import { saveEecPricesAction, setCommissionCancelledAction, setCommissionFulfilledAction, setCommissionPaidAction } from "@/lib/store-actions";
import { eecOrderStats, listEecItems, listEecOrders, type EecOrder } from "@/lib/store-data";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "todo", label: "To do" },
  { key: "done", label: "Done" },
  { key: "cancelled", label: "Cancelled" },
  { key: "all", label: "All" },
];

const statusOf = (o: EecOrder) =>
  o.cancelled ? "cancelled" : o.fulfilled && o.paid ? "done" : o.paid ? "paid" : o.fulfilled ? "fulfilled" : "open";

export default async function Commissions({ searchParams }: { searchParams: Promise<{ error?: string; q?: string; status?: string; page?: string }> }) {
  const access = await requireStaff();
  const manager = isManager(access);
  const params = await searchParams;
  const { error, q } = params;
  const status = FILTERS.find((s) => s.key === params.status)?.key ?? "todo";
  const page = Math.max(0, Math.floor(Number(params.page)) || 0);
  const [items, { rows, total }, stats] = await Promise.all([
    listEecItems(access.profileId),
    listEecOrders(access.profileId, { q, status, page }),
    eecOrderStats(access.profileId),
  ]);
  const link = (change: Record<string, string | undefined>) => pageHref("/admin/commissions", { q, status: status === "todo" ? undefined : status, ...change });

  return (
    <>
      <PageHeader title="Commissions" subtitle="Orders the store buys for customers over the EEC.">
        <form className="flex gap-2">
          {status !== "todo" && <input type="hidden" name="status" value={status} />}
          <SuggestInput name="q" defaultValue={q} options={[...stats.customers, ...items.map((i) => i.name)]} className="w-56" placeholder="Search customer or item" label="Search commissions" />
        </form>
      </PageHeader>
      <Notice error={error} />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <Stat label="To fulfil" value={String(stats.to_fulfil)} />
        <Stat label="Unpaid orders" value={String(stats.to_collect)} />
        <Stat label="Still to come in" value={`${g(stats.unpaid)}g`} />
      </div>

      <details className="mb-6">
        <summary className="btn-ghost inline-block !py-2 text-sm cursor-pointer">+ New order</summary>
        <div className="mt-3"><CommissionForm items={items} /></div>
      </details>

      <div className="flex flex-wrap gap-2 mb-3">
        {FILTERS.map((s) => (
          <Link key={s.key} href={link({ status: s.key === "todo" ? undefined : s.key })} className={`${s.key === status ? "btn-gold" : "btn-ghost"} !py-1 text-sm`}>{s.label}</Link>
        ))}
      </div>

      <div className="panel overflow-x-auto mb-2">
        <table className="ledger min-w-[50rem]">
          <thead>
            <tr>
              <th>Customer</th><th>Items</th><th className="text-right">Price</th><th>Date of order</th><th>Status</th>
              <th className="text-center">Fulfilled</th><th className="text-center">Paid</th><th />
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                <td>{o.customer}</td>
                <td className="text-sm">{o.items}</td>
                <td className="text-right tabular-nums">{g(o.total)}g</td>
                <td className="tabular-nums">{new Date(o.order_date).toISOString().slice(0, 10)}</td>
                <td><span className={`badge ${statusOf(o) === "done" ? "badge-in" : o.cancelled ? "badge-out" : ""}`}>{statusOf(o)}</span></td>
                <td><TickForm id={o.id} checked={o.fulfilled} disabled={o.cancelled} label={`${o.customer}'s order fulfilled`} action={setCommissionFulfilledAction} /></td>
                <td><TickForm id={o.id} checked={o.paid} disabled={o.cancelled} label={`${o.customer}'s order paid`} action={setCommissionPaidAction} confirmOff={`Take receipt #${o.receipt_no} out of the books again?`} /></td>
                <td>
                  <div className="flex items-center justify-end gap-2">
                    {o.sale_id && <Link href={`/admin/sales/${o.sale_id}`} className="muted text-sm tabular-nums hover:text-[#e0bd4a]">#{o.receipt_no}</Link>}
                    {o.cancelled ? (
                      <form action={setCommissionCancelledAction}>
                        <input type="hidden" name="id" value={o.id} />
                        <input type="hidden" name="on" value="0" />
                        <button className="btn-ghost !py-1 text-sm" type="submit">Reopen</button>
                      </form>
                    ) : !o.paid && (
                      <form action={setCommissionCancelledAction}>
                        <input type="hidden" name="id" value={o.id} />
                        <input type="hidden" name="on" value="1" />
                        <ConfirmButton message={`Cancel ${o.customer}'s order?`} className="btn-ghost !py-1 !px-2 text-sm"><span aria-label={`Cancel ${o.customer}'s order`}>×</span></ConfirmButton>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty>No orders here.</Empty>}
      </div>
      <Pager page={page} total={total} href={(p) => link({ page: p ? String(p) : undefined })} />

      <Section title="EEC price list" aside="Cost is what the EEC charges, Price what the customer pays. New orders use these, existing ones keep theirs.">
        <details>
          <summary className="btn-ghost inline-block !py-2 text-sm cursor-pointer mb-3">Show {items.length} items</summary>
          <form action={saveEecPricesAction}>
            <div className="panel overflow-x-auto mb-3">
              <table className="ledger min-w-[34rem]">
                <thead><tr><th>Item</th><th>Category</th><th className="text-right w-28">Cost</th><th className="text-right w-28">Price</th><th className="text-right w-20">Profit</th></tr></thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id}>
                      <td>{i.name}{i.weekly_limit && <span className="muted text-xs"> · at most {i.weekly_limit} a week</span>}</td>
                      <td className="muted text-sm">{i.category}</td>
                      {manager ? (
                        <>
                          <td><input type="hidden" name="id" value={i.id} /><input name={`cost_${i.id}`} inputMode="decimal" defaultValue={g(i.cost)} className="input !py-1 text-sm text-right" aria-label={`Cost of ${i.name}`} /></td>
                          <td><input name={`price_${i.id}`} inputMode="decimal" defaultValue={g(i.price)} className="input !py-1 text-sm text-right" aria-label={`Price of ${i.name}`} /></td>
                        </>
                      ) : (
                        <>
                          <td className="text-right tabular-nums">{g(i.cost)}g</td>
                          <td className="text-right tabular-nums">{g(i.price)}g</td>
                        </>
                      )}
                      <td className="text-right tabular-nums">{g(i.price - i.cost)}g</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {manager && <button className="btn-gold !py-2 text-sm" type="submit">Save prices</button>}
          </form>
        </details>
      </Section>
    </>
  );
}
