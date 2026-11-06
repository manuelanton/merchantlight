"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavLink {
  href: string;
  label: string;
}

/** Sidebar on desktop, wrapped rows on phones, so the current page stays in view. */
export default function AdminNav({ links }: { links: NavLink[] }) {
  const pathname = usePathname();
  const active = (href: string) => (href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <nav className="flex flex-wrap md:flex-col gap-1">
      {links.map((l) => (
        <Link key={l.href} href={l.href} className={active(l.href) ? "nav-link nav-link-on" : "nav-link"}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
