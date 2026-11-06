import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { backofficeEnabled } from "@/lib/flags";
import { accessFor } from "@/lib/merchant-access";
import { asUser } from "@/lib/merchant-db";
import { buildRpcCall, rpcError } from "@/lib/merchant-rpc";

export const dynamic = "force-dynamic";

/** The one door to the merchant schema: POST { p_arg: value } runs merchant.<name>() as the caller. */
export async function POST(req: Request, ctx: { params: Promise<{ name: string }> }) {
  if (!backofficeEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const session = await auth();
  const discordId = (session as unknown as { discordId?: string } | null)?.discordId;
  if (!session?.user || !discordId) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  try {
    const access = await accessFor(discordId);
    if (!access || access.role === "visitor") return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const { text, params } = buildRpcCall((await ctx.params).name, body);
    return NextResponse.json({ data: await asUser(access.profileId, text, params) });
  } catch (e) {
    const { status, error } = rpcError(e);
    return NextResponse.json({ error }, { status });
  }
}
