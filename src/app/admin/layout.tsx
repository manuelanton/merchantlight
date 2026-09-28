import Link from "next/link";
import { notFound } from "next/navigation";
import { auth, isQuartermaster, signIn, signOut } from "@/auth";
import { backofficeEnabled } from "@/lib/flags";
import CopyId from "@/components/CopyId";

// Books must never prerender: auth + data are per-request.
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!backofficeEnabled()) notFound();
  const session = await auth();
  const discordId = (session as unknown as { discordId?: string } | null)?.discordId;

  if (!session?.user) {
    return (
      <div className="max-w-md space-y-4">
        <h1 className="font-display text-3xl">Quartermaster books</h1>
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

  if (!isQuartermaster(discordId)) {
    return (
      <div className="max-w-md space-y-4">
        <h1 className="font-display text-3xl">Not a quartermaster</h1>
        <p className="text-sm text-[#b8a888]">
          Signed in as <b>{session.user.name}</b> ({discordId || "unknown id"}), but that Discord
          account isn&apos;t on the quartermaster list. Send this ID to whoever runs the books:
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
          Quartermaster: <b className="text-[#e8dcc4]">{session.user.name}</b>
        </span>
        <nav className="flex flex-wrap gap-3 ml-auto">
          <Link href="/admin" className="hover:text-[#c9a227]">Dashboard</Link>
          <Link href="/admin/items" className="hover:text-[#c9a227]">Items</Link>
          <Link href="/admin/sales" className="hover:text-[#c9a227]">Sales</Link>
          <Link href="/admin/stock" className="hover:text-[#c9a227]">Stock</Link>
          <Link href="/admin/ledger" className="hover:text-[#c9a227]">Ledger</Link>
          <Link href="/admin/notes" className="hover:text-[#c9a227]">Board</Link>
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
