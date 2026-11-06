import RangeBar from "@/components/RangeBar";
import { Empty, Notice, PageHeader, Pager, Section, Stat } from "@/components/store-ui";
import SuggestInput from "@/components/SuggestInput";
import { pageHref, rangeParams, resolveRange, type RangeParams } from "@/lib/date-range";
import { g } from "@/lib/format";
import { requireManager } from "@/lib/store-access";
import { addTreasuryEntryAction } from "@/lib/store-actions";
import { treasuryBalance, treasuryCategories, treasuryEntries, treasuryOptions, treasuryTotals } from "@/lib/store-data";

export const dynamic = "force-dynamic";

export default async function Treasury({ searchParams }: { searchParams: Promise<RangeParams & { error?: string; q?: string; category?: string; direction?: string; page?: string }> }) {
  const access = await requireManager();
  const params = await searchParams;
  const { error, q, category, direction } = params;
  const range = resolveRange(params);
  const page = Math.max(0, Math.floor(Number(params.page)) || 0);
  const filter = { q, category, direction, from: range.from, to: range.to };
  const [balance, entries, totals, categories, options] = await Promise.all([
    treasuryBalance(access.profileId),
    treasuryEntries(access.profileId, { ...filter, page }),
    treasuryTotals(access.profileId, filter),
    treasuryCategories(access.profileId),
    treasuryOptions(access.profileId),
  ]);
  const filters = { q, category, direction };
  const dated = rangeParams(range);

  return (
    <>
      <PageHeader title="Treasury" subtitle="All the company's gold in one place." />
      <Notice error={error} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Stat label="Balance" value={`${g(balance)}g`} tone={balance < 0 ? "bad" : undefined} />
        <Stat label="Money in" value={`${g(totals.money_in)}g`} />
        <Stat label="Money out" value={`${g(totals.money_out)}g`} />
        <Stat label="Net" value={`${g(totals.money_in - totals.money_out)}g`} tone={totals.money_in < totals.money_out ? "bad" : undefined} />
      </div>

      <Section title="Add an entry">
        <form action={addTreasuryEntryAction} className="panel p-4 grid sm:grid-cols-[8rem_1fr_7rem_1.5fr_auto] gap-3 items-end">
          <div>
            <label className="lbl" htmlFor="direction">Type</label>
            <select id="direction" name="direction" className="input" defaultValue="out">
              <option value="out">Money out</option>
              <option value="in">Money in</option>
            </select>
          </div>
          <div>
            <label className="lbl" htmlFor="category">Category</label>
            <select id="category" name="category" className="input">
              {categories.map((c) => <option key={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl" htmlFor="amount">Amount</label>
            <input id="amount" name="amount" inputMode="decimal" className="input" required />
          </div>
          <div>
            <label className="lbl" htmlFor="description">Note</label>
            <input id="description" name="description" className="input" placeholder="e.g. rent for 2 days" />
          </div>
          <button className="btn-gold !py-2 text-sm" type="submit">Add</button>
        </form>
      </Section>

      <RangeBar path="/admin/treasury" range={range} keep={filters} />

      <form className="flex flex-wrap gap-3 mb-6">
        {Object.entries(dated).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <SuggestInput name="q" defaultValue={q} options={[...options.notes, ...options.categories]} className="w-56" placeholder="Search notes" label="Search" />
        <select name="category" defaultValue={category ?? ""} className="input !w-44 !py-2 text-sm" aria-label="Category">
          <option value="">All categories</option>
          {options.categories.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select name="direction" defaultValue={direction ?? ""} className="input !w-36 !py-2 text-sm" aria-label="Direction">
          <option value="">In and out</option>
          <option value="in">Money in</option>
          <option value="out">Money out</option>
        </select>
        <button className="btn-ghost !py-2 text-sm" type="submit">Filter</button>
      </form>

      <Section title="Entries" aside={totals.entries === 1 ? "1 entry" : `${totals.entries} entries`}>
        <div className="panel overflow-x-auto">
          <table className="ledger min-w-[34rem]">
            <thead><tr><th>Date</th><th>Category</th><th>Note</th><th className="text-right">Amount</th></tr></thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="tabular-nums text-xs">{new Date(e.entry_date).toISOString().slice(0, 10)}</td>
                  <td>{e.category}</td>
                  <td className="muted">{e.description}</td>
                  <td className={`text-right tabular-nums ${e.money_in ? "text-[#7fd08a]" : "text-[#e08a8a]"}`}>{e.money_in ? `+${g(e.money_in)}` : `−${g(e.money_out)}`}g</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!entries.length && <Empty>No entries found.</Empty>}
        </div>
        <Pager page={page} total={totals.entries} href={(p) => pageHref("/admin/treasury", { ...filters, ...dated, page: p ? String(p) : undefined })} />
      </Section>
    </>
  );
}
