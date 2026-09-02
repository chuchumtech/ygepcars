import Image from "next/image";
import Link from "next/link";
import { getViewer } from "@/lib/auth";
import { signOutAction } from "@/app/actions/auth";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  const isAdmin = viewer?.profile?.role === "admin";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-navy-800 bg-navy-700 text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/logo.png"
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 rounded-full bg-white object-contain p-0.5"
            />
            <span className="text-[15px] font-bold tracking-tight">YGEP Cars</span>
          </Link>

          <nav className="ml-auto flex items-center gap-1 text-sm">
            <Link
              href="/"
              className="rounded-lg px-3 py-2 font-medium text-navy-100 transition hover:bg-navy-600 hover:text-white"
            >
              Book a car
            </Link>
            {viewer ? (
              <Link
                href="/reservations"
                className="rounded-lg px-3 py-2 font-medium text-navy-100 transition hover:bg-navy-600 hover:text-white"
              >
                My reservations
              </Link>
            ) : null}
            {isAdmin ? (
              <Link
                href="/admin"
                className="rounded-lg bg-gold-400 px-3 py-2 font-semibold text-navy-900 transition hover:bg-gold-300"
              >
                Office portal
              </Link>
            ) : null}

            {viewer ? (
              <div className="ml-2 flex items-center gap-2 border-l border-navy-600 pl-3">
                <Link
                  href="/account"
                  className="hidden max-w-[10rem] truncate text-sm text-navy-100 hover:text-white sm:block"
                >
                  {viewer.profile?.full_name || viewer.email}
                </Link>
                <form action={signOutAction}>
                  <button
                    type="submit"
                    className="rounded-lg px-2.5 py-2 text-sm font-medium text-navy-200 transition hover:bg-navy-600 hover:text-white"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            ) : (
              <div className="ml-2 flex items-center gap-2 border-l border-navy-600 pl-3">
                <Link
                  href="/login"
                  className="rounded-lg px-3 py-2 font-medium text-navy-100 transition hover:bg-navy-600 hover:text-white"
                >
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  className="rounded-lg bg-white px-3 py-2 font-semibold text-navy-700 transition hover:bg-navy-50"
                >
                  Register
                </Link>
              </div>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>

      <footer className="border-t border-[var(--color-line)] bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 text-center text-xs text-muted">
          Yeshiva Gedolah of Elkins Park &middot; Reservations are reviewed by the
          office before they are confirmed.
        </div>
      </footer>
    </div>
  );
}
