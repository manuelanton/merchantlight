import Link from "next/link";
import LedgerManager from "@/components/LedgerManager";
import { requireQuartermasterPage } from "@/lib/page-auth";

export const dynamic = "force-dynamic";

/** v2 pilot: expenses can log what goods came in, in the same submit. */
export default async function V2LedgerPage() {
  await requireQuartermasterPage();
  return (
    <div className="space-y-4">
      <p className="text-sm text-[#8a7c64]">
        <span className="badge">v2 pilot</span> Expenses carry an optional goods list — one submit for gold + goods.{" "}
        <Link href="/admin/ledger" className="text-[#c9a227]">Back to v1 →</Link>
      </p>
      <LedgerManager showPurchase />
    </div>
  );
}
