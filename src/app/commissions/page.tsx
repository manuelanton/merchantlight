import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CommissionForm from "@/components/CommissionForm";
import { Notice, PageHeader } from "@/components/store-ui";
import { backofficeEnabled } from "@/lib/flags";
import { placeCommissionAction } from "@/lib/store-actions";
import { listEecItems } from "@/lib/store-data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Commissions" };

export default async function Commissions({ searchParams }: { searchParams: Promise<{ error?: string; placed?: string }> }) {
  if (!backofficeEnabled()) notFound();
  const { error, placed } = await searchParams;
  const items = await listEecItems();

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader title="Commissions" subtitle="Order what only the EEC sells. We buy it for you, you collect it at the store." />
      <Notice error={error} />
      {placed && <p className="panel px-4 py-3 mb-6 text-sm text-[#e0bd4a]">Thank you! We have your order for {placed}.</p>}
      <CommissionForm items={items} action={placeCommissionAction} catalogue button="Place order" />
    </div>
  );
}
