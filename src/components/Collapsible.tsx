"use client";
import { useState } from "react";

export default function Collapsible({
  title,
  defaultOpen = false,
  action,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  action?: (fd: FormData) => void | Promise<void>;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const body = (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full text-left"
        aria-expanded={open}
      >
        <svg
          width="12" height="12" viewBox="0 0 12 12" aria-hidden
          className={`transition-transform ${open ? "rotate-90" : ""}`}
          fill="none" stroke="#c9a227" strokeWidth="2"
        >
          <path d="M4 2l4 4-4 4" />
        </svg>
        <span className="font-display text-lg">{title}</span>
      </button>
      {open && <div className="mt-3 space-y-3">{children}</div>}
    </>
  );
  if (action) {
    return <form action={action} className="card p-4">{body}</form>;
  }
  return <div className="card p-4">{body}</div>;
}
