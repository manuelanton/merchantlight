import Link from "next/link";
import CommissionForm from "@/components/CommissionForm";
import ConfirmButton from "@/components/ConfirmButton";
import { Empty, Notice, PageHeader, Pager, Stat } from "@/components/store-ui";
import SuggestInput from "@/components/SuggestInput";
import { pageHref } from "@/lib/date-range";
import { g } from "@/lib/format";
import { requireStaff } from "@/lib/store-access";
import { addCommissionAction, setCommissionStatusAction } from "@/lib/store-actions";
import { eecOrderStats, listEecItems, listEecOrders } from "@/lib/store-data";

export const dynamic = "force-dynamic";

const STATUSES = [
  { key: "active", label: "To do" },
  { key: "open", label: "Open" },
  { key: "bought", label: "Bought" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
  { key: "all", label: "All" },
];

const NEXT: Record<string, { status: string; label: string }> = {
  open: { status: "bought", label: "Mark bought" },
  bought: { status: "delivered", label: "Mark delivered" },
  delivered: { status: "open", label: "Reopen" },
  cancelled: { status: "open", label: "Reopen" },
};

function StatusButton({ id, status, label }: { id: string; status: string; label: string }) {
  return (
    <form action={setCommissionStatusAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button className="btn-ghost !py-1 text-sm" type="submit">{label}</button>
    </form>
  );
}

export default async function Commissions({ searchParams }: { searchParams: Promise<{ error?: string; q?: string; status?: string; page?: string }> }) {
  const access = await requireStaff();
  const params = await searchParams;
  const { error, q } = params;
  const status = STATUSES.find((s) => s.key === params.status)?.key ?? "active";
  const page = Math.max(0, Math.floor(Number(params.page)) || 0);
  const [items, { rows, total }, stats] = await Promise.all([
    listEecItems(),
    listEecOrders(access.profileId, { q, status, page }),
    eecOrderStats(access.profileId),
  ]);
  const link = (change: Record<string, string | undefined>) => pageHref("/admin/commissions", { q, status: status === "active" ? undefined : status, ...change });

  return (
    <>
      <PageHeader title="Commissions" subtitle="Orders for the EEC. Customers place them on the Commissions page of the site, or you add them here.">
        <form className="flex gap-2">
          {status !== "active" && <input type="hidden" name="status" value={status} />}
          <SuggestInput name="q" defaultValue={q} options={[...stats.customers, ...items.map((i) => i.name)]} className="w-56" placeholder="Search customer or item" label="Search commissions" />
        </form>
      </PageHeader>
      <Notice error={error} />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <Stat label="Open" value={String(stats.open)} />
        <Stat label="Bought" value={String(stats.bought)} />
        <Stat label="To buy for" value={`${g(stats.open_value)}g`} />
      </div>

      <details className="mb-6">
        <summary className="btn-ghost inline-block !py-2 text-sm cursor-pointer">+ New order</summary>
        <div className="mt-3"><CommissionForm items={items} action={addCommissionAction} button="Add order" /></div>
      </details>

      <div className="flex flex-wrap gap-2 mb-3">
        {STATUSES.map((s) => (
          <Link key={s.key} href={link({ status: s.key === "active" ? undefined : s.key })} className={`${s.key === status ? "btn-gold" : "btn-ghost"} !py-1 text-sm`}>{s.label}</Link>
        ))}
      </div>

      <div className="panel overflow-x-auto">
        <table className="ledger min-w-[44rem]">
          <thead><tr><th>Customer</th><th>Item</th><th className="text-right">Price</th><th>Date of order</th><th>Status</th><th /></tr></thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                <td>{o.customer}</td>
                <td>{o.item_name}</td>
                <td className="text-right tabular-nums">{g(o.price)}g</td>
                <td className="tabular-nums">{new Date(o.order_date).toISOString().slice(0, 10)}</td>
                <td><span className={`badge ${o.status === "delivered" ? "badge-in" : o.status === "cancelled" ? "badge-out" : ""}`}>{o.status}</span></td>
                <td>
                  <div className="flex justify-end gap-2">
                    <StatusButton id={o.id} {...NEXT[o.status]} />
                    {(o.status === "open" || o.status === "bought") && (
                      <form action={setCommissionStatusAction}>
                        <input type="hidden" name="id" value={o.id} />
                        <input type="hidden" name="status" value="cancelled" />
                        <ConfirmButton message={`Cancel ${o.customer}'s order for ${o.item_name}?`} className="btn-ghost !py-1 !px-2 text-sm">×</ConfirmButton>
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
    </>
  );
}
