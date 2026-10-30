import Link from "next/link";
import { notFound } from "next/navigation";
import { auth, isQuartermaster, signIn, signOut } from "@/auth";
import { backofficeEnabled } from "@/lib/flags";
import { isFeatureOn, isSuperAdmin } from "@/lib/features";
import { SHOP } from "@/shop/config";
import CopyId from "@/components/CopyId";
import { getMemberForDiscord } from "@/lib/members";

// Books must never prerender: auth + data are per-request.
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!backofficeEnabled()) notFound();
  const session = await auth();
  const discordId = (session as unknown as { discordId?: string } | null)?.discordId;
  const member = session?.user && discordId ? await getMemberForDiscord(discordId) : null;
  const inAllowlist = !!discordId && isQuartermaster(discordId);
  const isQM = inAllowlist && member?.role !== "employee";
  const isEmp = member?.role === "employee" && !inAllowlist;

  if (!session?.user) {
    return (
      <div className="max-w-md space-y-4">
        <h1 className="font-display text-3xl">{SHOP.roleName} books</h1>
        <p className="text-sm text-[#8a7c64]">
          Sign in with Discord to open the company books. No passwords, no new accounts.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("discord", { redirectTo: "/admin" });
          }}
        >
          <button className="btn-gold w-full" type="submit">Sign in with Discord</button>
        </form>
        {!process.env.DISCORD_CLIENT_ID && (
          <p className="text-xs text-[#8a7c64]">
            Discord login isn&apos;t configured yet (missing DISCORD_CLIENT_ID). See .env.example.
          </p>
        )}
      </div>
    );
  }

  if (!isQM && !isEmp && !inAllowlist) {
    return (
      <div className="max-w-md space-y-4">
        <h1 className="font-display text-3xl">Not a {SHOP.roleName.toLowerCase()}</h1>
        <p className="text-sm text-[#b8a888]">
          Signed in as <b>{session.user.name}</b> ({discordId || "unknown id"}), but that Discord
          account isn&apos;t on the {SHOP.roleName.toLowerCase()} list. Send this ID to whoever runs the books:
        </p>
        <p className="flex items-center gap-2">
          <code className="text-sm text-[#e0bd4a] break-all">{discordId}</code>
          {discordId && <CopyId id={discordId} />}
        </p>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button className="btn-ghost" type="submit">Sign out</button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card p-3 flex flex-wrap items-center gap-3 text-sm">
        <span className="text-[#8a7c64]">
          {SHOP.roleName}: <b className="text-[#e8dcc4]">{session.user.name}</b>
        </span>
        <nav className="flex flex-wrap gap-3 ml-auto">
          {isQM && <Link href="/admin" className="hover:text-[#c9a227]">Dashboard</Link>}
          {isQM && <Link href="/admin/items" className="hover:text-[#c9a227]">Items</Link>}
          <Link href="/admin/sales" className="hover:text-[#c9a227]">Sales</Link>
          {isQM && (await isFeatureOn("stock")) && (
            <Link href="/admin/stock" className="hover:text-[#c9a227]">Stock</Link>
          )}
          {isQM && (await isFeatureOn("storage")) && (
            <Link href="/admin/storage" className="hover:text-[#c9a227]">Storage</Link>
          )}
          {isQM && <Link href="/admin/ledger" className="hover:text-[#c9a227]">Ledger</Link>}
          {isQM && (await isFeatureOn("notes")) && (
            <Link href="/admin/notes" className="hover:text-[#c9a227]">Board</Link>
          )}
          {isQM && (await isFeatureOn("guide")) && (
            <Link href="/admin/guide" className="hover:text-[#c9a227]">Guide</Link>
          )}
          {isQM && <Link href="/admin/reports" className="hover:text-[#c9a227]">Reports</Link>}
          {isQM && <Link href="/admin/employees" className="hover:text-[#c9a227]">Employees</Link>}
          {isQM && <Link href="/admin/payroll" className="hover:text-[#c9a227]">Payroll</Link>}
          {isQM && <Link href="/admin/purchases" className="hover:text-[#c9a227]">Purchases</Link>}
          {isEmp && <Link href="/admin/purchases" className="hover:text-[#c9a227]">Purchases</Link>}
          {isEmp && <Link href="/admin/me" className="hover:text-[#c9a227]">My Portal</Link>}
          {isQM && <Link href="/admin/v2" className="hover:text-[#c9a227]" title="v2 pilot surfaces">v2</Link>}
          {isQM && isSuperAdmin(discordId) && (
            <Link href="/admin/super" className="hover:text-[#c9a227]" title="Superadmin playground">*</Link>
          )}
        </nav>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button className="btn-ghost !py-1" type="submit">Log out</button>
        </form>
      </div>
      {children}
    </div>
  );
}
