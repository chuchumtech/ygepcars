"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getViewer, requireActiveStudent } from "@/lib/auth";
import { parseSearchWindow } from "@/lib/search-params";
import { quoteForVehicle } from "@/lib/pricing";
import { notifyCancellation, notifyNewRequest } from "@/lib/email/notify";
import { checkBookingRules, loadBookingRules } from "@/lib/settings";
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

  // The office's rules, checked here so the student gets a sentence they can
  // act on. Database triggers enforce the same limits as a backstop.
  const rules = await loadBookingRules();
  const problems = checkBookingRules(startsAt, endsAt, rules, new Date());
  if (problems.length > 0) return { error: problems.join(" ") };

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

  const purpose = text(formData, "purpose");
  if (!purpose) {
    return { error: "Please tell the office what the trip is for — they need it to decide." };
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

  const { data: created, error } = await supabase
    .from("cars_reservations")
    .insert({
    user_id: viewer.userId,
    vehicle_id: vehicle.id,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    status: "pending",
    destination_id: destination.id,
    destination_label: label,
    purpose,
    hourly_rate_cents: vehicle.hourly_rate_cents,
    daily_cap_cents: vehicle.daily_cap_cents,
    billable_hours: quote.billableHours,
    time_charge_cents: quote.timeChargeCents,
    toll_cents: quote.tollCents,
    total_cents: quote.totalCents,
    student_notes: text(formData, "student_notes"),
    })
    .select("id, reference")
    .single();

  if (error) {
    if (error.code === "23P01") {
      return {
        error:
          "That car was just booked for an overlapping time. Search again to see what is still open.",
      };
    }
    return { error: error.message };
  }

  // The office hears about it, but a mail failure must never cost the student
  // their request -- sendOfficeEmail swallows its own errors.
  await notifyNewRequest({
    reservationId: created?.id ?? "",
    reference: created?.reference ?? "",
    studentName: viewer.profile.full_name,
    studentEmail: viewer.profile.email,
    studentPhone: viewer.profile.phone,
    vehicleName: vehicle.name,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    destinationLabel: label,
    purpose,
    totalCents: quote.totalCents,
    tollCents: quote.tollCents,
    studentNotes: text(formData, "student_notes"),
  });

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

  const { data: before } = await supabase
    .from("cars_reservations")
    .select("*, vehicle:cars_vehicles(name)")
    .eq("id", id)
    .eq("user_id", viewer.userId)
    .maybeSingle();

  const { data: cancelled } = await supabase
    .from("cars_reservations")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", viewer.userId)
    .in("status", ["pending", "approved"])
    .select("id")
    .maybeSingle();

  if (cancelled && before) {
    await notifyCancellation({
      reservationId: id,
      wasApproved: before.status === "approved",
      reference: before.reference,
      studentName: viewer.profile?.full_name ?? "",
      studentEmail: viewer.profile?.email ?? "",
      studentPhone: viewer.profile?.phone ?? "",
      vehicleName: before.vehicle?.name ?? "Car",
      startsAt: before.starts_at,
      endsAt: before.ends_at,
      destinationLabel: before.destination_label,
      purpose: before.purpose,
      totalCents: before.total_cents,
      tollCents: before.toll_cents,
      studentNotes: before.student_notes,
    });
  }

  revalidatePath("/reservations");
  revalidatePath("/admin");
}

/**
 * A student changing their own request before the office has decided on it.
 *
 * Written with the service role, because the guard trigger deliberately pins
 * the pricing columns against student edits -- and the price has to move when
 * the times do. Everything the client sent is treated as untrusted: ownership
 * and status are re-read from the database, the rules are re-checked, the
 * window is re-checked for clashes, and the quote is recomputed from the
 * vehicle's own rates rather than anything posted.
 */
export async function updateMyReservationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const viewer = await requireActiveStudent();
  const supabase = await createClient();

  const id = text(formData, "reservation_id");
  if (!id) return { error: "Missing reservation." };

  const { data: existing } = await supabase
    .from("cars_reservations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!existing || existing.user_id !== viewer.userId) {
    return { error: "That reservation is not yours." };
  }
  if (existing.status !== "pending") {
    return {
      error:
        "The office has already decided on this one. Call them if it needs to change.",
    };
  }

  const parsed = parseSearchWindow({
    start_date: text(formData, "start_date"),
    start_time: text(formData, "start_time"),
    end_date: text(formData, "end_date"),
    end_time: text(formData, "end_time"),
  });
  if ("error" in parsed) return { error: parsed.error };
  const { startsAt, endsAt } = parsed.window;

  const rules = await loadBookingRules();
  const problems = checkBookingRules(startsAt, endsAt, rules, new Date());
  if (problems.length > 0) return { error: problems.join(" ") };

  const purpose = text(formData, "purpose");
  if (!purpose) {
    return { error: "Please keep a reason for the trip — the office decides on it." };
  }

  const { data: vehicleRow } = await supabase
    .from("cars_vehicles")
    .select("*")
    .eq("id", existing.vehicle_id)
    .maybeSingle();
  const vehicle = vehicleRow as Vehicle | null;
  if (!vehicle) return { error: "That car is no longer available." };

  const destinationId = text(formData, "destination_id");
  const { data: destinationRow } = await supabase
    .from("cars_destinations")
    .select("*")
    .eq("id", destinationId)
    .maybeSingle();
  const destination = destinationRow as Destination | null;
  if (!destination) return { error: "Please choose where you are heading." };

  // Somebody else may have taken the window since the request went in.
  const { data: clashes } = await supabase.rpc("cars_busy_windows", {
    p_from: startsAt.toISOString(),
    p_to: endsAt.toISOString(),
  });
  const blocked = ((clashes ?? []) as { vehicle_id: string }[]).some(
    (row) => row.vehicle_id === vehicle.id,
  );
  const unchangedWindow =
    existing.starts_at === startsAt.toISOString() &&
    existing.ends_at === endsAt.toISOString();
  if (blocked && !unchangedWindow) {
    return { error: "That car is taken for those times now. Try a different window." };
  }

  const note = text(formData, "destination_note");
  const label = note ? `${destination.name} (${note})` : destination.name;
  const quoted = quoteForVehicle(vehicle, startsAt, endsAt, destination.toll_cents);

  const service = createAdminClient();
  const { error } = await service
    .from("cars_reservations")
    .update({
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      destination_id: destination.id,
      destination_label: label,
      purpose,
      student_notes: text(formData, "student_notes"),
      billable_hours: quoted.billableHours,
      time_charge_cents: quoted.timeChargeCents,
      toll_cents: quoted.tollCents,
      total_cents: quoted.totalCents,
    })
    .eq("id", id)
    .eq("user_id", viewer.userId)
    .eq("status", "pending");

  if (error) {
    if (error.code === "23P01") {
      return { error: "That car was just booked for those times. Try a different window." };
    }
    return { error: error.message };
  }

  revalidatePath("/account/reservations");
  revalidatePath("/admin");
  return { success: "Updated. The office sees the new details." };
}
