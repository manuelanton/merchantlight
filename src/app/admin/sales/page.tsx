import Link from "next/link";
import RangeBar from "@/components/RangeBar";
import { Empty, PageHeader, Pager, Section } from "@/components/store-ui";
import SuggestInput from "@/components/SuggestInput";
import { pageHref, rangeParams, resolveRange, type RangeParams } from "@/lib/date-range";
import { g } from "@/lib/format";
import { requireStaff } from "@/lib/store-access";
import { listSales, saleOptions, salesDays, type SaleRow } from "@/lib/store-data";

export const dynamic = "force-dynamic";

const dayOf = (s: SaleRow) => new Date(s.sale_date).toISOString().slice(0, 10);

export default async function Sales({ searchParams }: { searchParams: Promise<RangeParams & { q?: string; status?: string; seller?: string; page?: string }> }) {
  const access = await requireStaff();
  const params = await searchParams;
  const { q, status, seller } = params;
  const range = resolveRange(params);
  const page = Math.max(0, Math.floor(Number(params.page)) || 0);
  const filter = { q, status, seller, from: range.from, to: range.to };
  const [sales, totals, options] = await Promise.all([
    listSales(access.profileId, { ...filter, page }),
    salesDays(access.profileId, filter),
    saleOptions(access.profileId),
  ]);

  const days = new Map<string, SaleRow[]>();
  for (const s of sales) days.set(dayOf(s), [...(days.get(dayOf(s)) ?? []), s]);
  const total = totals.reduce((sum, d) => sum + d.receipts, 0);
  const filters = { q, status, seller };
  const dated = rangeParams(range);

  return (
    <>
      <PageHeader title="Sales">
        <Link href="/admin/sales/new" className="btn-gold !py-2 text-sm">+ New receipt</Link>
      </PageHeader>

      <RangeBar path="/admin/sales" range={range} keep={filters} />

      <form className="flex flex-wrap gap-3 mb-6">
        {Object.entries(dated).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <SuggestInput name="q" defaultValue={q} options={[...options.customers, ...options.sellers.map((s) => s.name)]} className="w-56" placeholder="Receipt no., customer, seller" label="Search" />
        <select name="seller" defaultValue={seller ?? ""} className="input !w-40 !py-2 text-sm" aria-label="Seller">
          <option value="">All sellers</option>
          {options.sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select name="status" defaultValue={status ?? ""} className="input !w-36 !py-2 text-sm" aria-label="Status">
          <option value="">All</option>
          <option value="posted">Posted</option>
          <option value="draft">Draft</option>
        </select>
        <button className="btn-ghost !py-2 text-sm" type="submit">Filter</button>
      </form>

      {!sales.length && <div className="panel"><Empty>No receipts found.</Empty></div>}
      {[...days.entries()].map(([day, rows]) => {
        const sum = totals.find((t) => t.day === day);
        return (
          <Section key={day} title={day} aside={sum && `${sum.receipts} ${sum.receipts === 1 ? "receipt" : "receipts"} · ${g(sum.revenue)}g · profit ${g(sum.profit)}g`}>
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
      <Pager page={page} total={total} href={(p) => pageHref("/admin/sales", { ...filters, ...dated, page: p ? String(p) : undefined })} />
    </>
  );
}
