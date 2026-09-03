import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatTile } from "@/components/ui";
import { WaitlistManager } from "./WaitlistManager";
import { formatMoney } from "@/lib/pricing";
import type { Destination, Vehicle, WaitlistEntryWithRefs } from "@/lib/types";

export const metadata: Metadata = { title: "Waitlist" };

export default async function WaitlistPage() {
  const supabase = await createClient();

  const [entries, vehicles, destinations] = await Promise.all([
    supabase
      .from("cars_waitlist")
      .select(
        "*, vehicle:cars_vehicles(id, name, color), student:cars_profiles!cars_waitlist_user_id_fkey(id, full_name, email, phone)",
      )
      .order("position")
      .order("created_at"),
    supabase.from("cars_vehicles").select("*").order("sort_order"),
    supabase.from("cars_destinations").select("*").order("sort_order"),
  ]);

  const all = (entries.data ?? []) as WaitlistEntryWithRefs[];
  const open = all
    .filter((entry) => ["waiting", "offered"].includes(entry.status))
    .sort((a, b) => {
      // position 0 means the office has never placed this one, so it sorts last.
      const pa = a.position === 0 ? Number.MAX_SAFE_INTEGER : a.position;
      const pb = b.position === 0 ? Number.MAX_SAFE_INTEGER : b.position;
      return pa - pb || a.created_at.localeCompare(b.created_at);
    });
  const closed = all.filter((entry) => !open.includes(entry));

  const flexible = open.filter((entry) => entry.flexible).length;
  const anyCar = open.filter((entry) => entry.vehicle_id === null).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Waitlist"
        description="Students whose window was already taken. Drag the order with the arrows, or just book in whoever you want — you are never forced to take the top of the list."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Waiting"
          value={String(open.length)}
          tone={open.length > 0 ? "warn" : "default"}
        />
        <StatTile label="Would take any car" value={String(anyCar)} hint="Easiest to place" />
        <StatTile label="Flexible on time" value={String(flexible)} hint="Nearby times work" />
      </div>

      <WaitlistManager
        open={open}
        closed={closed}
        vehicles={(vehicles.data ?? []) as Vehicle[]}
        destinations={(destinations.data ?? []) as Destination[]}
      />

      <p className="text-xs text-ink-soft">
        Students only ever see how many people are waiting on a window — never who
        they are. Estimates shown here are quoted fresh from current rates when you
        book someone in, so a rate change since they joined is picked up
        automatically. Charges start at {formatMoney(0)} until a reservation exists.
      </p>
    </div>
  );
}
