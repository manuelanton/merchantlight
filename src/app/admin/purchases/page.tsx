import { auth, isQuartermaster } from "@/auth";
import { getDb } from "@/db";
import { employeePurchases, items } from "@/db/schema";
import { getMemberForDiscord } from "@/lib/members";
import { eq, desc } from "drizzle-orm";
import EmployeePurchaseForm from "@/components/EmployeePurchaseForm";
import { g } from "@/lib/format";
import { redirect } from "next/navigation";
import { setPurchaseStatusAction, deletePurchaseAction } from "@/lib/admin-actions";

export const dynamic = "force-dynamic";

export default async function PurchasesPage() {
  const session = await auth();
  const discordId = (session as unknown as { discordId?: string } | null)?.discordId;
  if (!session?.user || !discordId) redirect("/admin");
  const member = await getMemberForDiscord(discordId);
  const isQM = isQuartermaster(discordId);
  const db = await getDb();
  if (member?.role === "employee") {
    const [purchases, itemRows] = await Promise.all([
      db.select().from(employeePurchases).where(eq(employeePurchases.employeeDiscordId, discordId)).orderBy(desc(employeePurchases.createdAt)),
      db.select().from(items),
    ]);
    return (
      <div className="space-y-4">
        <h1 className="font-display text-3xl">My Purchases</h1>
        <EmployeePurchaseForm items={itemRows.map((i) => ({ id: i.id, name: i.name, sale_price: i.salePrice }))} />
        <div className="card p-4 overflow-x-auto">
          <table className="ledger">
            <thead><tr><th>Date</th><th>Item</th><th>Qty</th><th>Total</th><th>Notes</th></tr></thead>
            <tbody>
              {purchases.map((p) => <tr key={p.id}><td className="text-xs">{new Date(p.createdAt).toLocaleString()}</td><td>{p.itemName}</td><td>{p.qty}</td><td>{g(p.costTotal)}g</td><td>{p.notes}</td></tr>)}
              {!purchases.length && <tr><td colSpan={5} className="text-[#8a7c64]">No purchases logged.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
  if (!isQM) redirect("/admin");
  const [purchases] = await Promise.all([
    db.select().from(employeePurchases).orderBy(desc(employeePurchases.createdAt)).limit(200),
  ]);
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl">Employee Purchases</h1>
      <p className="text-sm text-[#8a7c64]">All employee purchases (deducted from weekly pay). Reject to exclude from payroll; posted rows already hit the ledger.</p>
      <div className="card p-4 overflow-x-auto">
        <table className="ledger min-w-[820px]">
          <thead><tr><th>Date</th><th>Employee</th><th>Item</th><th>Qty</th><th>Unit</th><th>Total</th><th>Notes</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {purchases.map((p) => (
              <tr key={p.id}>
                <td className="text-xs">{new Date(p.createdAt).toLocaleString()}</td>
                <td>{p.employeeName}</td>
                <td>{p.itemName}</td>
                <td>{p.qty}</td>
                <td>{g(p.unitCost)}g</td>
                <td>{g(p.costTotal)}g</td>
                <td>{p.notes}</td>
                <td className="text-xs">{p.status}</td>
                <td className="whitespace-nowrap">
                  {p.status !== "posted" && (
                    <>
                      {p.status !== "approved" && (
                        <form action={setPurchaseStatusAction} className="inline-block mr-1">
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="status" value="approved" />
                          <button className="btn-ghost !py-1 !px-2 text-xs" type="submit">Approve</button>
                        </form>
                      )}
                      {p.status !== "rejected" && (
                        <form action={setPurchaseStatusAction} className="inline-block mr-1">
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="status" value="rejected" />
                          <button className="btn-ghost !py-1 !px-2 text-xs" type="submit">Reject</button>
                        </form>
                      )}
                      <form action={deletePurchaseAction} className="inline-block">
                        <input type="hidden" name="id" value={p.id} />
                        <button className="btn-ghost !py-1 !px-2 text-xs" type="submit">Delete</button>
                      </form>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {!purchases.length && <tr><td colSpan={9} className="text-[#8a7c64]">No purchases logged.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}