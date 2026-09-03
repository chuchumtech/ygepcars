import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { Statement } from "@/components/statement/Statement";
import { PrintButton } from "@/components/PrintButton";
import { loadSettings } from "@/lib/settings";
import type {
  Incident,
  Payment,
  Profile,
  Reservation,
  StudentBalance,
  Vehicle,
} from "@/lib/types";

export const metadata: Metadata = { title: "Statement" };
export const dynamic = "force-dynamic";

type RentalRow = Reservation & { vehicle: Pick<Vehicle, "id" | "name"> | null };

export default async function AdminStatementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAdmin();
  const [supabase, settings] = await Promise.all([createClient(), loadSettings()]);

  const { data: profileRow } = await supabase
    .from("cars_profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const profile = profileRow as Profile | null;
  if (!profile) notFound();

  const [reservations, incidents, payments, balance] = await Promise.all([
    supabase
      .from("cars_reservations")
      .select("*, vehicle:cars_vehicles(id, name)")
      .eq("user_id", id)
      .in("status", ["approved", "completed"])
      .order("starts_at"),
    supabase.from("cars_incidents").select("*").eq("user_id", id).order("occurred_on"),
    supabase.from("cars_payments").select("*").eq("user_id", id).order("paid_on"),
    supabase.from("cars_student_balances").select("*").eq("user_id", id).maybeSingle(),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="no-print flex items-center justify-between gap-3">
        <Link href={`/admin/students/${id}`} className="text-sm text-ink-soft hover:text-ink">
          &larr; Back to {profile.full_name}
        </Link>
        <PrintButton label="Print statement" />
      </div>

      <div className="card-pad">
        <Statement
          profile={profile}
          balance={(balance.data ?? null) as StudentBalance | null}
          reservations={(reservations.data ?? []) as RentalRow[]}
          incidents={(incidents.data ?? []) as Incident[]}
          payments={(payments.data ?? []) as Payment[]}
          orgName={settings.orgName}
          forPrint
        />
      </div>
    </div>
  );
}
