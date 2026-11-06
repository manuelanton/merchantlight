"use client";

import { useId, useState, type KeyboardEvent } from "react";

const MAX_SHOWN = 8;

/**
 * A text box that offers matching names while you type, like the Tavern's search.
 * Picking one fills it in: `onPick` gets it, otherwise the surrounding form is sent.
 */
export default function SuggestInput({ name, options, defaultValue = "", placeholder, label, className = "", onPick }: {
  name?: string;
  options: string[];
  defaultValue?: string;
  placeholder?: string;
  label: string;
  className?: string;
  onPick?: (value: string) => void;
}) {
  const list = useId();
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const typed = value.trim().toLowerCase();
  const matches = typed
    ? [...new Set(options)]
        .filter((o) => o.toLowerCase().includes(typed) && o.toLowerCase() !== typed)
        .sort((a, b) => Number(b.toLowerCase().startsWith(typed)) - Number(a.toLowerCase().startsWith(typed)) || a.localeCompare(b))
        .slice(0, MAX_SHOWN)
    : [];
  const showing = open && matches.length > 0;

  const pick = (option: string, input: HTMLInputElement | null) => {
    setValue(option);
    setOpen(false);
    setActive(-1);
    if (onPick) onPick(option);
    else queueMicrotask(() => input?.form?.requestSubmit());
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") setOpen(false);
    if (!showing) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => (a + step + matches.length) % matches.length);
    }
    if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(matches[active], e.currentTarget);
    }
  };

  return (
    <div className={`relative ${className}`}>
      <input
        name={name}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className="input !py-2 text-sm"
        placeholder={placeholder}
        aria-label={label}
        role="combobox"
        aria-expanded={showing}
        aria-controls={list}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${list}-${active}` : undefined}
        autoComplete="off"
      />
      {showing && (
        <ul id={list} role="listbox" className="panel absolute z-30 mt-1 w-full min-w-56 max-h-64 overflow-y-auto py-1 text-sm">
          {matches.map((m, i) => (
            <li
              key={m}
              id={`${list}-${i}`}
              role="option"
              aria-selected={i === active}
              // Before the blur closes the list.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(m, e.currentTarget.closest("div")?.querySelector("input") ?? null);
              }}
              className={`px-3 py-1.5 cursor-pointer truncate ${i === active ? "bg-[#241d14] text-[#e0bd4a]" : "hover:bg-[#241d14]"}`}
            >
              {m}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
