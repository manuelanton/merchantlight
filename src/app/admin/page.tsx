import Link from "next/link";
import { Empty, PageHeader, Section, Stat } from "@/components/store-ui";
import { g } from "@/lib/format";
import { isShopOpen } from "@/lib/shop";
import { isManager, requireStaff } from "@/lib/store-access";
import { setOpenAction } from "@/lib/store-actions";
import { isLow, listGoods, listMaterials, partnerBalances, partnerWeek, todaysSales, weekStart } from "@/lib/store-data";

export const dynamic = "force-dynamic";

export default async function Today() {
  const access = await requireStaff();
  const manager = isManager(access);
  const [sales, goods, materials, open] = await Promise.all([todaysSales(access.profileId), listGoods(access.profileId), listMaterials(access.profileId), isShopOpen()]);
  const [week, balances] = manager
    ? await Promise.all([partnerWeek(access.profileId, weekStart()), partnerBalances(access.profileId)])
    : [null, []];

  const posted = sales.filter((s) => s.status === "posted");
  const drafts = sales.length - posted.length;
  const revenue = posted.reduce((sum, s) => sum + s.total, 0);
  const profit = posted.reduce((sum, s) => sum + (s.profit ?? 0), 0);
  const items = posted.reduce((sum, s) => sum + s.items, 0);
  const low = [...goods, ...materials].filter(isLow);
  const balanceOf = (id: string) => balances.find((b) => b.partner_id === id)?.balance ?? 0;

  return (
    <>
      <PageHeader title="Today" subtitle={new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}>
        <div className="flex items-center gap-3">
          {manager ? (
            <form action={setOpenAction}>
              <input type="hidden" name="open" value={open ? "0" : "1"} />
              <button className="btn-ghost !py-2 text-sm" type="submit" title="Shown to customers on the landing page">
                {open ? "● Open, close shop" : "○ Closed, open shop"}
              </button>
            </form>
          ) : (
            <span className={open ? "badge badge-in" : "badge badge-out"}>{open ? "Open" : "Closed"}</span>
          )}
          <Link href="/admin/sales/new" className="btn-gold !py-2 text-sm">+ New receipt</Link>
        </div>
      </PageHeader>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <Stat label="Revenue" value={`${g(revenue)}g`} />
        <Stat label="Profit" value={`${g(profit)}g`} />
        <Stat label="Items sold" value={g(items)} />
      </div>

      {drafts > 0 && (
        <Link href="/admin/sales?status=draft&range=all" className="panel block px-4 py-3 mb-3 text-sm hover:bg-[#1d1a16]">
          {drafts} {drafts === 1 ? "receipt is" : "receipts are"} still a draft and not in the books yet.
        </Link>
      )}
      {low.length > 0 && (
        <Link href="/admin/stock" className="panel block px-4 py-3 mb-6 hover:bg-[#1d1a16]">
          <span className="text-sm text-[#e0bd4a]">{low.length} {low.length === 1 ? "item is" : "items are"} low on stock</span>
          <span className="muted text-xs block truncate mt-0.5">{low.map((i) => i.name).join(", ")}</span>
        </Link>
      )}

      {week && (
        <Section title="This week's split" aside={`${g(week.net)}g net, shared by ${week.partners.length}`}>
          <div className="panel overflow-x-auto">
            <table className="ledger">
              <thead><tr><th>Partner</th><th className="text-right">This week</th><th className="text-right">Balance</th></tr></thead>
              <tbody>
                {week.partners.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td className="text-right tabular-nums">{g(week.per_partner ?? 0)}g</td>
                    <td className="text-right tabular-nums">{g(balanceOf(p.id))}g</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!week.partners.length && <Empty>Nobody shares the profit yet.</Empty>}
          </div>
        </Section>
      )}

      <Section title="Today's receipts">
        <div className="panel divide-y divide-[#1c2b31]">
          {!sales.length && <Empty>No receipts yet today.</Empty>}
          {sales.map((s) => (
            <Link key={s.id} href={`/admin/sales/${s.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[#1d1a16]">
              <span className="min-w-0">
                <span className="tabular-nums">#{s.receipt_no}</span>
                <span className="muted text-xs block truncate">{s.seller}{s.customer ? ` · ${s.customer}` : ""}</span>
              </span>
              <span className="tabular-nums shrink-0">{g(s.total)}g</span>
            </Link>
          ))}
        </div>
      </Section>
    </>
  );
}
