import { Empty, Notice, PageHeader, Section, Stat } from "@/components/store-ui";
import { g } from "@/lib/format";
import { requireManager } from "@/lib/store-access";
import { addTreasuryEntryAction } from "@/lib/store-actions";
import { treasuryBalance, treasuryCategories, treasuryEntries } from "@/lib/store-data";

export const dynamic = "force-dynamic";

export default async function Treasury({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const access = await requireManager();
  const { error } = await searchParams;
  const [balance, entries, categories] = await Promise.all([
    treasuryBalance(access.profileId),
    treasuryEntries(access.profileId),
    treasuryCategories(access.profileId),
  ]);

  return (
    <>
      <PageHeader title="Treasury" subtitle="All the company's gold in one place." />
      <Notice error={error} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Stat label="Balance" value={`${g(balance)}g`} tone={balance < 0 ? "bad" : undefined} />
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

      <Section title="Latest entries">
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
          {!entries.length && <Empty>No entries yet.</Empty>}
        </div>
      </Section>
    </>
  );
}
