"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getViewer, requireActiveStudent, requireAdmin } from "@/lib/auth";
import { parseSearchWindow } from "@/lib/search-params";
import { quoteForVehicle } from "@/lib/pricing";
import { notifyWaitlistJoin } from "@/lib/email/notify";
import { friendlyDbError, text, type ActionResult } from "@/app/actions/shared";
import type { Vehicle } from "@/lib/types";

/* -------------------------------------------------------------------------- */
/* Student joins                                                              */
/* -------------------------------------------------------------------------- */

export async function joinWaitlistAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const viewer = await requireActiveStudent();
  const supabase = await createClient();

  const parsed = parseSearchWindow({
    start_date: text(formData, "start_date"),
    start_time: text(formData, "start_time"),
    end_date: text(formData, "end_date"),
    end_time: text(formData, "end_time"),
  });
  if ("error" in parsed) return { error: parsed.error };

  const { startsAt, endsAt } = parsed.window;
  if (startsAt.getTime() < Date.now() - 60_000) {
    return { error: "That window has already passed." };
  }

  // Blank means "whichever car frees up first".
  const vehicleId = text(formData, "vehicle_id") || null;
  const destinationId = text(formData, "destination_id") || null;

  let vehicleName = "Any car";
  if (vehicleId) {
    const { data } = await supabase
      .from("cars_vehicles")
      .select("name")
      .eq("id", vehicleId)
      .maybeSingle();
    vehicleName = data?.name ?? "Car";
  }

  let destinationLabel = "";
  if (destinationId) {
    const { data } = await supabase
      .from("cars_destinations")
      .select("name")
      .eq("id", destinationId)
      .maybeSingle();
    destinationLabel = data?.name ?? "";
  }

  const { data: created, error } = await supabase
    .from("cars_waitlist")
    .insert({
      user_id: viewer.userId,
      vehicle_id: vehicleId,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      destination_id: destinationId,
      destination_label: destinationLabel,
      purpose: text(formData, "purpose"),
      flexible: formData.get("flexible") === "on",
      student_notes: text(formData, "student_notes"),
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "You are already on the waitlist for that window." };
    }
    return { error: friendlyDbError(error) };
  }

  const { data: total } = await supabase.rpc("cars_waitlist_count", {
    p_start: startsAt.toISOString(),
    p_end: endsAt.toISOString(),
    p_vehicle: vehicleId,
  });

  await notifyWaitlistJoin({
    waitlistId: created.id,
    studentName: viewer.profile.full_name,
    studentPhone: viewer.profile.phone,
    vehicleName,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    destinationLabel,
    flexible: formData.get("flexible") === "on",
    totalWaiting: typeof total === "number" ? total : 0,
  });

  revalidatePath("/reservations");
  revalidatePath("/admin", "layout");
  redirect("/reservations?waitlisted=1");
}

export async function leaveWaitlistAction(formData: FormData) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const supabase = await createClient();
  await supabase
    .from("cars_waitlist")
    .update({ status: "cancelled" })
    .eq("id", text(formData, "waitlist_id"))
    .eq("user_id", viewer.userId)
    .in("status", ["waiting", "offered"]);

  revalidatePath("/reservations");
  revalidatePath("/admin", "layout");
}

/* -------------------------------------------------------------------------- */
/* Office                                                                      */
/* -------------------------------------------------------------------------- */

export async function setWaitlistStatusAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const id = text(formData, "waitlist_id");
  const status = text(formData, "status");

  if (!["waiting", "offered", "expired", "cancelled"].includes(status)) {
    return { error: "Unknown status." };
  }

  const { error } = await supabase
    .from("cars_waitlist")
    .update({
      status,
      admin_notes: text(formData, "admin_notes"),
      offered_at: status === "offered" ? new Date().toISOString() : null,
      offered_by: status === "offered" ? admin.userId : null,
    })
    .eq("id", id);

  if (error) return { error: friendlyDbError(error) };

  revalidatePath("/admin", "layout");
  return { success: `Marked ${status}.` };
}

/**
 * Turns a waitlist entry into a real approved reservation. Quoted fresh from the
 * car's current rates, and the exclusion constraint still has the final say on
 * whether the window is genuinely free.
 */
export async function convertWaitlistAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const id = text(formData, "waitlist_id");

  const { data: entry } = await supabase
    .from("cars_waitlist")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!entry) return { error: "That waitlist entry is gone." };

  const vehicleId = text(formData, "vehicle_id") || entry.vehicle_id;
  if (!vehicleId) return { error: "Choose which car they are getting." };

  const { data: vehicleRow } = await supabase
    .from("cars_vehicles")
    .select("*")
    .eq("id", vehicleId)
    .maybeSingle();

  const vehicle = vehicleRow as Vehicle | null;
  if (!vehicle) return { error: "That car no longer exists." };

  let tollCents = 0;
  if (entry.destination_id) {
    const { data: destination } = await supabase
      .from("cars_destinations")
      .select("toll_cents")
      .eq("id", entry.destination_id)
      .maybeSingle();
    tollCents = destination?.toll_cents ?? 0;
  }

  const startsAt = new Date(entry.starts_at);
  const endsAt = new Date(entry.ends_at);
  const quote = quoteForVehicle(vehicle, startsAt, endsAt, tollCents);

  const { data: reservation, error } = await supabase
    .from("cars_reservations")
    .insert({
      user_id: entry.user_id,
      vehicle_id: vehicle.id,
      starts_at: entry.starts_at,
      ends_at: entry.ends_at,
      status: "approved",
      destination_id: entry.destination_id,
      destination_label: entry.destination_label,
      purpose: entry.purpose,
      hourly_rate_cents: vehicle.hourly_rate_cents,
      daily_cap_cents: vehicle.daily_cap_cents,
      billable_hours: quote.billableHours,
      time_charge_cents: quote.timeChargeCents,
      toll_cents: quote.tollCents,
      student_notes: entry.student_notes,
      admin_notes: `From the waitlist. ${entry.admin_notes}`.trim(),
      decided_at: new Date().toISOString(),
      decided_by: admin.userId,
    })
    .select("id")
    .single();

  if (error) return { error: friendlyDbError(error) };

  await supabase
    .from("cars_waitlist")
    .update({ status: "converted", converted_reservation_id: reservation.id })
    .eq("id", id);

  revalidatePath("/admin", "layout");
  revalidatePath("/reservations");
  return { success: "Booked, and the student can see it now." };
}

/**
 * Moves an entry to a 1-based position in the open queue. The database function
 * renumbers everything in one statement, so the office never sees half-applied
 * ordering and out-of-range targets are clamped rather than rejected.
 */
export async function moveWaitlistAction(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();

  const id = text(formData, "waitlist_id");
  const target = Number(text(formData, "target"));
  if (!id || !Number.isFinite(target)) return;

  await supabase.rpc("cars_waitlist_move", {
    p_id: id,
    p_target: Math.max(1, Math.round(target)),
  });

  revalidatePath("/admin", "layout");
}

export async function deleteWaitlistAction(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("cars_waitlist").delete().eq("id", text(formData, "waitlist_id"));
  revalidatePath("/admin", "layout");
}
