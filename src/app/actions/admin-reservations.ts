"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { localToInstant } from "@/lib/dates";
import { parseMoneyToCents, quote } from "@/lib/pricing";
import { assessReturn } from "@/lib/returns";
import { loadReturnRules } from "@/lib/settings";
import { notifyStudentApproved, notifyStudentDeclined } from "@/lib/email/notify";
import type { Reservation, Vehicle } from "@/lib/types";
import {
  friendlyDbError,
  logActivity,
  revalidateAdmin,
  text,
  type ActionResult,
} from "@/app/actions/shared";

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

  if (
    ![
      "approved",
      "declined",
      "completed",
      "cancelled",
      "pending",
      "hold",
      "released",
    ].includes(decision)
  ) {
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
  if (decision === "hold") {
    const until = text(formData, "hold_expires_at");
    patch.hold_expires_at = until ? new Date(`${until}T23:59:00`).toISOString() : null;
    patch.released_at = null;
    patch.release_reason = "";
  }
  if (decision === "released") {
    patch.released_at = new Date().toISOString();
    patch.release_reason = text(formData, "release_reason");
  }

  // undefined means "leave it alone".
  const cleaned = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  );

  const { error } = await supabase.from("cars_reservations").update(cleaned).eq("id", id);
  if (error) return { error: friendlyDbError(error) };

  // Tell the student, if the office has student mail switched on. Never lets a
  // mail problem turn a successful decision into an error.
  if (decision === "approved" || decision === "declined") {
    const { data: row } = await supabase
      .from("cars_reservations")
      .select("*, vehicle:cars_vehicles(name), student:cars_profiles!cars_reservations_user_id_fkey(full_name, email)")
      .eq("id", id)
      .maybeSingle();

    if (row?.student?.email) {
      const shared = {
        reservationId: id,
        to: row.student.email as string,
        studentName: (row.student.full_name as string) ?? "",
        vehicleName: (row.vehicle?.name as string) ?? "Car",
        startsAt: row.starts_at as string,
        endsAt: row.ends_at as string,
      };
      if (decision === "approved") {
        await notifyStudentApproved({
          ...shared,
          destinationLabel: (row.destination_label as string) ?? "",
          totalCents: (row.total_cents as number) ?? 0,
          reference: (row.reference as string) ?? "",
        });
      } else {
        await notifyStudentDeclined({
          ...shared,
          declineReason: (row.decline_reason as string) ?? "",
        });
      }
    }
  }

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
 * The office's edit form: times, car, destination, rate and tolls. The time
 * charge is recomputed from whatever rate the reservation is carrying.
 *
 * Extras and discounts are not here -- they are line items with their own
 * descriptions, added and removed one at a time, and the database rolls them
 * into adjustment_cents and the total. Nothing in the app computes a total any
 * more, which is why total_cents is not written below.
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
      admin_notes: text(formData, "admin_notes"),
      decline_reason: text(formData, "decline_reason"),
    })
    .eq("id", id);

  if (error) return { error: friendlyDbError(error) };

  await logActivity(supabase, { userId: admin.userId, name: admin.profile.full_name }, {
    entityType: "reservation",
    entityId: id,
    action: "edited",
    detail: { time_charge_cents: recomputed.timeChargeCents, toll_cents: tollCents },
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

  const requested = text(formData, "initial_status");
  const initialStatus = (["pending", "hold", "approved"].includes(requested)
    ? requested
    : "approved") as "pending" | "hold" | "approved";

  const holdUntilRaw = text(formData, "hold_expires_at");
  const holdUntil =
    initialStatus === "hold" && holdUntilRaw
      ? new Date(`${holdUntilRaw}T23:59:00`).toISOString()
      : null;

  const { data: inserted, error } = await supabase
    .from("cars_reservations")
    .insert({
      user_id: userId,
      vehicle_id: vehicle.id,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: initialStatus,
      destination_id: destinationId || null,
      destination_label: destinationLabel,
      purpose: text(formData, "purpose"),
      hourly_rate_cents: vehicle.hourly_rate_cents,
      daily_cap_cents: vehicle.daily_cap_cents,
      billable_hours: computed.billableHours,
      time_charge_cents: computed.timeChargeCents,
      toll_cents: computed.tollCents,
      admin_notes: text(formData, "admin_notes"),
      hold_expires_at: holdUntil,
      decided_at: initialStatus === "approved" ? new Date().toISOString() : null,
      decided_by: initialStatus === "approved" ? admin.userId : null,
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

/* -------------------------------------------------------------------------- */
/* Check the car back in                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Records a return: when it actually came back and where the fuel gauge sat.
 *
 * Late and fuel fees are worked out here rather than typed in, and both land on
 * the reservation total so they flow through to the student's balance. The
 * car's fuel level is updated to whatever came back, which becomes the level
 * the next renter has to match.
 */
export async function checkInReservationAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const id = text(formData, "reservation_id");
  const { data: reservation } = await supabase
    .from("cars_reservations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!reservation) return { error: "That reservation is gone." };

  const returnedRaw = text(formData, "returned_at");
  const returnedAt = returnedRaw ? new Date(returnedRaw) : new Date();
  if (Number.isNaN(returnedAt.getTime())) {
    return { error: "Check the return time." };
  }

  const fuelInRaw = text(formData, "fuel_in");
  const fuelIn = fuelInRaw === "" ? null : Number(fuelInRaw);
  if (fuelIn !== null && (!Number.isInteger(fuelIn) || fuelIn < 0 || fuelIn > 8)) {
    return { error: "Fuel has to be a gauge reading between empty and full." };
  }

  const rules = await loadReturnRules();
  const assessment = assessReturn({
    dueAt: new Date(reservation.ends_at),
    returnedAt,
    fuelOut: reservation.fuel_out,
    fuelIn,
    rules,
  });

  // The office can override either figure, e.g. to waive a fee.
  const lateFeeCents = parseMoneyToCents(text(formData, "late_fee")) ?? assessment.lateFeeCents;
  const fuelFeeCents = parseMoneyToCents(text(formData, "fuel_fee")) ?? assessment.fuelFeeCents;

  const { error } = await supabase
    .from("cars_reservations")
    .update({
      status: "completed",
      returned_at: returnedAt.toISOString(),
      fuel_in: fuelIn,
      late_minutes: assessment.lateMinutes,
      late_fee_cents: lateFeeCents,
      fuel_fee_cents: fuelFeeCents,
      return_notes: text(formData, "return_notes"),
    })
    .eq("id", id);

  if (error) return { error: friendlyDbError(error) };

  // Whatever it came back at is what the next student has to match.
  if (fuelIn !== null) {
    await supabase
      .from("cars_vehicles")
      .update({ fuel_level: fuelIn })
      .eq("id", reservation.vehicle_id);
  }

  await logActivity(supabase, { userId: admin.userId, name: admin.profile.full_name }, {
    entityType: "reservation",
    entityId: id,
    action: "checked in",
    detail: { late_minutes: assessment.lateMinutes, fuel_in: fuelIn },
  });

  revalidateAdmin();
  return {
    success:
      assessment.lateMinutes > 0 || fuelFeeCents > 0
        ? "Checked in, with fees applied."
        : "Checked in.",
  };
}

/** Records the car going out, so the fuel level at pickup is on the record. */
export async function checkOutReservationAction(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();

  const id = text(formData, "reservation_id");
  const { data: reservation } = await supabase
    .from("cars_reservations")
    .select("vehicle_id")
    .eq("id", id)
    .maybeSingle();
  if (!reservation) return;

  const { data: vehicle } = await supabase
    .from("cars_vehicles")
    .select("fuel_level")
    .eq("id", reservation.vehicle_id)
    .maybeSingle();

  await supabase
    .from("cars_reservations")
    .update({
      picked_up_at: new Date().toISOString(),
      fuel_out: vehicle?.fuel_level ?? null,
    })
    .eq("id", id);

  revalidateAdmin();
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
