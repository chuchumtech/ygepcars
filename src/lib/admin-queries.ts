import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { CalendarData } from "@/components/calendar/types";

// One string literal on purpose: supabase-js parses it at the type level, and
// a concatenated expression degrades every row to an error type.
export const RESERVATION_SELECT =
  "*, vehicle:cars_vehicles(id, name, color, image_url), student:cars_profiles!cars_reservations_user_id_fkey(id, full_name, email, phone, payment_method), items:cars_reservation_items(*), payments:cars_payments(*)";

/** Everything the calendar needs for one window, in a single round trip each. */
export async function loadCalendarData(
  from: Date,
  to: Date,
): Promise<CalendarData> {
  const supabase = await createClient();

  const [reservations, blackouts, waitlist, vehicles, destinations, students] =
    await Promise.all([
      supabase
        .from("cars_reservations")
        .select(RESERVATION_SELECT)
        .lt("starts_at", to.toISOString())
        .gt("ends_at", from.toISOString())
        .order("starts_at"),
      supabase
        .from("cars_blackouts")
        .select("*, vehicle:cars_vehicles(id, name)")
        .lt("starts_at", to.toISOString())
        .gt("ends_at", from.toISOString()),
      supabase
        .from("cars_waitlist")
        .select(
          "*, vehicle:cars_vehicles(id, name, color), student:cars_profiles!cars_waitlist_user_id_fkey(id, full_name, email, phone)",
        )
        .in("status", ["waiting", "offered"])
        .lt("starts_at", to.toISOString())
        .gt("ends_at", from.toISOString())
        .order("position"),
      supabase.from("cars_vehicles").select("*").order("sort_order"),
      supabase.from("cars_destinations").select("*").order("sort_order"),
      supabase
        .from("cars_profiles")
        .select("id, full_name, email, phone, status")
        .eq("role", "student")
        .order("full_name"),
    ]);

  return {
    reservations: (reservations.data ?? []) as CalendarData["reservations"],
    blackouts: (blackouts.data ?? []) as CalendarData["blackouts"],
    waitlist: (waitlist.data ?? []) as CalendarData["waitlist"],
    vehicles: (vehicles.data ?? []) as CalendarData["vehicles"],
    destinations: (destinations.data ?? []) as CalendarData["destinations"],
    students: (students.data ?? []) as CalendarData["students"],
  };
}
