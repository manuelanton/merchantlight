"use client";
import { useState } from "react";

/** Member picker: existing roster + "new member" escape hatch (avoids duplicates/typos). */
export default function MemberSelect({
  members,
  name = "member",
  defaultValue = "",
  label = "Member",
  required = false,
  allowEmpty = false,
  emptyLabel = "—",
}: {
  members: string[];
  name?: string;
  defaultValue?: string;
  label?: string;
  required?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  const [mode, setMode] = useState<"pick" | "new">(
    defaultValue && !members.includes(defaultValue) ? "new" : "pick"
  );
  const [picked, setPicked] = useState(
    members.includes(defaultValue) ? defaultValue : allowEmpty ? "" : members[0] || ""
  );

  if (mode === "new" || !members.length) {
    return (
      <div>
        <label className="lbl">{label} (new)</label>
        <div className="flex gap-2">
          <input name={name} defaultValue={mode === "new" ? defaultValue : ""} required={required} className="input" placeholder="Character name" />
          {members.length > 0 && (
            <button type="button" onClick={() => setMode("pick")} className="btn-ghost !py-1 text-xs whitespace-nowrap" title="Pick existing instead">List ▾</button>
          )}
        </div>
      </div>
    );
  }
  return (
    <div>
      <label className="lbl">{label}</label>
      <div className="flex gap-2">
        <select
          className="input"
          value={picked}
          onChange={(e) => setPicked(e.target.value)}
          required={required}
        >
          {allowEmpty && <option value="">{emptyLabel}</option>}
          {members.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <input type="hidden" name={name} value={picked} />
        <button type="button" onClick={() => setMode("new")} className="btn-ghost !py-1 text-xs whitespace-nowrap" title="Add someone new">+ New</button>
      </div>
    </div>
  );
}
