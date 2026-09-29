"use client";
import { useState } from "react";

/** Location picker: known places + "new place" escape hatch. */
export default function LocationSelect({
  locations,
  name = "location",
  label = "Location",
}: {
  locations: string[];
  name?: string;
  label?: string;
}) {
  const [mode, setMode] = useState<"pick" | "new">("pick");
  const [picked, setPicked] = useState(locations[0] || "Gallow's Rock");

  if (mode === "new" || !locations.length) {
    return (
      <div>
        <label className="lbl">{label} (new)</label>
        <div className="flex gap-2">
          <input name={name} required className="input" placeholder="e.g. Riften" />
          {locations.length > 0 && (
            <button type="button" onClick={() => setMode("pick")} className="btn-ghost !py-1 text-xs whitespace-nowrap" title="Pick known place instead">List ▾</button>
          )}
        </div>
      </div>
    );
  }
  return (
    <div>
      <label className="lbl">{label}</label>
      <div className="flex gap-2">
        <select className="input" value={picked} onChange={(e) => setPicked(e.target.value)}>
          {locations.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <input type="hidden" name={name} value={picked} />
        <button type="button" onClick={() => setMode("new")} className="btn-ghost !py-1 text-xs whitespace-nowrap" title="Add a new place">+ New</button>
      </div>
    </div>
  );
}
