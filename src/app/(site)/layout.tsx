import Image from "next/image";
import Link from "next/link";
import { getViewer } from "@/lib/auth";
import { signOutAction } from "@/app/actions/auth";
import { loadOffShabbosim } from "@/lib/off-shabbosim";
import { OffShabbosimProvider } from "@/components/OffShabbosimProvider";
import { SiteNav } from "./SiteNav";

export default async function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [viewer, offShabbosim] = await Promise.all([
    getViewer(),
    loadOffShabbosim(),
  ]);

  return (
    <OffShabbosimProvider value={offShabbosim}>
      <div className="flex min-h-full flex-col">
        <header className="app-header sticky top-0 z-40 border-b border-line/70 bg-surface/90 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4">
            <Link href="/" className="tap flex items-center gap-2.5">
              <Image
                src="/logo.png"
                alt="Yeshiva Gedolah Meor Yitzchok of Elkins Park"
                width={509}
                height={466}
                priority
                className="h-10 w-auto"
              />
              <span className="text-[15px] font-bold tracking-tight text-ink">
                Car Rental
              </span>
            </Link>

            <SiteNav
              signedIn={Boolean(viewer)}
              isAdmin={viewer?.profile?.role === "admin"}
              displayName={viewer?.profile?.full_name || viewer?.email || ""}
              signOut={signOutAction}
            />
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4">{children}</main>

        <footer className="app-footer border-t border-line/70">
          <div className="mx-auto max-w-5xl px-4 py-5 text-center text-xs text-ink-soft">
            Yeshiva Gedolah Meor Yitzchok of Elkins Park
          </div>
        </footer>
      </div>
    </OffShabbosimProvider>
  );
}
