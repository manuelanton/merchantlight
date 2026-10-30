import { auth, isQuartermaster } from "@/auth";
import { redirect } from "next/navigation";
import { getWeeklyReport } from "@/lib/reports";
import ReportsView from "@/components/ReportsView";
import { getMemberForDiscord } from "@/lib/members";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const session = await auth();
  const discordId = (session as unknown as { discordId?: string } | null)?.discordId;
  if (!session?.user || !discordId || !isQuartermaster(discordId)) redirect("/admin");
  const member = await getMemberForDiscord(discordId);
  if (member?.role === "employee") redirect("/admin/me");
  const report = await getWeeklyReport();
  return <ReportsView report={report} />;
}