import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { backofficeEnabled } from "@/lib/flags";
import { getFeatureStates, isSuperAdmin } from "@/lib/features";
import { setFeatureAction } from "@/lib/admin-actions";
import { SHOP } from "@/shop/config";

export const dynamic = "force-dynamic";

export default async function SuperPage() {
  if (!backofficeEnabled()) notFound();
  const session = await auth();
  const discordId = (session as unknown as { discordId?: string } | null)?.discordId;
  if (!session?.user || !isSuperAdmin(discordId)) notFound();

  const flags = await getFeatureStates();

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">⚙️ Superadmin</h1>
      <p className="text-sm text-[#8a7c64]">
        Runtime playground — flip behavior without a redeploy. An override wins over the code
        default in <code className="text-[#e0bd4a]">src/shop/config.ts</code>; clearing it follows code again.
        Only visible to the SUPERADMIN_DISCORD_ID account.
      </p>
      <div className="space-y-3">
        {flags.map((f) => (
          <div key={f.key} className="card p-4 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-52">
              <b>{f.label}</b>{" "}
              <span className={f.on ? "badge badge-in" : "badge badge-out"}>{f.on ? "ON" : "OFF"}</span>{" "}
              {!f.overridden && <span className="text-xs text-[#8a7c64]">(code default)</span>}
              <p className="text-xs text-[#8a7c64] mt-1">{f.desc}</p>
            </div>
            <div className="flex gap-2">
              <form action={setFeatureAction} className="inline">
                <input type="hidden" name="key" value={f.key} />
                <input type="hidden" name="mode" value="on" />
                <button className="btn-ghost !py-1 text-xs" type="submit" disabled={f.on && f.overridden} title="Force on">On</button>
              </form>
              <form action={setFeatureAction} className="inline">
                <input type="hidden" name="key" value={f.key} />
                <input type="hidden" name="mode" value="off" />
                <button className="btn-ghost !py-1 text-xs" type="submit" disabled={!f.on && f.overridden} title="Force off">Off</button>
              </form>
              <form action={setFeatureAction} className="inline">
                <input type="hidden" name="key" value={f.key} />
                <input type="hidden" name="mode" value="default" />
                <button className="btn-ghost !py-1 text-xs" type="submit" disabled={!f.overridden} title="Clear override, follow code">Reset</button>
              </form>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-[#8a7c64]">
        Shop: {SHOP.company} · role: {SHOP.roleName}. Flags take effect within a minute on public pages.
      </p>
    </div>
  );
}
