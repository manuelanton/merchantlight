import ReceiptForm from "@/components/ReceiptForm";
import { Empty, Notice, PageHeader } from "@/components/store-ui";
import { requireStaff } from "@/lib/store-access";
import { listGoods } from "@/lib/store-data";

export const dynamic = "force-dynamic";

export default async function NewReceipt({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const access = await requireStaff();
  const { error } = await searchParams;
  const goods = await listGoods(access.profileId);

  return (
    <div className="max-w-3xl">
      <PageHeader title="New receipt" />
      <Notice error={error} />
      {goods.length
        ? <ReceiptForm items={goods.map((i) => ({ id: i.id, name: i.name, price: i.sell_price, stock: i.stock }))} />
        : <div className="panel"><Empty>There are no items yet. Add them on the Items page first.</Empty></div>}
    </div>
  );
}
