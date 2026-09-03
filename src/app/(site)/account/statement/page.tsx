import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireActiveStudent } from "@/lib/auth";
import { Statement } from "@/components/statement/Statement";
import { PrintButton } from "@/components/PrintButton";
import { loadSettings } from "@/lib/settings";
import type { Incident, Payment, Reservation, StudentBalance, Vehicle } from "@/lib/types";

export const metadata: Metadata = { title: "Statement" };
export const dynamic = "force-dynamic";

type RentalRow = Reservation & { vehicle: Pick<Vehicle, "id" | "name"> | null };

export default async function StatementPage() {
  const [viewer, supabase, settings] = await Promise.all([
    requireActiveStudent(),
    createClient(),
    loadSettings(),
  ]);

  const [reservations, incidents, payments, balance] = await Promise.all([
    supabase
      .from("cars_reservations")
      .select("*, vehicle:cars_vehicles(id, name)")
      .eq("user_id", viewer.userId)
      .in("status", ["approved", "completed"])
      .order("starts_at"),
    supabase
      .from("cars_incidents")
      .select("*")
      .eq("user_id", viewer.userId)
      .order("occurred_on"),
    supabase
      .from("cars_payments")
      .select("*")
      .eq("user_id", viewer.userId)
      .order("paid_on"),
    supabase
      .from("cars_student_balances")
      .select("*")
      .eq("user_id", viewer.userId)
      .maybeSingle(),
  ]);

  return (
    <div className="space-y-4">
      <div className="no-print flex justify-end">
        <PrintButton />
      </div>

      <div className="card-pad">
        <Statement
          profile={viewer.profile}
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
