import Link from "next/link";
import { Empty, PageHeader, Section } from "@/components/store-ui";
import { g } from "@/lib/format";
import { requireStaff } from "@/lib/store-access";
import { listSales, type SaleRow } from "@/lib/store-data";

export const dynamic = "force-dynamic";

const dayOf = (s: SaleRow) => new Date(s.sale_date).toISOString().slice(0, 10);

export default async function Sales({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const access = await requireStaff();
  const { q, status } = await searchParams;
  const sales = await listSales(access.profileId, { q, status });

  const days = new Map<string, SaleRow[]>();
  for (const s of sales) days.set(dayOf(s), [...(days.get(dayOf(s)) ?? []), s]);

  return (
    <>
      <PageHeader title="Sales">
        <Link href="/admin/sales/new" className="btn-gold !py-2 text-sm">+ New receipt</Link>
      </PageHeader>

      <form className="flex flex-wrap gap-3 mb-6">
        <input name="q" defaultValue={q} className="input !w-56" placeholder="Receipt no., customer, seller" aria-label="Search" />
        <select name="status" defaultValue={status ?? ""} className="input !w-36" aria-label="Status">
          <option value="">All</option>
          <option value="posted">Posted</option>
          <option value="draft">Draft</option>
        </select>
        <button className="btn-ghost !py-2 text-sm" type="submit">Filter</button>
      </form>

      {!sales.length && <div className="panel"><Empty>No receipts found.</Empty></div>}
      {[...days.entries()].map(([day, rows]) => {
        const posted = rows.filter((r) => r.status === "posted");
        const revenue = posted.reduce((sum, r) => sum + r.total, 0);
        const profit = posted.reduce((sum, r) => sum + (r.profit ?? 0), 0);
        return (
          <Section key={day} title={day} aside={`${rows.length} ${rows.length === 1 ? "receipt" : "receipts"} · ${g(revenue)}g · profit ${g(profit)}g`}>
            <div className="panel divide-y divide-[#1c2b31]">
              {rows.map((r) => (
                <Link key={r.id} href={`/admin/sales/${r.id}`} className="grid grid-cols-[4rem_minmax(0,1fr)_auto_3.5rem] gap-3 px-4 py-3 items-center hover:bg-[#1d1a16]">
                  <span className="tabular-nums">#{r.receipt_no}</span>
                  <span className="muted text-sm truncate">{r.seller}{r.customer ? ` · ${r.customer}` : ""}</span>
                  <span className="tabular-nums text-sm">{g(r.total)}g</span>
                  <span className={`text-xs text-right ${r.status === "draft" ? "text-[#e0bd4a]" : "muted"}`}>{r.status}</span>
                </Link>
              ))}
            </div>
          </Section>
        );
      })}
    </>
  );
}
