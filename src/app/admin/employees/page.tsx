import { auth, isQuartermaster } from "@/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { sales, employeePurchases } from "@/db/schema";
import { and, eq, gte, lte } from "drizzle-orm";
import { getMembers } from "@/lib/members";
import { setMemberRoleAction, linkMemberDiscordAction } from "@/lib/admin-actions";
import { getWeekRange } from "@/lib/reports";
import { g } from "@/lib/format";

export const dynamic = "force-dynamic";

const ROLES = ["owner", "manager", "member", "worker", "employee"] as const;

export default async function EmployeesPage() {
  const session = await auth();
  const discordId = (session as unknown as { discordId?: string } | null)?.discordId;
  if (!session?.user || !discordId || !isQuartermaster(discordId)) redirect("/admin");
  const db = await getDb();
  const members = await getMembers();
  const { start, end } = getWeekRange();

  const stats = new Map<string, { profit: number; purchases: number; sales: number }>();
  for (const m of members) {
    if (m.role !== "employee" || !m.discordId) continue;
    const [salesRows, purchaseRows] = await Promise.all([
      db
        .select()
        .from(sales)
        .where(
          and(
            eq(sales.soldByDiscordId, m.discordId),
            eq(sales.status, "confirmed"),
            gte(sales.timestamp, start),
            lte(sales.timestamp, end)
          )
        ),
      db
        .select()
        .from(employeePurchases)
        .where(
          and(
            eq(employeePurchases.employeeDiscordId, m.discordId),
            gte(employeePurchases.createdAt, start),
            lte(employeePurchases.createdAt, end)
          )
        ),
    ]);
    const profit = salesRows.reduce((a, s) => a + Number(s.totalProfit || 0), 0);
    const purchases = purchaseRows.filter((p) => p.status !== "rejected").reduce((a, p) => a + Number(p.costTotal || 0), 0);
    stats.set(m.id, { profit, purchases, sales: salesRows.length });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Employees</h1>
        <p className="text-sm text-[#8a7c64]">
          Set roles and link Discord accounts. Employees earn 50% of their confirmed sale profit each Sat–Fri week, minus logged purchases.
        </p>
      </div>
      <div className="space-y-3">
        {members.map((m) => {
          const s = stats.get(m.id);
          const commission = s ? Math.round(s.profit * 0.5 * 100) / 100 : 0;
          const net = s ? Math.round((commission - s.purchases) * 100) / 100 : 0;
          return (
            <div key={m.id} className="card p-4 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-52">
                <b className={m.active ? "" : "text-[#8a7c64] line-through"}>{m.name}</b>{" "}
                <span className="badge">{m.role}</span>{" "}
                {m.discordId ? (
                  <span className="text-xs text-[#7fd08a]" title={m.discordId}>linked ✓</span>
                ) : (
                  <span className="text-xs text-[#e0bd4a]">no Discord linked</span>
                )}
                {m.role === "employee" && (
                  <div className="text-xs text-[#8a7c64] mt-1">
                    This week: {s?.sales ?? 0} sales · profit {g(s?.profit ?? 0)}g · commission {g(commission)}g · purchases {g(s?.purchases ?? 0)}g · net {g(net)}g
                  </div>
                )}
              </div>
              <form action={setMemberRoleAction} className="flex gap-2 items-center">
                <input type="hidden" name="id" value={m.id} />
                <select name="role" defaultValue={m.role} className="input !w-auto !py-1 text-sm" aria-label="Role">
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <button className="btn-ghost !py-1 text-xs" type="submit">Set role</button>
              </form>
              <form action={linkMemberDiscordAction} className="flex gap-2 items-center">
                <input type="hidden" name="id" value={m.id} />
                <input
                  name="discord_id"
                  defaultValue={m.discordId || ""}
                  placeholder="Discord ID"
                  className="input !w-44 !py-1 text-sm"
                  aria-label="Discord ID"
                />
                <button className="btn-ghost !py-1 text-xs" type="submit">Link</button>
              </form>
            </div>
          );
        })}
      </div>
    </div>
  );
}
