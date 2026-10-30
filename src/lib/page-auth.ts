import { redirect } from "next/navigation";
import { auth, isQuartermaster } from "@/auth";
import { getMemberForDiscord } from "@/lib/members";

/** Gate a quartermaster-only page. Employees are sent to their portal,
 *  everyone else without access back to /admin. Allowlisted quartermasters
 *  keep access even if their member row says employee. */
export async function requireQuartermasterPage() {
  const session = await auth();
  const discordId = (session as unknown as { discordId?: string } | null)?.discordId;
  if (!session?.user || !discordId) redirect("/admin");
  if (isQuartermaster(discordId)) return { discordId, name: session.user.name || "" };
  const member = await getMemberForDiscord(discordId);
  if (member?.role === "employee") redirect("/admin/me");
  redirect("/admin");
}
