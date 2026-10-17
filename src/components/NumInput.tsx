"use client";
import { useState } from "react";

/**
 * Gold/quantity field that accepts both "15.5" and "15,5" (comma decimal, as
 * mobile keypads in comma-locales produce). Uses inputMode=decimal so phones
 * show the numeric pad; the raw text is submitted and parsed by num().
 * Fully controlled when `value` is provided, otherwise uncontrolled.
 */
export default function NumInput({
  name,
  defaultValue,
  value,
  onValueChange,
  className = "input",
  placeholder,
  title,
  required,
  ariaLabel,
}: {
  name?: string;
  defaultValue?: string | number;
  value?: string;
  onValueChange?: (v: string) => void;
  className?: string;
  placeholder?: string;
  title?: string;
  required?: boolean;
  ariaLabel?: string;
}) {
  const controlled = value !== undefined;
  const [draft, setDraft] = useState<string>(controlled ? value! : String(defaultValue ?? ""));
  const shown = controlled ? value! : draft;
  const handle = (raw: string) => {
    if (controlled) onValueChange?.(raw);
    else setDraft(raw);
  };
  return (
    <input
      {...(name ? { name } : {})}
      type="text"
      inputMode="decimal"
      value={shown}
      onChange={(e) => handle(e.target.value)}
      className={className}
      placeholder={placeholder}
      title={title}
      required={required}
      aria-label={ariaLabel}
    />
  );
}
