import Link from "next/link";

export const revalidate = 60;

export default function VisitPage() {
  return (
    <div className="space-y-4 max-w-3xl">
      <Link href="/" className="text-sm text-[#c9a227]">← Catalogue</Link>
      <h1 className="font-display text-3xl">Visit us</h1>
      <div className="card overflow-hidden">
        {/* Map screenshot lives at public/Gallows_map.webp */}
        <img
          src="/Gallows_map.webp"
          alt="Map showing Gallows Rock, Eastmarch"
          className="w-full h-auto block"
        />
      </div>
      <div className="card p-6 space-y-2">
        <p className="text-[#cbbfa5]">
          You&apos;ll find us in <b className="text-[#e8dcc4]">Gallow&apos;s Rock, Eastmarch</b>.
        </p>
        <p className="text-[#cbbfa5]">
          Can&apos;t make the trip? We arrange <b className="text-[#e8dcc4]">deliveries within Eastmarch</b> —
          find us in Windhelm or send word and we&apos;ll meet you on the road.
        </p>
        <p className="text-[#e0bd4a]">Always buying: ores &amp; charcoal — bring us your surplus.</p>
        <p className="text-[#cbbfa5]">
          Need space? We rent <b className="text-[#e8dcc4]">barrels outside the keep</b> for{" "}
          <b className="text-[#e0bd4a]">60g per week</b> — send word to ask for availability.
        </p>
        <p className="text-sm text-[#8a7c64]">All prices in gold (septims). Bulk rates marked where offered.</p>
      </div>
    </div>
  );
}
