import Link from "next/link";
import Sigil from "@/components/Sigil";
import { UPCOMING_SECTIONS, isSheetsConfigured } from "@/lib/sheets";
import { getCatalogue } from "@/lib/catalog";
import { isShopOpen } from "@/lib/shop";
import { getStorage } from "@/lib/storage";
import { SHOP } from "@/shop/config";

export const revalidate = 60;

export default async function Home() {
  const [{ categories, items }, open, storage] = await Promise.all([getCatalogue(), isShopOpen(), getStorage(SHOP.homeLocation)]);
  const sorted = [...categories].sort((a, b) => a.sort_order - b.sort_order);
  const active = items.filter((i) => i.active && !i.parent_id);
  const sections = sorted
    .map((c) => {
      const list = active.filter((i) => i.category_slug === c.slug);
      if (!list.length && !UPCOMING_SECTIONS.some((u) => u.slug === c.slug)) return null;
      const prices = list.map((i) => i.sale_price);
      return {
        ...c,
        comingSoon: list.length === 0,
        count: list.length,
        min: prices.length ? Math.min(...prices) : 0,
        max: prices.length ? Math.max(...prices) : 0,
      };
    })
    .filter((s) => s !== null);

  return (
    <div className="space-y-8">
      <section className="card p-6 md:p-8 flex items-center gap-6">
        <div className="shrink-0 hidden sm:block">
          <Sigil size={128} />
        </div>
        <div>
          <h1 className="font-display text-3xl md:text-4xl">{SHOP.company}</h1>
          <p className="mt-2">
            {open ? (
              <span className="badge badge-in">{SHOP.openBadge}</span>
            ) : (
              <span className="badge badge-out">{SHOP.closedBadge}</span>
            )}
          </p>
          <p className="mt-2 text-[#cbbfa5] max-w-2xl">
            {SHOP.tagline}
          </p>
          <p className="mt-1 text-sm text-[#e0bd4a]">{SHOP.buyingCallout}</p>
          {!isSheetsConfigured() && (
            <p className="mt-4 text-xs text-[#8a7c64]">
              Running on built-in seed data. Connect a Google Sheet (SHEET_ID) to edit stock without redeploying.
            </p>
          )}
        </div>
      </section>

      <section id="sections" className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 scroll-mt-24">
        {sections.map((s) => (
          <Link key={s.slug} href={`/catalog/${s.slug}`} className="card p-5 hover:border-[#d97a1f] transition block">
            <div className="font-display text-xl">{s.icon} {s.name}</div>
            {s.comingSoon ? (
              <p className="mt-2 text-[#e0bd4a] font-display text-sm tracking-widest">✨ SOON TO COME ✨</p>
            ) : (
              <>
                <p className="text-sm text-[#b8a888] mt-1">
                  {s.count} goods
                </p>
                <p className="mt-2 text-[#e0bd4a]">
                  {s.min === s.max ? `${s.min}g` : `${s.min}–${s.max}g`}
                  <span className="text-sm text-[#c9a227] ml-2">Browse →</span>
                </p>
              </>
            )}
          </Link>
        ))}
        {SHOP.features.storagePublic && (
        <Link href="#find-us" className="card p-5 hover:border-[#d97a1f] transition block">
          <div className="font-display text-xl">🛢️ Storage</div>
          <p className="text-sm text-[#b8a888] mt-1">
            Barrels at our shop — ask about storage on offer
          </p>
          <p className="mt-2 text-[#e0bd4a]">
            {storage.units.length ? (storage.free > 0 ? "Space available" : "Full right now") : "Ask for availability"}
            <span className="text-sm text-[#c9a227] ml-2">Visit us →</span>
          </p>
        </Link>
        )}
      </section>

      <section id="find-us" className="card overflow-hidden scroll-mt-24">
        <img src="/darkwater-shop.jpg" alt={`The ${SHOP.company} general store in ${SHOP.homeLocation}`} className="w-full h-auto block" />
        <div className="p-6 md:p-8 space-y-2">
          <h2 className="font-display text-2xl">Visit us</h2>
          <p className="text-[#cbbfa5] max-w-2xl">
            You&apos;ll find us at the <b className="text-[#e8dcc4]">{SHOP.visitStore}</b> —
            look for the lantern sign. Can&apos;t make the trip? We arrange{" "}
            <b className="text-[#e8dcc4]">{SHOP.visitDelivery}</b> — find us in town or send word and we&apos;ll meet you on the road.
          </p>
          {SHOP.features.storagePublic && (
          <p className="text-[#cbbfa5] max-w-2xl">
            Need space? Ask about <b className="text-[#e8dcc4]">barrel storage</b> at our shop.
          </p>
          )}
          <p className="text-[#e0bd4a]">{SHOP.buyingCalloutLong}</p>
          <p className="text-sm text-[#8a7c64]">{SHOP.priceNote}</p>
        </div>
      </section>
    </div>
  );
}
