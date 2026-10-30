import LedgerManager from "@/components/LedgerManager";
import { requireQuartermasterPage } from "@/lib/page-auth";

export const dynamic = "force-dynamic";

export default async function LedgerPage() {
  await requireQuartermasterPage();
  return <LedgerManager />;
}
