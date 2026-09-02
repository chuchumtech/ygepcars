"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { localToInstant } from "@/lib/dates";
import { parseMoneyToCents, quote } from "@/lib/pricing";
import type { Reservation, Vehicle } from "@/lib/types";
import {
  checkbox,
  friendlyDbError,
  revalidateAdmin,
  text,
  type ActionResult,
} from "@/app/actions/shared";

async function logActivity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actor: { userId: string; name: string },
  entry: {
    entityType: string;
    entityId: string | null;
    action: string;
    detail?: Record<string, unknown>;
  },
) {
  await supabase.from("cars_activity").insert({
    actor_id: actor.userId,
    actor_name: actor.name,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    action: entry.action,
    detail: entry.detail ?? {},
  });
}

/* -------------------------------------------------------------------------- */
/* Approve / decline / complete                                               */
/* -------------------------------------------------------------------------- */

export async function decideReservationAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const id = text(formData, "reservation_id");
  const decision = text(formData, "decision");

  if (!["approved", "declined", "completed", "cancelled", "pending"].includes(decision)) {
    return { error: "Unknown decision." };
  }

  const patch: Partial<Reservation> = {
    status: decision as Reservation["status"],
    decided_at: new Date().toISOString(),
    decided_by: admin.userId,
  };

  if (decision === "declined") {
    patch.decline_reason = text(formData, "decline_reason");
  }
  if (decision === "cancelled") {
    patch.cancelled_at = new Date().toISOString();
  }
  if (decision === "pending") {
    patch.decided_at = null;
    patch.decided_by = null;
  }

  const { error } = await supabase.from("cars_reservations").update(patch).eq("id", id);
  if (error) return { error: friendlyDbError(error) };

  await logActivity(supabase, { userId: admin.userId, name: admin.profile.full_name }, {
    entityType: "reservation",
    entityId: id,
    action: `marked ${decision}`,
  });

  revalidateAdmin();
  return { success: `Reservation marked ${decision}.` };
}

/* -------------------------------------------------------------------------- */
/* Full edit                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The office's edit form. Times, car, destination, tolls and a manual
 * adjustment are all changeable here; the time charge is recomputed from
 * whatever rate the reservation is carrying so the arithmetic always adds up.
 */
export async function updateReservationAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const id = text(formData, "reservation_id");
  if (!id) return { error: "Missing reservation." };

  const startsAt = localToInstant(text(formData, "start_date"), text(formData, "start_time"));
  const endsAt = localToInstant(text(formData, "end_date"), text(formData, "end_time"));

  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return { error: "Check the pickup and return dates." };
  }
  if (endsAt <= startsAt) {
    return { error: "The return has to be after the pickup." };
  }

  const vehicleId = text(formData, "vehicle_id");
  const { data: vehicleRow } = await supabase
    .from("cars_vehicles")
    .select("*")
    .eq("id", vehicleId)
    .maybeSingle();
  const vehicle = vehicleRow as Vehicle | null;
  if (!vehicle) return { error: "Pick a car." };

  const hourlyRateCents = parseMoneyToCents(text(formData, "hourly_rate")) ?? vehicle.hourly_rate_cents;
  const rawCap = text(formData, "daily_cap");
  const dailyCapCents = rawCap === "" ? null : parseMoneyToCents(rawCap);
  const tollCents = parseMoneyToCents(text(formData, "toll")) ?? 0;
  const adjustmentCents = parseMoneyToCents(text(formData, "adjustment")) ?? 0;

  if (hourlyRateCents < 0 || tollCents < 0) {
    return { error: "Rates and tolls cannot be negative." };
  }

  const recomputed = quote({
    startsAt,
    endsAt,
    hourlyRateCents,
    dailyCapCents,
    minimumHours: Number(vehicle.minimum_hours) || 1,
    tollCents,
    adjustmentCents,
  });

  const destinationId = text(formData, "destination_id");

  const { error } = await supabase
    .from("cars_reservations")
    .update({
      vehicle_id: vehicle.id,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: text(formData, "status") as Reservation["status"],
      destination_id: destinationId || null,
      destination_label: text(formData, "destination_label"),
      purpose: text(formData, "purpose"),
      hourly_rate_cents: hourlyRateCents,
      daily_cap_cents: dailyCapCents,
      billable_hours: recomputed.billableHours,
      time_charge_cents: recomputed.timeChargeCents,
      toll_cents: recomputed.tollCents,
      adjustment_cents: recomputed.adjustmentCents,
      adjustment_reason: text(formData, "adjustment_reason"),
      total_cents: recomputed.totalCents,
      admin_notes: text(formData, "admin_notes"),
      decline_reason: text(formData, "decline_reason"),
    })
    .eq("id", id);

  if (error) return { error: friendlyDbError(error) };

  await logActivity(supabase, { userId: admin.userId, name: admin.profile.full_name }, {
    entityType: "reservation",
    entityId: id,
    action: "edited",
    detail: { total_cents: recomputed.totalCents },
  });

  revalidateAdmin();
  return { success: "Reservation updated." };
}

/* -------------------------------------------------------------------------- */
/* Office-created reservation (walk-in / phone request)                        */
/* -------------------------------------------------------------------------- */

export async function createReservationAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const userId = text(formData, "user_id");
  const vehicleId = text(formData, "vehicle_id");
  if (!userId || !vehicleId) return { error: "Pick a student and a car." };

  const startsAt = localToInstant(text(formData, "start_date"), text(formData, "start_time"));
  const endsAt = localToInstant(text(formData, "end_date"), text(formData, "end_time"));
  if (endsAt <= startsAt) return { error: "The return has to be after the pickup." };

  const { data: vehicleRow } = await supabase
    .from("cars_vehicles")
    .select("*")
    .eq("id", vehicleId)
    .maybeSingle();
  const vehicle = vehicleRow as Vehicle | null;
  if (!vehicle) return { error: "That car no longer exists." };

  const destinationId = text(formData, "destination_id");
  let tollCents = 0;
  let destinationLabel = text(formData, "destination_label");

  if (destinationId) {
    const { data: destination } = await supabase
      .from("cars_destinations")
      .select("name, toll_cents")
      .eq("id", destinationId)
      .maybeSingle();
    if (destination) {
      tollCents = destination.toll_cents;
      if (!destinationLabel) destinationLabel = destination.name;
    }
  }

  const overrideToll = parseMoneyToCents(text(formData, "toll"));
  if (overrideToll !== null) tollCents = overrideToll;

  const computed = quote({
    startsAt,
    endsAt,
    hourlyRateCents: vehicle.hourly_rate_cents,
    dailyCapCents: vehicle.daily_cap_cents,
    minimumHours: Number(vehicle.minimum_hours) || 1,
    tollCents,
  });

  const { data: inserted, error } = await supabase
    .from("cars_reservations")
    .insert({
      user_id: userId,
      vehicle_id: vehicle.id,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: checkbox(formData, "approve_now") ? "approved" : "pending",
      destination_id: destinationId || null,
      destination_label: destinationLabel,
      purpose: text(formData, "purpose"),
      hourly_rate_cents: vehicle.hourly_rate_cents,
      daily_cap_cents: vehicle.daily_cap_cents,
      billable_hours: computed.billableHours,
      time_charge_cents: computed.timeChargeCents,
      toll_cents: computed.tollCents,
      total_cents: computed.totalCents,
      admin_notes: text(formData, "admin_notes"),
      decided_at: checkbox(formData, "approve_now") ? new Date().toISOString() : null,
      decided_by: checkbox(formData, "approve_now") ? admin.userId : null,
    })
    .select("id")
    .single();

  if (error) return { error: friendlyDbError(error) };

  await logActivity(supabase, { userId: admin.userId, name: admin.profile.full_name }, {
    entityType: "reservation",
    entityId: inserted?.id ?? null,
    action: "created by office",
  });

  revalidateAdmin();
  return { success: "Reservation created." };
}

export async function deleteReservationAction(formData: FormData) {
  const admin = await requireAdmin();
  const supabase = await createClient();
  const id = text(formData, "reservation_id");

  await supabase.from("cars_reservations").delete().eq("id", id);
  await logActivity(supabase, { userId: admin.userId, name: admin.profile.full_name }, {
    entityType: "reservation",
    entityId: id,
    action: "deleted",
  });

  revalidateAdmin();
}

/* -------------------------------------------------------------------------- */
/* Blackouts -- car out of service                                            */
/* -------------------------------------------------------------------------- */

export async function createBlackoutAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const startsAt = localToInstant(text(formData, "start_date"), text(formData, "start_time"));
  const endsAt = localToInstant(text(formData, "end_date"), text(formData, "end_time"));
  if (endsAt <= startsAt) return { error: "The end has to be after the start." };

  const { error } = await supabase.from("cars_blackouts").insert({
    vehicle_id: text(formData, "vehicle_id"),
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    reason: text(formData, "reason"),
    created_by: admin.userId,
  });

  if (error) return { error: friendlyDbError(error) };

  revalidateAdmin();
  return { success: "Car blocked off." };
}

export async function deleteBlackoutAction(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("cars_blackouts").delete().eq("id", text(formData, "blackout_id"));
  revalidateAdmin();
}
