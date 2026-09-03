import Image from "next/image";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "@/app/actions/auth";
import { AdminNav } from "./AdminNav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const [{ count: pendingRequests }, { count: pendingAccounts }, { count: waiting }] =
    await Promise.all([
    supabase
      .from("cars_reservations")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("cars_profiles")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("cars_waitlist")
      .select("id", { count: "exact", head: true })
      .in("status", ["waiting", "offered"]),
  ]);

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="app-sidebar no-print border-b border-line/70 bg-surface lg:flex lg:w-60 lg:shrink-0 lg:flex-col lg:border-r lg:border-b-0">
        <div className="flex items-center gap-3 px-4 py-4">
          <Image
            src="/logo.png"
            alt=""
            width={509}
            height={466}
            className="h-10 w-auto"
          />
          <div className="min-w-0 leading-tight">
            <p className="text-sm font-bold text-ink">Office portal</p>
            <p className="truncate text-xs font-semibold text-ink-soft">Car Rental</p>
          </div>
        </div>

        <AdminNav
          pendingRequests={pendingRequests ?? 0}
          pendingAccounts={pendingAccounts ?? 0}
          waitingCount={waiting ?? 0}
        />

        <div className="border-t border-line/70 px-4 py-3 lg:mt-auto">
          <p className="truncate text-xs font-semibold text-ink">
            {admin.profile.full_name}
          </p>
          <div className="mt-1.5 flex items-center gap-3">
            <Link href="/" className="text-xs text-ink-soft hover:text-brand">
              Student site
            </Link>
            <form action={signOutAction}>
              <button type="submit" className="text-xs text-ink-soft hover:text-brand">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 lg:px-8">{children}</main>
    </div>
  );
}
