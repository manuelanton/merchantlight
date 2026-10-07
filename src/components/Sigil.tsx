"use client";
import { useState } from "react";
import { SHOP } from "@/shop/config";

export default function Sigil({ size = 44 }: { size?: number }) {
  const [missing, setMissing] = useState(false);
  if (missing) return <span className="text-2xl" aria-hidden>{SHOP.sigil}</span>;
  return (
    <img
      src={SHOP.logo}
      alt={`${SHOP.company} sigil`}
      height={size}
      // Natural aspect (2534×2205) — never force a square, so no letterbox bars.
      style={{ height: size, width: "auto" }}
      className="rounded-xl object-contain border border-[#c9a227]/60"
      onError={() => setMissing(true)}
    />
  );
}
