"use server";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { deleteCarPhoto, uploadCarPhoto } from "@/lib/car-photos";
import { parseMoneyToCents } from "@/lib/pricing";
import {
  checkbox,
  friendlyDbError,
  integer,
  revalidateAdmin,
  text,
  type ActionResult,
} from "@/app/actions/shared";

/* -------------------------------------------------------------------------- */
/* Cars                                                                       */
/* -------------------------------------------------------------------------- */

export async function saveVehicleAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const id = text(formData, "vehicle_id");
  const name = text(formData, "name");
  if (!name) return { error: "Give the car a name, e.g. 2023 Subaru Legacy." };

  const hourlyRateCents = parseMoneyToCents(text(formData, "hourly_rate"));
  if (hourlyRateCents === null || hourlyRateCents < 0) {
    return { error: "Enter an hourly rate, e.g. 15 or 15.50." };
  }

  const rawCap = text(formData, "daily_cap");
  const dailyCapCents = rawCap === "" ? null : parseMoneyToCents(rawCap);
  if (rawCap !== "" && (dailyCapCents === null || dailyCapCents < 0)) {
    return { error: "The daily cap has to be a number, or left blank for no cap." };
  }

  const minimumHours = Number(text(formData, "minimum_hours") || "1");
  if (!Number.isFinite(minimumHours) || minimumHours <= 0) {
    return { error: "The minimum has to be more than zero hours." };
  }

  const yearRaw = text(formData, "year");

  // The photo is handled after the row exists, since a brand new car has no id
  // to file it under yet. Until then keep whatever it had.
  const photo = formData.get("photo");
  const newPhoto = photo instanceof File && photo.size > 0 ? photo : null;
  const dropPhoto = checkbox(formData, "remove_photo");
  const existing = text(formData, "current_image_url");

  const record = {
    name,
    year: yearRaw ? integer(formData, "year") : null,
    make: text(formData, "make"),
    model: text(formData, "model"),
    color: text(formData, "color"),
    license_plate: text(formData, "license_plate"),
    seats: text(formData, "seats") ? integer(formData, "seats") : null,
    image_url: dropPhoto && !newPhoto ? "" : existing,
    hourly_rate_cents: hourlyRateCents,
    daily_cap_cents: dailyCapCents,
    minimum_hours: minimumHours,
    is_active: checkbox(formData, "is_active"),
    notes: text(formData, "notes"),
    sort_order: integer(formData, "sort_order"),
  };

  const saved = id
    ? await supabase.from("cars_vehicles").update(record).eq("id", id).select("id").single()
    : await supabase.from("cars_vehicles").insert(record).select("id").single();

  if (saved.error) return { error: friendlyDbError(saved.error) };

  const vehicleId = (saved.data as { id: string }).id;
  const admin = createAdminClient();

  if (newPhoto) {
    const uploaded = await uploadCarPhoto(admin, vehicleId, newPhoto);
    if ("error" in uploaded) {
      // The car itself is saved; only the photo failed, so say which.
      revalidateAdmin();
      return { error: uploaded.error };
    }

    await supabase
      .from("cars_vehicles")
      .update({ image_url: uploaded.url })
      .eq("id", vehicleId);

    if (existing) await deleteCarPhoto(admin, existing);
  } else if (dropPhoto && existing) {
    await deleteCarPhoto(admin, existing);
  }

  revalidateAdmin();
  return {
    success: id
      ? newPhoto
        ? "Car updated, new photo is live."
        : "Car updated."
      : "Car added.",
  };
}

export async function toggleVehicleAction(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase
    .from("cars_vehicles")
    .update({ is_active: text(formData, "next_state") === "true" })
    .eq("id", text(formData, "vehicle_id"));
  revalidateAdmin();
}

/* -------------------------------------------------------------------------- */
/* Destinations and their flat toll charges                                   */
/* -------------------------------------------------------------------------- */

export async function saveDestinationAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const id = text(formData, "destination_id");
  const name = text(formData, "name");
  if (!name) return { error: "Give the destination a name." };

  const tollCents = parseMoneyToCents(text(formData, "toll"));
  if (tollCents === null || tollCents < 0) {
    return { error: "Enter the flat toll charge, e.g. 18 or 0." };
  }

  const record = {
    name,
    toll_cents: tollCents,
    description: text(formData, "description"),
    is_active: checkbox(formData, "is_active"),
    sort_order: integer(formData, "sort_order"),
  };

  const { error } = id
    ? await supabase.from("cars_destinations").update(record).eq("id", id)
    : await supabase.from("cars_destinations").insert(record);

  if (error) return { error: friendlyDbError(error) };

  revalidateAdmin();
  return { success: id ? "Destination updated." : "Destination added." };
}

/**
 * Destinations are referenced by past reservations, so deleting one would erase
 * history. Retiring hides it from students and leaves the record intact.
 */
export async function retireDestinationAction(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase
    .from("cars_destinations")
    .update({ is_active: text(formData, "next_state") === "true" })
    .eq("id", text(formData, "destination_id"));
  revalidateAdmin();
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

export async function saveSettingsAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  // Rules are clamped rather than rejected: a zero or negative window would
  // quietly disable a rule, which is not something to allow by typo.
  const rule = (key: string, fallback: number, max: number) => {
    const raw = integer(formData, key, fallback);
    return Math.min(Math.max(raw, 1), max);
  };

  const feeRule = (key: string, fallback: number, max: number) => {
    // Zero is a real answer here: it means "do not charge".
    const raw = integer(formData, key, fallback);
    return Math.min(Math.max(raw, 0), max);
  };

  const updates: { key: string; value: unknown }[] = [
    { key: "min_rental_hours", value: rule("min_rental_hours", 4, 24 * 14) },
    { key: "late_grace_minutes", value: feeRule("late_grace_minutes", 15, 24 * 60) },
    {
      key: "late_fee_per_hour_cents",
      value: parseMoneyToCents(text(formData, "late_fee_per_hour")) ?? 1500,
    },
    {
      key: "fuel_fee_per_eighth_cents",
      value: parseMoneyToCents(text(formData, "fuel_fee_per_eighth")) ?? 800,
    },
    { key: "notify_students", value: checkbox(formData, "notify_students") },
    {
      key: "notify_student_on_approved",
      value: checkbox(formData, "notify_student_on_approved"),
    },
    {
      key: "notify_student_on_declined",
      value: checkbox(formData, "notify_student_on_declined"),
    },
    { key: "min_advance_hours", value: rule("min_advance_hours", 2, 24 * 30) },
    { key: "payment_hold_hours", value: rule("payment_hold_hours", 12, 24 * 30) },
    { key: "org_name", value: text(formData, "org_name") },
    { key: "office_email", value: text(formData, "office_email") },
    { key: "office_phone", value: text(formData, "office_phone") },
    { key: "booking_notice", value: text(formData, "booking_notice") },
    { key: "max_booking_days", value: integer(formData, "max_booking_days", 14) },
    { key: "max_advance_days", value: integer(formData, "max_advance_days", 120) },
  ];

  const { error } = await supabase
    .from("cars_settings")
    .upsert(
      updates.map((u) => ({ key: u.key, value: u.value })),
      { onConflict: "key" },
    );

  if (error) return { error: friendlyDbError(error) };

  revalidateAdmin();
  return { success: "Settings saved." };
}
