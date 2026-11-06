"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

const MAX_SHOWN = 8;
const TYPING_PAUSE_MS = 200;

/**
 * A text box that offers matching names while you type, like the Tavern's search.
 * With `onPick`, picking a name hands it over. Otherwise the page follows along:
 * every keystroke applies the surrounding form to the URL, without a reload.
 */
export default function SuggestInput({ id, autoFocus, name, options, defaultValue = "", placeholder, label, className = "", onPick }: {
  id?: string;
  autoFocus?: boolean;
  name?: string;
  options: string[];
  defaultValue?: string;
  placeholder?: string;
  label: string;
  className?: string;
  onPick?: (value: string) => void;
}) {
  const list = useId();
  const router = useRouter();
  const pathname = usePathname();
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  useEffect(() => () => clearTimeout(timer.current), []);

  const typed = value.trim().toLowerCase();
  const matches = typed
    ? [...new Set(options)]
        .filter((o) => o.toLowerCase().includes(typed) && (onPick || o.toLowerCase() !== typed))
        .sort((a, b) => Number(b.toLowerCase().startsWith(typed)) - Number(a.toLowerCase().startsWith(typed)) || a.localeCompare(b))
        .slice(0, MAX_SHOWN)
    : [];
  const showing = open && matches.length > 0;

  const apply = (text: string) => {
    clearTimeout(timer.current);
    const form = input.current?.form;
    if (!form || !name) return;
    const query = new URLSearchParams();
    for (const [key, field] of new FormData(form)) if (typeof field === "string" && field) query.set(key, field);
    if (text) query.set(name, text);
    else query.delete(name);
    router.replace(`${pathname}?${query}`, { scroll: false });
  };

  const pick = (option: string) => {
    setValue(option);
    setOpen(false);
    setActive(-1);
    if (onPick) onPick(option);
    else apply(option);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") setOpen(false);
    if (e.key === "Enter" && !showing && !onPick) {
      e.preventDefault();
      setOpen(false);
      apply(value);
    }
    if (!showing) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => (a + step + matches.length) % matches.length);
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0) pick(matches[active]);
      else if (onPick) pick(matches[0]);
      else {
        setOpen(false);
        apply(value);
      }
    }
  };

  return (
    <div className={`relative ${className}`}>
      <input
        ref={input}
        id={id}
        autoFocus={autoFocus}
        name={name}
        value={value}
        onChange={(e) => {
          const text = e.target.value;
          setValue(text);
          setOpen(true);
          setActive(-1);
          if (!onPick) {
            clearTimeout(timer.current);
            timer.current = setTimeout(() => apply(text), TYPING_PAUSE_MS);
          }
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
        <ul id={list} role="listbox" className="panel !bg-[#101a1e] absolute z-30 mt-1 w-full min-w-56 max-h-64 overflow-y-auto py-1 text-sm">
          {matches.map((m, i) => (
            <li
              key={m}
              id={`${list}-${i}`}
              role="option"
              aria-selected={i === active}
              // Before the blur closes the list.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(m);
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
