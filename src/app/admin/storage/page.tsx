import {
  addUnitAction,
  collectUnitAction,
  deleteUnitAction,
  freeUnitAction,
  rentUnitAction,
  setRateAction,
} from "@/lib/admin-actions";
import { getStorage } from "@/lib/storage";
import { g } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function StoragePage() {
  const s = await getStorage();

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">Storage rentals</h1>
      <p className="text-sm text-[#8a7c64]">
        {s.filled} of {s.units.length} filled · {s.free} free · {g(s.earned)}g earned to company coffers.
        Income posts unattributed — it never dilutes member splits.
      </p>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {s.units.map((u) => {
          const overdue = u.occupant && (!u.paidThrough || new Date(u.paidThrough).getTime() < Date.now());
          return (
            <div key={u.id} className="card p-4 space-y-2">
              <div className="flex items-center gap-2">
                <b className="font-display text-lg">{u.label}</b>
                <span className={u.occupant ? (overdue ? "badge badge-out" : "badge badge-in") : "badge"}>
                  {u.occupant ? (overdue ? "Overdue" : "Occupied") : "Free"}
                </span>
                <span className="ml-auto text-[#e0bd4a]">{g(u.ratePerWeek)}g/wk</span>
              </div>
              {u.occupant ? (
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
                    <form action={setRateAction} className="flex gap-1 items-center ml-auto">
                      <input type="hidden" name="id" value={u.id} />
                      <input name="rate_per_week" type="number" min={0} step="any" defaultValue={u.ratePerWeek} className="input !w-20 !py-1 text-xs" title="Weekly rate" />
                      <button className="btn-ghost !py-1 text-xs" type="submit" title="Set rate">✓</button>
                    </form>
                    <form action={deleteUnitAction}>
                      <input type="hidden" name="id" value={u.id} />
                      <button className="btn-ghost !py-1 !px-2 text-xs" type="submit" title="Delete unit (must be empty)">✕</button>
                    </form>
                  </div>
                </>
              ) : (
                <>
                  <form action={rentUnitAction} className="flex gap-2">
                    <input type="hidden" name="id" value={u.id} />
                    <input name="occupant" required className="input !py-1 text-sm flex-1" placeholder="Occupant name…" />
                    <button className="btn-gold !py-1 text-xs whitespace-nowrap" type="submit">Rent out</button>
                  </form>
                  <p className="text-xs text-[#8a7c64]">Collect appears here once occupied — nothing to collect from an empty chest.</p>
                </>
              )}
            </div>
          );
        })}
      </div>

      <form action={addUnitAction} className="card p-4 flex flex-wrap gap-2 items-end">
        <div><label className="lbl">New unit label</label><input name="label" className="input !w-auto" placeholder="Chest 13" /></div>
        <div><label className="lbl">Rate/wk (g)</label><input name="rate_per_week" type="number" min={0} step="any" defaultValue={60} className="input !w-28" /></div>
        <button className="btn-gold !py-2 text-sm" type="submit">Add unit</button>
      </form>
    </div>
  );
}
