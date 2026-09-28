import { desc } from "drizzle-orm";
import { auth, isQuartermaster } from "@/auth";
import { getDb } from "@/db";
import { ledger } from "@/db/schema";

export async function GET() {
  const session = await auth();
  const discordId = (session as unknown as { discordId?: string } | null)?.discordId;
  if (!session?.user || !isQuartermaster(discordId)) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const db = await getDb();
  const rows = await db.select().from(ledger).orderBy(desc(ledger.timestamp));
  return Response.json(rows, {
    headers: { "Content-Disposition": 'attachment; filename="merchantlight-ledger.json"' },
  });
}
