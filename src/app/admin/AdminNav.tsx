"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Calendar", exact: true },
  { href: "/admin/requests", label: "Requests", badge: "requests" as const },
  { href: "/admin/reservations", label: "All reservations" },
  { href: "/admin/students", label: "Students", badge: "accounts" as const },
  { href: "/admin/cars", label: "Cars" },
  { href: "/admin/destinations", label: "Destinations & tolls" },
  { href: "/admin/settings", label: "Settings" },
];

export function AdminNav({
  pendingRequests,
  pendingAccounts,
}: {
  pendingRequests: number;
  pendingAccounts: number;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto px-2 pb-3 lg:flex-col lg:overflow-visible lg:pb-4">
      {LINKS.map((link) => {
        const active = link.exact
          ? pathname === link.href
          : pathname.startsWith(link.href);
        const count =
          link.badge === "requests"
            ? pendingRequests
            : link.badge === "accounts"
              ? pendingAccounts
              : 0;

        return (
          <Link
            key={link.href}
            href={link.href}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
              active
                ? "bg-navy-600 text-white"
                : "text-navy-200 hover:bg-navy-700 hover:text-white"
            }`}
          >
            <span className="whitespace-nowrap">{link.label}</span>
            {count > 0 ? (
              <span className="ml-auto rounded-full bg-gold-400 px-1.5 py-0.5 text-[11px] font-bold text-navy-900">
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
