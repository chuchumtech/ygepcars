import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { CarsManager } from "./CarsManager";
import type { Blackout, Vehicle } from "@/lib/types";

export const metadata: Metadata = { title: "Cars" };

export default async function CarsPage() {
  const supabase = await createClient();

  const [vehicles, blackouts] = await Promise.all([
    supabase.from("cars_vehicles").select("*").order("sort_order"),
    supabase
      .from("cars_blackouts")
      .select("*, vehicle:cars_vehicles(id, name)")
      .gte("ends_at", new Date().toISOString())
      .order("starts_at"),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cars"
        description="Rates, details, and when a car is out of service."
      />
      <CarsManager
        vehicles={(vehicles.data ?? []) as Vehicle[]}
        blackouts={(blackouts.data ?? []) as (Blackout & { vehicle: { name: string } | null })[]}
      />
    </div>
  );
}
