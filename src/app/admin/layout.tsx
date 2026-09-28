import Link from "next/link";
import { getAdminSession } from "@/lib/session";
import { logoutAction } from "@/lib/actions";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <AdminBar />
      {children}
    </div>
  );
}

async function AdminBar() {
  const s = await getAdminSession();
  if (!s.isAdmin) return null;
  return (
    <div className="card p-3 flex flex-wrap items-center gap-3 text-sm">
      <span className="text-[#8a7c64]">Quartermaster: <b className="text-[#e8dcc4]">{s.charName}</b></span>
      <nav className="flex flex-wrap gap-3 ml-auto">
        <Link href="/admin" className="hover:text-[#c9a227]">Dashboard</Link>
        <Link href="/admin/inventory" className="hover:text-[#c9a227]">Inventory</Link>
        <Link href="/admin/sales" className="hover:text-[#c9a227]">Sales</Link>
        <Link href="/admin/ledger" className="hover:text-[#c9a227]">Ledger</Link>
        <Link href="/admin/orders" className="hover:text-[#c9a227]">Orders</Link>
      </nav>
      <form action={logoutAction}><button className="btn-ghost !py-1">Log out</button></form>
    </div>
  );
}
