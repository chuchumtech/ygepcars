import Image from "next/image";
import Link from "next/link";
import { getViewer } from "@/lib/auth";
import { signOutAction } from "@/app/actions/auth";
import { SiteNav } from "./SiteNav";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  const isAdmin = viewer?.profile?.role === "admin";

  return (
    <div className="flex min-h-dvh flex-col">
      {/* White masthead with the seal and the gold rule, as on ygep.org. */}
      <header className="app-header sticky top-0 z-40 gold-rule bg-white shadow-[var(--shadow-card)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="Yeshiva Gedolah Meor Yitzchok of Elkins Park"
              width={509}
              height={466}
              priority
              className="h-14 w-auto"
            />
            <span className="leading-tight">
              <span className="block text-[15px] font-bold tracking-tight text-slate-500 sm:text-base">
                Yeshiva Gedolah of Elkins Park
              </span>
              <span className="block text-xs font-medium tracking-wide text-gold-500">
                Car Rental
              </span>
            </span>
          </Link>

          <SiteNav
            signedIn={Boolean(viewer)}
            isAdmin={isAdmin}
            displayName={viewer?.profile?.full_name || viewer?.email || ""}
            signOut={signOutAction}
          />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>

      <footer className="app-footer border-t border-[var(--color-line)] bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 text-center text-xs text-muted">
          <p className="font-medium text-slate-500">
            Yeshiva Gedolah Meor Yitzchok of Elkins Park
          </p>
          <p className="mt-1">
            Reservations are reviewed by the office before they are confirmed.
          </p>
        </div>
      </footer>
    </div>
  );
}
