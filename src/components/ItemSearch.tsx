"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { g } from "@/lib/format";

export interface SearchItem {
  id: string;
  name: string;
  price: number;
  category: string;
  hidden?: boolean;
  parentName?: string | null;
}

/**
 * Searchable item picker with category pills. Type to filter, click a pill to
 * narrow by section, click a result to pick (price auto-fills in the parent).
 * Visible items only by default; unlisted (hidden) ones appear behind the
 * "Show unlisted" toggle and are tagged "(not listed)".
 */
export default function ItemSearch({
  items,
  categories,
  value,
  onSelect,
  category,
  onCategory,
  showPrice = false,
  name = "item_id",
  placeholder = "Search item…",
}: {
  items: SearchItem[];
  categories: { slug: string; name: string; icon?: string }[];
  value: string;
  onSelect: (id: string) => void;
  category: string;
  onCategory: (slug: string) => void;
  showPrice?: boolean;
  name?: string;
  placeholder?: string;
}) {
  const selected = items.find((i) => i.id === value) || null;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [showUnlisted, setShowUnlisted] = useState(false);
  const [hi, setHi] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQ(selected?.name ?? "");
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [selected]);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items
      .filter((i) => {
        if (!showUnlisted && i.hidden && i.id !== value) return false;
        if (category && i.category !== category) return false;
        if (needle && !i.name.toLowerCase().includes(needle)) return false;
        // Only show generic Soul Gem (empty) and Soul Gem (Full) in sales picker
        if (/soul gem/i.test(i.name)) {
          if (i.name !== "Soul Gem (empty)" && i.name !== "Soul Gem (Full)") {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 60);
  }, [items, q, category, showUnlisted, value]);

  const close = (resetQuery = true) => {
    setOpen(false);
    if (resetQuery) setQ(selected?.name ?? "");
  };
  const choose = (i: SearchItem) => {
    onSelect(i.id);
    setQ(i.name);
    setOpen(false);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setHi((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      if (open && results[hi]) { e.preventDefault(); choose(results[hi]); }
    } else if (e.key === "Escape") {
      if (open) { e.preventDefault(); close(); }
    }
  };

  const pills = [{ slug: "", name: "All", icon: "✳️" }, ...categories];

  return (
    <div className="relative" ref={boxRef}>
      <input type="hidden" name={name} value={value} />
      <input
        type="text"
        className="input w-full"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={selected?.name || placeholder}
        value={open ? q : selected?.name ?? ""}
        onFocus={() => { setOpen(true); setQ(selected?.name ?? ""); }}
        onChange={(e) => {
          setQ(e.target.value);
          setHi(0);
          if (!open) setOpen(true);
          if (selected && e.target.value !== selected.name) onSelect("");
        }}
        onKeyDown={onKey}
      />
      {open && (
        <div className="absolute z-30 left-0 right-0 mt-1 card p-2 shadow-lg space-y-2 max-h-[340px] overflow-hidden flex flex-col">
          <div className="flex flex-wrap gap-1.5">
            {pills.map((c) => {
              const on = category === c.slug;
              return (
                <button
                  key={c.slug || "all"}
                  type="button"
                  onClick={() => { onCategory(c.slug); setHi(0); }}
                  className={
                    "text-xs px-2.5 py-1 rounded-full border transition " +
                    (on ? "bg-[#d97a1f] text-[#17100a] border-[#d97a1f] font-bold" : "border-[#2b4149] text-[#8a7c64]")
                  }
                >
                  {c.icon} {c.name}
                </button>
              );
            })}
          </div>
          <div className="overflow-y-auto -mx-2 px-2">
            {results.length === 0 && (
              <p className="text-sm text-[#8a7c64] px-2 py-3">No match. {!showUnlisted && "Unlisted items are hidden — tick below."}</p>
            )}
            {results.map((i, idx) => (
              <button
                key={i.id}
                type="button"
                onMouseEnter={() => setHi(idx)}
                onClick={() => choose(i)}
                className={
                  "w-full text-left px-2 py-1.5 rounded flex items-baseline gap-2 " +
                  (idx === hi ? "bg-[#2b4149]" : "hover:bg-[#1c2b31]")
                }
              >
                <span className="flex-1">
                  {i.name}
                  {i.hidden && <span className="text-xs text-[#8a7c64]"> (not listed)</span>}
                  {i.parentName && <span className="text-xs text-[#8a7c64]"> · {i.parentName}</span>}
                </span>
                {showPrice && <span className="text-sm text-[#e0bd4a] whitespace-nowrap">{g(i.price)}g</span>}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-[#8a7c64] cursor-pointer border-t border-[#1c2b31] pt-2">
            <input
              type="checkbox"
              checked={showUnlisted}
              onChange={(e) => { setShowUnlisted(e.target.checked); setHi(0); }}
              className="accent-[#d97a1f]"
            />
            Show unlisted items (raw materials not on the public catalogue)
          </label>
        </div>
      )}
    </div>
  );
}
