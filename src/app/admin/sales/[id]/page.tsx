import Link from "next/link";
import { notFound } from "next/navigation";
import ConfirmButton from "@/components/ConfirmButton";
import { Notice, PageHeader, Section } from "@/components/store-ui";
import { g } from "@/lib/format";
import { isManager, requireStaff } from "@/lib/store-access";
import { deleteReceiptAction, postReceiptAction, reopenReceiptAction } from "@/lib/store-actions";
import { getSale } from "@/lib/store-data";

export const dynamic = "force-dynamic";

export default async function Receipt({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const access = await requireStaff();
  const { id } = await params;
  const { error } = await searchParams;
  const found = /^[0-9a-f-]{36}$/.test(id) ? await getSale(access.profileId, id) : null;
  if (!found) notFound();
  const { sale, lines } = found;
  const draft = sale.status === "draft";
  const manager = isManager(access);

  return (
    <div className="max-w-3xl">
      <PageHeader title={`Receipt #${sale.receipt_no}`} subtitle={`${sale.seller}${sale.customer ? ` · ${sale.customer}` : ""} · ${new Date(sale.sale_date).toISOString().slice(0, 16).replace("T", " ")} UTC`}>
        <span className={draft ? "badge badge-in" : "badge badge-out"}>{sale.status}</span>
      </PageHeader>
      <Notice error={error} />

      <Section title="Lines">
        <div className="panel overflow-x-auto">
          <table className="ledger">
            <thead><tr><th>Item</th><th className="text-right">Qty</th><th className="text-right">Price</th><th className="text-right">Total</th></tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.good_name}</td>
                  <td className="text-right tabular-nums">{g(l.quantity)}</td>
                  <td className="text-right tabular-nums">{g(l.unit_price)}g</td>
                  <td className="text-right tabular-nums">{g(l.quantity * l.unit_price)}g</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <dl className="panel px-4 py-3 mb-6 text-sm space-y-1">
        {sale.discount > 0 && <div className="flex justify-between"><dt className="muted">Discount</dt><dd className="tabular-nums">−{g(sale.discount)}g</dd></div>}
        <div className="flex justify-between text-base"><dt>Total</dt><dd className="tabular-nums text-[#e0bd4a]">{g(sale.total)}g</dd></div>
        {sale.profit !== null && <div className="flex justify-between"><dt className="muted">Profit</dt><dd className="tabular-nums">{g(sale.profit)}g</dd></div>}
        {sale.tip > 0 && <div className="flex justify-between"><dt className="muted">Tip, stays with the seller</dt><dd className="tabular-nums">{g(sale.tip)}g</dd></div>}
        {sale.notes && <div className="muted pt-1">{sale.notes}</div>}
      </dl>

      <div className="flex flex-wrap justify-between gap-3">
        <Link href="/admin/sales" className="btn-ghost !py-2 text-sm">← All sales</Link>
        <div className="flex gap-3">
          {(draft || manager) && (
            <form action={deleteReceiptAction}>
              <input type="hidden" name="id" value={sale.id} />
              <ConfirmButton className="btn-ghost !py-2 text-sm" message={`Delete receipt #${sale.receipt_no}? Stock and bookings are reversed.`}>Delete</ConfirmButton>
            </form>
          )}
          {(draft || manager) && (
            <form action={draft ? postReceiptAction : reopenReceiptAction}>
              <input type="hidden" name="id" value={sale.id} />
              <button className={draft ? "btn-gold !py-2 text-sm" : "btn-ghost !py-2 text-sm"} type="submit">{draft ? "Post receipt" : "Reopen"}</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
