"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Book a car", exact: true },
  { href: "/reservations", label: "My reservations", signedInOnly: true },
];

export function SiteNav({
  signedIn,
  isAdmin,
  displayName,
  signOut,
}: {
  signedIn: boolean;
  isAdmin: boolean;
  displayName: string;
  signOut: () => Promise<void>;
}) {
  const pathname = usePathname();

  return (
    <nav className="ml-auto flex flex-wrap items-center gap-1">
      {LINKS.filter((link) => !link.signedInOnly || signedIn).map((link) => {
        const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`nav-link ${active ? "nav-link-active" : ""}`}
          >
            {link.label}
          </Link>
        );
      })}

      {isAdmin ? (
        <Link href="/admin" className="btn-gold btn-sm ml-1">
          Office portal
        </Link>
      ) : null}

      {signedIn ? (
        <span className="ml-2 flex items-center gap-1 border-l border-[var(--color-line)] pl-2">
          <Link
            href="/account"
            className="hidden max-w-[10rem] truncate rounded-lg px-2.5 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-50 sm:block"
          >
            {displayName}
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-lg px-2.5 py-2 text-sm font-medium text-muted transition hover:bg-slate-50 hover:text-slate-600"
            >
              Sign out
            </button>
          </form>
        </span>
      ) : (
        <span className="ml-2 flex items-center gap-1 border-l border-[var(--color-line)] pl-2">
          <Link href="/login" className="nav-link">
            Sign in
          </Link>
          <Link href="/signup" className="btn-primary btn-sm">
            Register
          </Link>
        </span>
      )}
    </nav>
  );
}
