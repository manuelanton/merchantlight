import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { backofficeEnabled } from "@/lib/flags";
import { getFeatureStates, isSuperAdmin } from "@/lib/features";
import { linkMemberDiscordAction, setFeatureAction, setMemberRoleAction } from "@/lib/admin-actions";
import { getMembers, getUnlinkedActors } from "@/lib/members";
import { SHOP } from "@/shop/config";

export const dynamic = "force-dynamic";

const ROLES = ["owner", "manager", "worker"] as const;

export default async function SuperPage() {
  if (!backofficeEnabled()) notFound();
  const session = await auth();
  const discordId = (session as unknown as { discordId?: string } | null)?.discordId;
  if (!session?.user || !isSuperAdmin(discordId)) notFound();

  const [flags, members, unlinked] = await Promise.all([getFeatureStates(), getMembers(), getUnlinkedActors()]);

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

      <h2 className="font-display text-2xl pt-2">Members & roles</h2>
      <p className="text-sm text-[#8a7c64]">
        Workers record sales and purchases. Managers also confirm, void, pay out, and edit. Unlinked accounts keep legacy full access until you link them — link everyone, then nobody bypasses roles.
      </p>
      {unlinked.length > 0 && (
        <p className="text-sm text-[#e0bd4a]">
          Unlinked Discord accounts seen in the books: {unlinked.map((u) => `${u.name} (${u.discordId})`).join(", ")}
        </p>
      )}
      <div className="space-y-3">
        {members.map((m) => (
          <div key={m.id} className="card p-4 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-52">
              <b className={m.active ? "" : "text-[#8a7c64] line-through"}>{m.name}</b>{" "}
              <span className="badge">{m.role}</span>{" "}
              {m.discordId
                ? <span className="text-xs text-[#7fd08a]" title={m.discordId}>linked ✓</span>
                : <span className="text-xs text-[#e0bd4a]">unlinked — legacy access</span>}
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
              <select name="discord_id" defaultValue={m.discordId || ""} className="input !w-auto !py-1 text-sm" aria-label="Discord account">
                <option value="">Unlinked</option>
                {m.discordId && <option value={m.discordId}>{m.discordId} (current)</option>}
                {unlinked.filter((u) => u.discordId !== m.discordId).map((u) => (
                  <option key={u.discordId} value={u.discordId}>{u.name} ({u.discordId})</option>
                ))}
              </select>
              <button className="btn-ghost !py-1 text-xs" type="submit">Link</button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
