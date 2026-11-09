import { notFound } from "next/navigation";
import { auth, signIn, signOut } from "@/auth";
import AdminNav, { type NavLink } from "@/components/AdminNav";
import CopyId from "@/components/CopyId";
import { backofficeEnabled } from "@/lib/flags";
import { isManager, isStaff, currentAccess } from "@/lib/store-access";
import { SHOP } from "@/shop/config";

// Books must never prerender: auth + data are per-request.
export const dynamic = "force-dynamic";

const LINKS: (NavLink & { managers?: boolean; owners?: boolean })[] = [
  { href: "/admin", label: "Today" },
  { href: "/admin/sales", label: "Sales" },
  { href: "/admin/items", label: "Items" },
  { href: "/admin/stock", label: "Stock" },
  { href: "/admin/craft", label: "Craft" },
  { href: "/admin/mint", label: "Minting" },
  { href: "/admin/commissions", label: "Commissions" },
  { href: "/admin/purchases", label: "Purchases", managers: true },
  { href: "/admin/rentals", label: "Rentals" },
  { href: "/admin/payments", label: "Payments", managers: true },
  { href: "/admin/analytics", label: "Analytics", managers: true },
  { href: "/admin/treasury", label: "Treasury", managers: true },
  { href: "/admin/users", label: "Users", owners: true },
  { href: "/admin/settings", label: "Settings", owners: true },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!backofficeEnabled()) notFound();
  const session = await auth();
  const discordId = (session as unknown as { discordId?: string } | null)?.discordId;

  if (!session?.user) {
    return (
      <div className="max-w-md space-y-4">
        <h1 className="font-display text-3xl">{SHOP.company} books</h1>
        <p className="muted text-sm">Sign in with Discord to open the company books. No passwords, no new accounts.</p>
        <form
          action={async () => {
            "use server";
            await signIn("discord", { redirectTo: "/admin" });
          }}
        >
          <button className="btn-gold w-full" type="submit">Sign in with Discord</button>
        </form>
        {!process.env.DISCORD_CLIENT_ID && (
          <p className="muted text-xs">Discord login isn&apos;t configured yet (missing DISCORD_CLIENT_ID). See .env.example.</p>
        )}
      </div>
    );
  }

  const signOutForm = (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/" });
      }}
    >
      <button className="btn-ghost !py-1 text-sm" type="submit">Log out</button>
    </form>
  );

  const access = await currentAccess();
  if (!isStaff(access)) {
    return (
      <div className="max-w-md space-y-4">
        <h1 className="font-display text-3xl">No access yet</h1>
        <p className="muted text-sm">
          Signed in as <b>{session.user.name}</b>. The books open with a staff role on the {SHOP.shortName} Discord server. Ask an Owner or Manager and send them this ID:
        </p>
        <p className="flex items-center gap-2">
          <code className="text-sm text-[#e0bd4a] break-all">{discordId}</code>
          {discordId && <CopyId id={discordId} />}
        </p>
        {signOutForm}
      </div>
    );
  }

  const links = LINKS.filter((l) => (!l.managers || isManager(access)) && (!l.owners || access?.role === "owner"));
  return (
    <div className="grid md:grid-cols-[11rem_minmax(0,1fr)] gap-4 md:gap-8">
      <aside className="md:sticky md:top-20 md:self-start min-w-0 space-y-4">
        <AdminNav links={links} />
        <div className="flex md:block items-center justify-between gap-3 md:border-t border-[#2b4149] md:pt-3 md:space-y-2">
          <p className="min-w-0 truncate text-sm">
            {access?.name}
            <span className="muted text-xs capitalize block">{access?.role}</span>
          </p>
          {signOutForm}
        </div>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
