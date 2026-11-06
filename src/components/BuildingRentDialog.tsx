"use client";

import { useRef, useState } from "react";
import { g, num, rentCountdown, utcLabel } from "@/lib/format";
import { payBuildingRentAction, saveRentPaidUntilAction } from "@/lib/store-actions";
import type { BuildingRent } from "@/lib/store-data";

/** The Tavern's rent dialog: the amount follows days × daily rent and can still be overwritten. */
export default function BuildingRentDialog({ rent, owner }: { rent: BuildingRent; owner: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cap = rent.days_left_to_prepay;
  const amountFor = (n: number) => String(Math.round(n * rent.per_day * 100) / 100);
  const [days, setDays] = useState(String(Math.max(1, cap)));
  const [amount, setAmount] = useState(amountFor(Math.max(1, cap)));
  const whole = Math.floor(num(days));
  const tooMany = whole > cap;
  const close = () => dialog.current?.close();

  return (
    <>
      <button className="btn-ghost !py-2 text-sm" type="button" onClick={() => dialog.current?.showModal()}>Pay building rent</button>
      <dialog ref={dialog} aria-labelledby="rent-title" className="panel m-auto w-[calc(100%-2rem)] max-w-md p-5 text-inherit backdrop:bg-black/70">
        <form
          action={async (data) => {
            await payBuildingRentAction(data);
            close();
          }}
          className="space-y-4"
        >
          <div>
            <h2 id="rent-title" className="font-display text-xl">Pay building rent</h2>
            <p className="muted text-sm mt-1">
              {g(rent.per_day)}g per day (set in Settings), prepaid at most 7 days ahead. Books a Rent expense to the treasury.
            </p>
          </div>
          <div className="panel px-3 py-2.5 text-sm">
            <div className="muted">Rent status</div>
            <div className="tabular-nums">{rentCountdown(rent.minutes_left)}</div>
            {rent.paid_until && <div className="muted text-xs mt-0.5">due {utcLabel(rent.paid_until)}</div>}
            <div className={`text-xs mt-0.5 ${cap > 0 ? "muted" : "text-[#e0bd4a]"}`}>
              {cap > 0 ? `You can add up to ${cap} more ${cap === 1 ? "day" : "days"} right now.` : "Already prepaid 7 days ahead, nothing more can be paid yet."}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="lbl" htmlFor="rent-days">Days</label>
              <input
                id="rent-days"
                name="days"
                inputMode="numeric"
                value={days}
                disabled={cap <= 0}
                onChange={(e) => {
                  setDays(e.target.value);
                  setAmount(amountFor(Math.floor(num(e.target.value))));
                }}
                className="input"
              />
            </div>
            <div>
              <label className="lbl" htmlFor="rent-amount">Amount</label>
              <input id="rent-amount" name="amount" inputMode="decimal" value={amount} disabled={cap <= 0} onChange={(e) => setAmount(e.target.value)} className="input" />
            </div>
          </div>
          {tooMany && cap > 0 && <p className="text-xs text-[#e08a8a]">At most {cap} {cap === 1 ? "day" : "days"} can be added right now.</p>}
          <div className="flex justify-end gap-2">
            <button className="btn-ghost !py-2 text-sm" type="button" onClick={close}>Cancel</button>
            <button className="btn-gold !py-2 text-sm" type="submit" disabled={cap <= 0 || whole < 1 || tooMany || num(amount) <= 0}>Pay {g(num(amount))}g</button>
          </div>
        </form>
        {owner && (
          <form key={rent.paid_until} action={saveRentPaidUntilAction} className="grid grid-cols-[1fr_auto] gap-2 items-end border-t border-[#2b4149] mt-4 pt-3">
            <div>
              <label className="muted text-xs block mb-1" htmlFor="rent-until">Doesn&apos;t match the game? Correct the paid-until time (UTC)</label>
              <input id="rent-until" name="paid_until" type="datetime-local" defaultValue={rent.paid_until_input ?? ""} className="input !py-1 text-sm" />
            </div>
            <button className="btn-ghost !py-1 text-sm" type="submit">Set</button>
          </form>
        )}
      </dialog>
    </>
  );
}
