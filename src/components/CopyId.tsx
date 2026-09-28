"use client";
import { useState } from "react";

export default function CopyId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(id);
        } catch {
          const ta = document.createElement("textarea");
          ta.value = id;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="btn-ghost !py-1 text-xs"
      title="Copy user ID to send to whoever runs the books"
    >
      {copied ? "Copied ✓" : "Copy ID"}
    </button>
  );
}
