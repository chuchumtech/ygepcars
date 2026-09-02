import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { DestinationsManager } from "./DestinationsManager";
import type { Destination } from "@/lib/types";

export const metadata: Metadata = { title: "Destinations & tolls" };

export default async function DestinationsPage() {
  const supabase = await createClient();

  const [destinations, usage] = await Promise.all([
    supabase.from("cars_destinations").select("*").order("sort_order"),
    supabase.from("cars_reservations").select("destination_id"),
  ]);

  // How often each destination has actually been used, so the office can see
  // which presets matter before changing a toll.
  const counts = new Map<string, number>();
  for (const row of (usage.data ?? []) as { destination_id: string | null }[]) {
    if (!row.destination_id) continue;
    counts.set(row.destination_id, (counts.get(row.destination_id) ?? 0) + 1);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Destinations & tolls"
        description="Each destination carries one flat toll charge. That is what gets added to a student's quote, and you can still override it on any single reservation."
      />
      <DestinationsManager
        destinations={(destinations.data ?? []) as Destination[]}
        usage={Object.fromEntries(counts)}
      />
    </div>
  );
}
