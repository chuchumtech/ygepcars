"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Calendar", exact: true },
  { href: "/admin/requests", label: "Requests", badge: "requests" as const },
  { href: "/admin/reservations", label: "All reservations" },
  { href: "/admin/waitlist", label: "Waitlist", badge: "waitlist" as const },
  { href: "/admin/students", label: "Students", badge: "accounts" as const },
  { href: "/admin/cars", label: "Cars" },
  { href: "/admin/destinations", label: "Destinations & tolls" },
  { href: "/admin/settings", label: "Settings" },
];

export function AdminNav({
  pendingRequests,
  pendingAccounts,
  waitingCount,
}: {
  pendingRequests: number;
  pendingAccounts: number;
  waitingCount: number;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto border-t border-line/70 px-2 py-2 lg:flex-col lg:overflow-visible lg:pb-4">
      {LINKS.map((link) => {
        const active = link.exact
          ? pathname === link.href
          : pathname.startsWith(link.href);
        const count =
          link.badge === "requests"
            ? pendingRequests
            : link.badge === "accounts"
              ? pendingAccounts
              : link.badge === "waitlist"
                ? waitingCount
                : 0;

        return (
          <Link
            key={link.href}
            href={link.href}
            className={`tap flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
              active
                ? "bg-brand text-white shadow-card"
                : "text-ink-soft hover:bg-parchment-deep hover:text-ink"
            }`}
          >
            <span className="whitespace-nowrap">{link.label}</span>
            {count > 0 ? (
              <span className={`ml-auto rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                active ? "bg-white text-brand" : "bg-gold text-white"
              }`}>
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
