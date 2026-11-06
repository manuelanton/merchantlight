import { Notice, PageHeader } from "@/components/store-ui";
import { g } from "@/lib/format";
import { requireOwner } from "@/lib/store-access";
import { saveDailyRentAction } from "@/lib/store-actions";
import { buildingRent } from "@/lib/store-data";

export const dynamic = "force-dynamic";

export default async function Settings({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const access = await requireOwner();
  const { error } = await searchParams;
  const rent = await buildingRent(access.profileId);

  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" subtitle="Store-wide numbers used across Rentals and Treasury." />
      <Notice error={error} />

      <form key={rent.per_day} action={saveDailyRentAction} className="panel p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1 basis-64">
          <label htmlFor="per_day">Daily rent</label>
          <p className="muted text-xs mt-0.5">What the building costs per day. Rentals works out the amount to pay from it.</p>
        </div>
        <div className="flex gap-2">
          <input id="per_day" name="per_day" inputMode="decimal" defaultValue={g(rent.per_day)} className="input !w-28 !py-1 text-sm text-right" />
          <button className="btn-gold !py-1 text-sm" type="submit">Save</button>
        </div>
      </form>
    </div>
  );
}
