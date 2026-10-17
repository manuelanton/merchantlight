"use client";
import { useActionState } from "react";
import { createCategoryAction, type ActionResult } from "@/lib/admin-actions";

export default function AddCategoryForm() {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(createCategoryAction, null);
  return (
    <form action={formAction} className="flex flex-wrap gap-2 items-end">
      {state?.error && (
        <p className="w-full text-sm text-[#e08a8a] border border-[#7a2430] bg-[#7a2430]/20 rounded-lg px-3 py-2">{state.error}</p>
      )}
      <div><label className="lbl">Name</label><input name="name" required className="input !w-auto" placeholder="e.g. Enchantments" /></div>
      <div><label className="lbl">Icon</label><input name="icon" defaultValue="📦" className="input !w-20" /></div>
      <button className="btn-gold !py-1 text-sm" type="submit" disabled={pending}>{pending ? "Adding…" : "Add section"}</button>
    </form>
  );
}
