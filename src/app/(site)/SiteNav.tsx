"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
    <nav className="ml-auto flex items-center gap-1">
      {signedIn ? (
        <>
          <Link
            href="/reservations"
            className={`nav-link ${pathname.startsWith("/reservations") ? "nav-link-active" : ""}`}
          >
            My reservations
          </Link>

          {isAdmin ? (
            <Link href="/admin" className="nav-link">
              Office
            </Link>
          ) : null}

          <Link
            href="/account"
            className="nav-link hidden max-w-[9rem] truncate sm:block"
            title={displayName}
          >
            {displayName.split(" ")[0] || "Account"}
          </Link>

          <form action={signOut}>
            <button type="submit" className="nav-link">
              Sign out
            </button>
          </form>
        </>
      ) : (
        <>
          <Link href="/login" className="nav-link">
            Sign in
          </Link>
          <Link href="/signup" className="btn-primary btn-sm">
            Register
          </Link>
        </>
      )}
    </nav>
  );
}
