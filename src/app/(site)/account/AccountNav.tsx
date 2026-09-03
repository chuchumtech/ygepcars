"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/account", label: "Overview", exact: true },
  { href: "/account/reservations", label: "Reservations" },
  { href: "/account/statement", label: "Statement" },
  { href: "/account/details", label: "My details" },
];

export function AccountNav() {
  const pathname = usePathname();

  return (
    <nav className="mt-4 flex gap-1 overflow-x-auto border-b border-line/70">
      {TABS.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
              active
                ? "border-brand text-brand"
                : "border-transparent text-ink-soft hover:border-line hover:text-ink"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
