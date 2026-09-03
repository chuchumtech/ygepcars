import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatTile } from "@/components/ui";
import { IncidentsManager } from "./IncidentsManager";
import { formatMoney } from "@/lib/pricing";
import type { IncidentWithRefs, Profile, Vehicle } from "@/lib/types";

export const metadata: Metadata = { title: "Incidents" };

export default async function IncidentsPage() {
  const supabase = await createClient();

  const [incidents, vehicles, students] = await Promise.all([
    supabase
      .from("cars_incidents")
      .select(
        "*, vehicle:cars_vehicles(id, name), student:cars_profiles!cars_incidents_user_id_fkey(id, full_name)",
      )
      .order("occurred_on", { ascending: false }),
    supabase.from("cars_vehicles").select("*").order("sort_order"),
    supabase
      .from("cars_profiles")
      .select("id, full_name, email")
      .order("full_name"),
  ]);

  const rows = (incidents.data ?? []) as IncidentWithRefs[];
  const open = rows.filter((row) => row.status === "open");
  const unpaidCharges = open.reduce((sum, row) => sum + row.charge_cents, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Incidents"
        description="Damage, tickets, a car left dirty. A charge here lands on that student's balance next to their rentals."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Open"
          value={String(open.length)}
          tone={open.length > 0 ? "warn" : "default"}
        />
        <StatTile label="Logged all-time" value={String(rows.length)} />
        <StatTile
          label="Charged on open items"
          value={formatMoney(unpaidCharges)}
          tone={unpaidCharges > 0 ? "bad" : "default"}
        />
      </div>

      <IncidentsManager
        incidents={rows}
        vehicles={(vehicles.data ?? []) as Vehicle[]}
        students={(students.data ?? []) as Pick<Profile, "id" | "full_name" | "email">[]}
      />
    </div>
  );
}
