import ConfirmButton from "@/components/ConfirmButton";
import { Empty, Notice, PageHeader, Section, Stat } from "@/components/store-ui";
import { g } from "@/lib/format";
import { isManager, requireStaff } from "@/lib/store-access";
import { deleteRentalAction, deleteUnitAction, endRentalAction, extendRentalAction, payBuildingRentAction, rentOutAction, saveBuildingRentAction, saveUnitAction } from "@/lib/store-actions";
import { buildingRent, listUnits, rentalHistory, type BuildingRent, type RentalUnit } from "@/lib/store-data";
import { SHOP } from "@/shop/config";

export const dynamic = "force-dynamic";

function UnitFields({ unit }: { unit?: RentalUnit }) {
  const id = unit?.id ?? "new";
  return (
    <>
      {unit && <input type="hidden" name="id" value={unit.id} />}
      <div><label className="lbl" htmlFor={`name-${id}`}>Name</label><input id={`name-${id}`} name="name" defaultValue={unit?.name} className="input !py-1 text-sm" placeholder="Barrel 15" required /></div>
      <div><label className="lbl" htmlFor={`rate-${id}`}>Per week</label><input id={`rate-${id}`} name="weekly_price" inputMode="decimal" defaultValue={unit ? g(unit.weekly_price) : "60"} className="input !py-1 text-sm" /></div>
      <div>
        <label className="lbl" htmlFor={`site-${id}`}>Site</label>
        <select id={`site-${id}`} name="location" defaultValue={unit?.location ?? SHOP.defaultLocation} className="input !py-1 text-sm">
          {SHOP.locations.map((l) => <option key={l}>{l}</option>)}
        </select>
      </div>
      <div>
        <label className="lbl" htmlFor={`kind-${id}`}>Kind</label>
        <select id={`kind-${id}`} name="kind" defaultValue={unit?.kind ?? "rental"} className="input !py-1 text-sm">
          <option value="rental">Rental</option>
          <option value="internal">Internal</option>
        </select>
      </div>
      <label className="flex items-center gap-2 text-xs cursor-pointer">
        <input type="checkbox" name="secured" value="1" defaultChecked={unit?.secured} className="accent-[#d97a1f]" />
        Behind a locked door
      </label>
    </>
  );
}

function UnitCard({ u, manager }: { u: RentalUnit; manager: boolean }) {
  const rented = !!u.rental_id;
  const overdue = rented && (u.days_left ?? 0) < 0;
  const internal = u.kind === "internal";
  return (
    <div className={`panel p-4 space-y-3 ${overdue ? "border-[#7a2430]" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate">{u.name}</div>
          <div className="muted text-xs truncate">{internal ? "Company use" : `${g(u.rate ?? u.weekly_price)}g per week`}{u.secured ? " · locked" : ""}</div>
        </div>
        {!internal && <span className={overdue ? "badge border-[#7a2430] text-[#e08a8a]" : rented ? "badge badge-in" : "badge badge-out"}>{overdue ? "overdue" : rented ? "rented" : "free"}</span>}
      </div>

      {rented && (
        <div className="text-sm">
          {u.renter}
          <span className="muted text-xs block">
            since {u.start_date} · paid until {u.paid_until} ({overdue ? `${-(u.days_left ?? 0)} days over` : `${u.days_left} days left`})
          </span>
        </div>
      )}

      {manager && rented && (
        <div className="flex items-center justify-between gap-2">
          <form action={extendRentalAction} className="flex gap-2">
            <input type="hidden" name="id" value={u.rental_id ?? ""} />
            <input name="weeks" inputMode="numeric" defaultValue="1" className="input !w-14 !py-1 text-sm" aria-label={`Weeks to extend ${u.name}`} />
            <button className="btn-gold !py-1 text-sm" type="submit">Extend</button>
          </form>
          <form action={endRentalAction}>
            <input type="hidden" name="id" value={u.rental_id ?? ""} />
            <ConfirmButton className="btn-ghost !py-1 text-sm" message={`End the rental of ${u.name}? ${u.renter} moves out, paid amounts stay booked.`}>End</ConfirmButton>
          </form>
        </div>
      )}

      {manager && !rented && !internal && (
        <form action={rentOutAction} className="flex gap-2">
          <input type="hidden" name="id" value={u.id} />
          <input name="renter" className="input !py-1 text-sm min-w-0" placeholder="Renter" aria-label={`Renter of ${u.name}`} required />
          <input name="weeks" inputMode="numeric" defaultValue="1" className="input !w-14 !py-1 text-sm" aria-label={`Weeks for ${u.name}`} />
          <button className="btn-gold !py-1 text-sm whitespace-nowrap" type="submit">Rent out</button>
        </form>
      )}

      {manager && !rented && (
        <details>
          <summary className="muted text-xs cursor-pointer">Edit unit</summary>
          <form action={saveUnitAction} className="grid grid-cols-2 gap-2 mt-2 items-end">
            <UnitFields unit={u} />
            <button className="btn-ghost !py-1 text-sm" type="submit">Save</button>
          </form>
          {!u.has_history && (
            <form action={deleteUnitAction} className="mt-2">
              <input type="hidden" name="id" value={u.id} />
              <ConfirmButton className="muted text-xs underline" message={`Delete ${u.name}?`}>Delete unit</ConfirmButton>
            </form>
          )}
        </details>
      )}
    </div>
  );
}

function RentPanel({ rent, owner }: { rent: BuildingRent; owner: boolean }) {
  const cap = rent.days_left_to_prepay;
  return (
    <details className="mb-6">
      <summary className="btn-ghost inline-block !py-2 text-sm cursor-pointer">Pay building rent</summary>
      <div className="panel p-4 mt-3 space-y-4 max-w-xl">
        <p className="muted text-xs">
          {g(rent.per_day)}g per day, prepaid at most 7 days ahead. Books a Rent expense to the treasury.{" "}
          {cap > 0 ? `You can add up to ${cap} more ${cap === 1 ? "day" : "days"} right now.` : "Already prepaid 7 days ahead."}
        </p>
        <form action={payBuildingRentAction} className="grid grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div><label className="lbl" htmlFor="rent-days">Days</label><input id="rent-days" name="days" inputMode="numeric" defaultValue={Math.max(1, cap)} className="input !py-1 text-sm" /></div>
          <div><label className="lbl" htmlFor="rent-amount">Amount</label><input id="rent-amount" name="amount" inputMode="decimal" className="input !py-1 text-sm" placeholder="Days × rate" /></div>
          <button className="btn-gold !py-1 text-sm" type="submit" disabled={cap <= 0}>Pay</button>
        </form>
        {owner && (
          <form key={`${rent.per_day}-${rent.paid_until}`} action={saveBuildingRentAction} className="grid grid-cols-[1fr_1.4fr_auto] gap-3 items-end border-t border-[#2b4149] pt-4">
            <div><label className="lbl" htmlFor="rent-rate">Per day</label><input id="rent-rate" name="per_day" inputMode="decimal" defaultValue={g(rent.per_day)} className="input !py-1 text-sm" /></div>
            <div><label className="lbl" htmlFor="rent-until">Paid until (UTC)</label><input id="rent-until" name="paid_until" type="datetime-local" defaultValue={rent.paid_until_input ?? ""} className="input !py-1 text-sm" /></div>
            <button className="btn-ghost !py-1 text-sm" type="submit">Save</button>
          </form>
        )}
      </div>
    </details>
  );
}

export default async function Rentals({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const access = await requireStaff();
  const manager = isManager(access);
  const { error } = await searchParams;
  const [units, history, rent] = await Promise.all([
    listUnits(access.profileId),
    rentalHistory(access.profileId),
    manager ? buildingRent(access.profileId) : null,
  ]);

  const rentable = units.filter((u) => u.kind === "rental");
  const rented = rentable.filter((u) => u.rental_id);
  const overdue = rented.filter((u) => (u.days_left ?? 0) < 0).length;
  const weekly = rented.reduce((sum, u) => sum + (u.rate ?? 0), 0);

  const sites = new Map<string, RentalUnit[]>();
  for (const u of units) sites.set(u.location, [...(sites.get(u.location) ?? []), u]);

  return (
    <>
      <PageHeader title="Rentals" subtitle="Storage for rent, paid by the week. The income counts towards the weekly split." />
      <Notice error={error} />

      <div className={`grid gap-3 mb-6 ${rent ? "grid-cols-2 md:grid-cols-4" : "grid-cols-3"}`}>
        <Stat label="Weekly income" value={`${g(weekly)}g`} />
        {rent && <Stat label="Building rent (weekly)" value={`${g(rent.per_day * 7)}g`} />}
        <Stat label="Rented" value={`${rented.length} of ${rentable.length}`} />
        <Stat label="Overdue" value={String(overdue)} tone={overdue ? "bad" : undefined} />
      </div>
      {rent && (
        <p className="muted text-xs -mt-3 mb-6">
          Building rent paid until {rent.paid_until ? `${rent.paid_until} UTC` : "not tracked yet"}
          {rent.payments.length > 0 && ` · last: ${rent.payments.map((p) => `${p.day} · ${g(p.amount)}g`).join(" / ")}`}
        </p>
      )}

      {rent && <RentPanel rent={rent} owner={access.role === "owner"} />}
      {manager && (
        <details className="mb-6">
          <summary className="btn-ghost inline-block !py-2 text-sm cursor-pointer">+ New unit</summary>
          <form action={saveUnitAction} className="panel p-4 mt-3 grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
            <UnitFields />
            <button className="btn-gold !py-2 text-sm" type="submit">Add</button>
          </form>
        </details>
      )}

      {!units.length && <div className="panel mb-8"><Empty>No storage units yet.</Empty></div>}
      {[...sites.entries()].map(([site, list]) => (
        <Section key={site} title={site}>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 items-start">
            {list.map((u) => <UnitCard key={u.id} u={u} manager={manager} />)}
          </div>
        </Section>
      ))}

      <Section title="Rental history">
        <div className="panel overflow-x-auto">
          <table className="ledger min-w-[34rem]">
            <thead><tr><th>Unit</th><th>Renter</th><th>Period</th><th className="text-right">Paid</th>{manager && <th />}</tr></thead>
            <tbody>
              {history.map((r) => (
                <tr key={r.id}>
                  <td>{r.unit}</td>
                  <td>{r.renter}</td>
                  <td className="tabular-nums text-xs">{r.start_date} – {r.paid_until}{r.ended ? " · ended" : ""}</td>
                  <td className="text-right tabular-nums">{g(r.paid)}g</td>
                  {manager && (
                    <td className="text-right">
                      <form action={deleteRentalAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <ConfirmButton className="btn-ghost !py-1 !px-2 text-sm" message={`Delete this rental of ${r.unit}? Its income bookings are removed too. Only for mistakes.`}>×</ConfirmButton>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!history.length && <Empty>No rentals yet.</Empty>}
        </div>
      </Section>
    </>
  );
}
