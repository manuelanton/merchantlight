import {
  addUnitAction,
  collectUnitAction,
  deleteUnitAction,
  freeUnitAction,
  rentUnitAction,
  updateUnitAction,
} from "@/lib/admin-actions";
import { getStorage, type StorageUnit } from "@/lib/storage";
import { g } from "@/lib/format";

export const dynamic = "force-dynamic";

function UnitCard({ u }: { u: StorageUnit }) {
  const overdue = !!u.occupant && (!u.paidThrough || new Date(u.paidThrough).getTime() < Date.now());
  const internal = u.kind === "internal";
  return (
    <div key={u.id} className="card p-4 space-y-2">
      <div className="flex items-center gap-2">
        <b className="font-display text-lg">{u.label}</b>
        {internal ? (
          <span className="badge">Internal</span>
        ) : (
          <span className={u.occupant ? (overdue ? "badge badge-out" : "badge badge-in") : "badge"}>
            {u.occupant ? (overdue ? "Overdue" : "Occupied") : "Free"}
          </span>
        )}
        {!internal && <span className="ml-auto text-[#e0bd4a]">{g(u.ratePerWeek)}g/wk</span>}
      </div>
      <details>
        <summary className="text-xs text-[#c9a227] cursor-pointer hover:text-[#e8dcc4]">Edit unit (label, rate, site, kind, security)</summary>
        <form action={updateUnitAction} className="grid md:grid-cols-3 gap-2 mt-1">
          <input type="hidden" name="id" value={u.id} />
          <div><label className="lbl">Label</label><input name="label" defaultValue={u.label} required className="input !py-1 text-sm" /></div>
          <div><label className="lbl">Rate/wk (g)</label><input name="rate_per_week" type="number" min={0} step="any" defaultValue={u.ratePerWeek} className="input !py-1 text-sm" /></div>
          <div><label className="lbl">Site</label><input name="location" defaultValue={u.location} required className="input !py-1 text-sm" placeholder="Darkwater Crossing" /></div>
          <div><label className="lbl">Kind</label>
            <select name="kind" defaultValue={u.kind} className="input !py-1 text-sm">
              <option value="rental">Rental</option>
              <option value="internal">Internal</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer md:col-span-2">
            <input type="checkbox" name="secured" value="1" defaultChecked={u.secured} className="accent-[#d97a1f]" />
            Secured (behind a locked door — only the Safe is)
          </label>
          <div className="md:col-span-3"><button className="btn-ghost !py-1 text-xs" type="submit">Save unit</button></div>
        </form>
      </details>
      {internal ? (
        <p className="text-xs text-[#8a7c64]">
          {u.secured ? "Behind a locked door." : "Company use — never rented."}
        </p>
      ) : u.occupant ? (
        <>
          <p className="text-sm">Occupant: <b>{u.occupant}</b></p>
          <p className="text-xs text-[#8a7c64]">
            Paid through: {u.paidThrough ? new Date(u.paidThrough).toLocaleDateString() : "—"}
          </p>
          <div className="flex flex-wrap gap-2">
            <form action={collectUnitAction} className="flex flex-wrap gap-1 items-center">
              <input type="hidden" name="id" value={u.id} />
              <input
                name="paid_from" type="date"
                defaultValue={(() => {
                  const base = u.paidThrough && new Date(u.paidThrough) > new Date() ? new Date(u.paidThrough) : new Date();
                  return base.toISOString().slice(0, 10);
                })()}
                className="input !w-auto !py-1 text-xs" title="Week start — defaults sensibly, adjust freely"
              />
              <button className="btn-gold !py-1 text-xs" type="submit" title="Log one week paid from the chosen date">
                Collect {g(u.ratePerWeek)}g
              </button>
            </form>
                    <form action={freeUnitAction}>
                      <input type="hidden" name="id" value={u.id} />
                      <button className="btn-ghost !py-1 text-xs" type="submit">Free up</button>
                    </form>
                  </div>
        </>
      ) : (
        <>
          <div className="flex gap-2">
            <form action={rentUnitAction} className="flex gap-2 flex-1">
              <input type="hidden" name="id" value={u.id} />
              <input name="occupant" required className="input !py-1 text-sm flex-1" placeholder="Occupant name…" />
              <button className="btn-gold !py-1 text-xs whitespace-nowrap" type="submit">Rent out</button>
            </form>
            <form action={deleteUnitAction}>
              <input type="hidden" name="id" value={u.id} />
              <button className="btn-ghost !py-1 !px-2 text-xs shrink-0" type="submit" title="Delete this empty unit">✕</button>
            </form>
          </div>
          <p className="text-xs text-[#8a7c64]">Collect appears here once occupied — nothing to collect from an empty chest.</p>
        </>
      )}
    </div>
  );
}

export default async function StoragePage() {
  const s = await getStorage();
  const bySite = new Map<string, StorageUnit[]>();
  for (const u of s.units) {
    const g = bySite.get(u.location) || [];
    g.push(u);
    bySite.set(u.location, g);
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">Storage rentals</h1>
      <p className="text-sm text-[#8a7c64]">
        {s.filled} of {s.units.filter((u) => u.kind !== "internal").length} rentals filled · {s.free} free · {g(s.earned)}g earned to company coffers.
        Income posts unattributed — it never dilutes member splits.
      </p>

      {[...bySite.entries()].map(([site, units]) => (
        <section key={site} className="space-y-3">
          <h2 className="font-display text-xl">{site}</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {units.filter((u) => u.kind === "internal").map((u) => <UnitCard key={u.id} u={u} />)}
            {units.filter((u) => u.kind !== "internal").map((u) => <UnitCard key={u.id} u={u} />)}
          </div>
        </section>
      ))}

      <form action={addUnitAction} className="card p-4 flex flex-wrap gap-2 items-end">
        <div><label className="lbl">New unit label</label><input name="label" className="input !w-auto" placeholder="Barrel 15" /></div>
        <div><label className="lbl">Rate/wk (g)</label><input name="rate_per_week" type="number" min={0} step="any" defaultValue={60} className="input !w-28" /></div>
        <button className="btn-gold !py-2 text-sm" type="submit">Add unit</button>
      </form>
    </div>
  );
}
