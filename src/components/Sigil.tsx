"use client";
import { useState } from "react";

export default function Sigil() {
  const [missing, setMissing] = useState(false);
  if (missing) return <span className="text-2xl" aria-hidden>🕯️</span>;
  return (
    <img
      src="/logo.png"
      alt="Merchantlight Company sigil — three hounds"
      width={44}
      height={44}
      className="h-11 w-11 rounded-full object-cover border border-[#c9a227]/60 bg-[#0b0a09]"
      onError={() => setMissing(true)}
    />
  );
}
