"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getViewer, requireActiveStudent } from "@/lib/auth";
import { parseSearchWindow } from "@/lib/search-params";
import { quoteForVehicle } from "@/lib/pricing";
import type { Destination, Vehicle } from "@/lib/types";

export type ActionState = { error?: string; success?: string };

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Files a student's reservation request.
 *
 * The quote is recomputed here from the vehicle's current rates and the chosen
 * destination's current toll; whatever the browser posted is treated as
 * display-only. Availability is re-checked at the last moment, and the database
 * exclusion constraint is the final backstop against two people landing on the
 * same car at the same time.
 */
export async function requestReservationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const viewer = await requireActiveStudent();
  const supabase = await createClient();

  const vehicleId = text(formData, "vehicle_id");
  const parsed = parseSearchWindow({
    start_date: text(formData, "start_date"),
    start_time: text(formData, "start_time"),
    end_date: text(formData, "end_date"),
    end_time: text(formData, "end_time"),
  });

  if ("error" in parsed) return { error: parsed.error };
  const { startsAt, endsAt } = parsed.window;

  if (startsAt.getTime() < Date.now() - 60_000) {
    return { error: "That pickup time is in the past. Please pick a new time." };
  }

  const { data: vehicleRow } = await supabase
    .from("cars_vehicles")
    .select("*")
    .eq("id", vehicleId)
    .maybeSingle();

  const vehicle = vehicleRow as Vehicle | null;
  if (!vehicle || !vehicle.is_active) {
    return { error: "That car is not available to book." };
  }

  const destinationId = text(formData, "destination_id");
  let destination: Destination | null = null;
  if (destinationId) {
    const { data } = await supabase
      .from("cars_destinations")
      .select("*")
      .eq("id", destinationId)
      .maybeSingle();
    destination = data as Destination | null;
  }
  if (!destination) {
    return { error: "Please choose where you are heading." };
  }

  const destinationNote = text(formData, "destination_note");
  const quote = quoteForVehicle(vehicle, startsAt, endsAt, destination.toll_cents);

  // Last-moment availability check for a friendly message; the exclusion
  // constraint below is what actually guarantees it.
  const { data: availability } = await supabase.rpc("cars_availability", {
    p_start: startsAt.toISOString(),
    p_end: endsAt.toISOString(),
  });
  const state = (availability ?? []).find(
    (row: { vehicle_id: string }) => row.vehicle_id === vehicleId,
  );
  if (state && !state.is_available) {
    return {
      error:
        "Someone got to that car first. Go back and search again to see what is still open.",
    };
  }

  const label = destinationNote
    ? `${destination.name} (${destinationNote})`
    : destination.name;

  const { error } = await supabase.from("cars_reservations").insert({
    user_id: viewer.userId,
    vehicle_id: vehicle.id,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    status: "pending",
    destination_id: destination.id,
    destination_label: label,
    purpose: text(formData, "purpose"),
    hourly_rate_cents: vehicle.hourly_rate_cents,
    daily_cap_cents: vehicle.daily_cap_cents,
    billable_hours: quote.billableHours,
    time_charge_cents: quote.timeChargeCents,
    toll_cents: quote.tollCents,
    total_cents: quote.totalCents,
    student_notes: text(formData, "student_notes"),
  });

  if (error) {
    if (error.code === "23P01") {
      return {
        error:
          "That car was just booked for an overlapping time. Search again to see what is still open.",
      };
    }
    return { error: error.message };
  }

  revalidatePath("/reservations");
  revalidatePath("/admin");
  redirect("/reservations?requested=1");
}

/** A student withdrawing their own request, or calling off an approved trip. */
export async function cancelReservationAction(formData: FormData) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const id = text(formData, "reservation_id");
  const supabase = await createClient();

  await supabase
    .from("cars_reservations")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", viewer.userId)
    .in("status", ["pending", "approved"]);

  revalidatePath("/reservations");
  revalidatePath("/admin");
}
