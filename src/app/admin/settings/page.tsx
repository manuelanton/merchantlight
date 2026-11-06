import ConfirmButton from "@/components/ConfirmButton";
import { Notice, PageHeader, Section } from "@/components/store-ui";
import { g } from "@/lib/format";
import { requireOwner } from "@/lib/store-access";
import { addCategoryAction, removeCategoryAction, renameCategoryAction, saveDailyRentAction } from "@/lib/store-actions";
import { buildingRent, listCategories } from "@/lib/store-data";

export const dynamic = "force-dynamic";

export default async function Settings({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const access = await requireOwner();
  const { error } = await searchParams;
  const [rent, categories] = await Promise.all([buildingRent(access.profileId), listCategories(access.profileId)]);

  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" subtitle="Store-wide numbers used across Rentals and Treasury." />
      <Notice error={error} />

      <form key={rent.per_day} action={saveDailyRentAction} className="panel p-4 flex flex-wrap items-center justify-between gap-4 mb-8">
        <div className="min-w-0 flex-1 basis-64">
          <label htmlFor="per_day">Daily rent</label>
          <p className="muted text-xs mt-0.5">What the building costs per day. Rentals works out the amount to pay from it.</p>
        </div>
        <div className="flex gap-2">
          <input id="per_day" name="per_day" inputMode="decimal" defaultValue={g(rent.per_day)} className="input !w-28 !py-1 text-sm text-right" />
          <button className="btn-gold !py-1 text-sm" type="submit">Save</button>
        </div>
      </form>

      <Section title="Categories" aside="Items can only be put in these. Raw Materials is what recipes are made of.">
        <div className="panel divide-y divide-[#2b4149] mb-3">
          {categories.map((c) => (
            <div key={`${c.id}-${c.name}`} className="flex flex-wrap items-center gap-2 p-3">
              {c.is_system ? (
                <span className="flex-1 basis-48 text-sm">{c.name}</span>
              ) : (
                <form action={renameCategoryAction} className="flex flex-1 basis-48 gap-2">
                  <input type="hidden" name="id" value={c.id} />
                  <input name="name" defaultValue={c.name} maxLength={40} className="input !py-1 text-sm" aria-label={`Name of ${c.name}`} required />
                  <button className="btn-ghost !py-1 text-sm" type="submit">Rename</button>
                </form>
              )}
              <span className="muted text-xs tabular-nums w-16 text-right">{c.items} {c.items === 1 ? "item" : "items"}</span>
              {!c.is_system && (
                <form action={removeCategoryAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <ConfirmButton message={`Remove the category ${c.name}?`} className="btn-ghost !py-1 !px-2 text-sm"><span aria-label={`Remove ${c.name}`}>×</span></ConfirmButton>
                </form>
              )}
            </div>
          ))}
        </div>
        <form action={addCategoryAction} className="flex gap-2">
          <input name="name" maxLength={40} placeholder="New category" className="input !py-2 text-sm" aria-label="New category" required />
          <button className="btn-gold !py-2 text-sm" type="submit">Add</button>
        </form>
      </Section>
    </div>
  );
}
