"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { parseMoneyToCents } from "@/lib/pricing";
import {
  friendlyDbError,
  optionalText,
  revalidateAdmin,
  text,
  type ActionResult,
} from "@/app/actions/shared";

/**
 * Logs damage, a ticket, a mess -- anything the office wants on the record
 * against a car and, when somebody is responsible, against them.
 *
 * A charge here lands on that student's balance next to their rentals, so the
 * statement tells the whole story rather than just the driving.
 */
export async function saveIncidentAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const id = text(formData, "incident_id");
  const vehicleId = text(formData, "vehicle_id");
  if (!vehicleId) return { error: "Which car was it?" };

  const chargeCents = parseMoneyToCents(text(formData, "charge")) ?? 0;
  if (chargeCents < 0) return { error: "A charge cannot be negative." };

  const userId = optionalText(formData, "user_id");
  if (chargeCents > 0 && !userId) {
    return { error: "Say who is being charged, or set the charge to zero." };
  }

  const record = {
    vehicle_id: vehicleId,
    reservation_id: optionalText(formData, "reservation_id"),
    user_id: userId,
    occurred_on: text(formData, "occurred_on") || new Date().toISOString().slice(0, 10),
    kind: text(formData, "kind") || "damage",
    description: text(formData, "description"),
    charge_cents: chargeCents,
    status: text(formData, "status") || "open",
    resolution: text(formData, "resolution"),
  };

  const { error } = id
    ? await supabase.from("cars_incidents").update(record).eq("id", id)
    : await supabase
        .from("cars_incidents")
        .insert({ ...record, reported_by: admin.userId });

  if (error) return { error: friendlyDbError(error) };

  revalidateAdmin();
  return { success: id ? "Incident updated." : "Incident logged." };
}

export async function deleteIncidentAction(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("cars_incidents").delete().eq("id", text(formData, "incident_id"));
  revalidateAdmin();
}

export async function resolveIncidentAction(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase
    .from("cars_incidents")
    .update({ status: text(formData, "next_status") === "open" ? "open" : "resolved" })
    .eq("id", text(formData, "incident_id"));
  revalidateAdmin();
}
