import { getItems } from "@/lib/sheets";
import { submitOrderAction } from "@/lib/actions";
import { PICKUP_LOCATIONS } from "@/lib/types";

export const revalidate = 60;

export default async function OrderPage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const sp = await searchParams;
  const items = (await getItems()).filter((i) => i.active);
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="font-display text-3xl">Request goods</h1>
      <p className="text-[#b8a888] text-sm">No login needed. We meet in Windhelm, Darkwater Crossing, or Whiterun. Pay in gold on pickup.</p>
      {sp.ok && <div className="card p-4 border-[#2f6b3d]">Received! The quartermaster will confirm soon. Shor&apos;s strength to you.</div>}
      <form action={submitOrderAction} className="card p-5 space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div><label className="lbl">Character name *</label><input name="customer_char" required className="input" placeholder="e.g. Nalion Duryan" /></div>
          <div><label className="lbl">Discord handle</label><input name="discord_handle" className="input" placeholder="@you" /></div>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="lbl">Item *</label>
            <select name="item_id" required className="input">
              {items.map((i) => <option key={i.id} value={i.id}>{i.name} — {i.sale_price}g ({i.stock} in stock)</option>)}
            </select>
          </div>
          <div><label className="lbl">Qty</label><input name="qty" type="number" min={1} defaultValue={1} className="input" /></div>
        </div>
        <div>
          <label className="lbl">Pickup</label>
          <select name="pickup_location" className="input">
            {PICKUP_LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div><label className="lbl">Notes</label><textarea name="notes" className="input" rows={3} placeholder="Size, color, enchant, urgency…" /></div>
        <button className="btn-gold" type="submit">Send request</button>
      </form>
    </div>
  );
}
