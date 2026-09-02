import Image from "next/image";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "@/app/actions/auth";
import { AdminNav } from "./AdminNav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const [{ count: pendingRequests }, { count: pendingAccounts }] = await Promise.all([
    supabase
      .from("cars_reservations")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("cars_profiles")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="no-print border-b border-navy-800 bg-navy-800 text-white lg:w-60 lg:shrink-0 lg:border-r lg:border-b-0">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <Image
            src="/logo.png"
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 rounded-full bg-white object-contain p-0.5"
          />
          <div className="min-w-0">
            <p className="text-sm font-bold leading-tight">Office portal</p>
            <p className="truncate text-xs text-navy-300">YGEP Cars</p>
          </div>
        </div>

        <AdminNav
          pendingRequests={pendingRequests ?? 0}
          pendingAccounts={pendingAccounts ?? 0}
        />

        <div className="border-t border-navy-700 px-4 py-3 lg:mt-auto">
          <p className="truncate text-xs text-navy-300">{admin.profile.full_name}</p>
          <div className="mt-1.5 flex items-center gap-3">
            <Link href="/" className="text-xs text-navy-200 hover:text-white">
              Student site
            </Link>
            <form action={signOutAction}>
              <button type="submit" className="text-xs text-navy-200 hover:text-white">
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
