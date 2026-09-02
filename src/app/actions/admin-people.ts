"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { parseMoneyToCents } from "@/lib/pricing";
import type { PaymentMethod, ProfileStatus } from "@/lib/types";
import {
  friendlyDbError,
  optionalText,
  revalidateAdmin,
  text,
  type ActionResult,
} from "@/app/actions/shared";

/* -------------------------------------------------------------------------- */
/* Students                                                                   */
/* -------------------------------------------------------------------------- */

/** Approve a new sign-up, lock somebody out, or let them back in. */
export async function setStudentStatusAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const id = text(formData, "student_id");
  const status = text(formData, "status") as ProfileStatus;

  if (!["pending", "active", "locked"].includes(status)) {
    return { error: "Unknown status." };
  }
  if (id === admin.userId && status !== "active") {
    return { error: "You cannot lock yourself out." };
  }

  const { error } = await supabase
    .from("cars_profiles")
    .update({
      status,
      locked_reason: status === "locked" ? text(formData, "locked_reason") : "",
      approved_at: status === "active" ? new Date().toISOString() : null,
      approved_by: status === "active" ? admin.userId : null,
    })
    .eq("id", id);

  if (error) return { error: friendlyDbError(error) };

  await supabase.from("cars_activity").insert({
    actor_id: admin.userId,
    actor_name: admin.profile.full_name,
    entity_type: "student",
    entity_id: id,
    action: `status set to ${status}`,
  });

  revalidateAdmin();
  return { success: `Account is now ${status}.` };
}

export async function setStudentRoleAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const id = text(formData, "student_id");
  const role = text(formData, "role");

  if (!["student", "admin"].includes(role)) return { error: "Unknown role." };
  if (id === admin.userId && role !== "admin") {
    return { error: "You cannot remove your own office access." };
  }

  const { error } = await supabase.from("cars_profiles").update({ role }).eq("id", id);
  if (error) return { error: friendlyDbError(error) };

  revalidateAdmin();
  return { success: `Now a${role === "admin" ? "n office admin" : " student"}.` };
}

/** The office editing a student's record from the CRM. */
export async function updateStudentAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const id = text(formData, "student_id");
  const fullName = text(formData, "full_name");
  if (!fullName) return { error: "A name is required." };

  const { error } = await supabase
    .from("cars_profiles")
    .update({
      full_name: fullName,
      phone: text(formData, "phone"),
      email: text(formData, "email"),
      address: text(formData, "address"),
      emergency_contact: text(formData, "emergency_contact"),
      license_number: text(formData, "license_number"),
      license_expires_on: optionalText(formData, "license_expires_on"),
      notes: text(formData, "notes"),
    })
    .eq("id", id);

  if (error) return { error: friendlyDbError(error) };

  revalidateAdmin();
  return { success: "Student updated." };
}

/**
 * Add a student the office already knows about. Creates the auth user with the
 * service role and marks them active immediately, so the office can book on
 * their behalf without waiting for them to register.
 */
export async function inviteStudentAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const fullName = text(formData, "full_name");
  const email = text(formData, "email").toLowerCase();
  const phone = text(formData, "phone");
  const password = String(formData.get("password") ?? "");

  if (!fullName || !email) return { error: "Name and email are required." };
  if (password.length < 8) {
    return { error: "Set a starting password of at least 8 characters." };
  }

  const service = createAdminClient();
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone },
  });

  if (error) return { error: error.message };
  if (!data.user) return { error: "Could not create that account." };

  const { error: profileError } = await service.from("cars_profiles").upsert(
    {
      id: data.user.id,
      full_name: fullName,
      email,
      phone,
      role: "student",
      status: "active",
      approved_at: new Date().toISOString(),
      approved_by: admin.userId,
      notes: text(formData, "notes"),
    },
    { onConflict: "id" },
  );

  if (profileError) return { error: friendlyDbError(profileError) };

  revalidateAdmin();
  return { success: `${fullName} can sign in with that password.` };
}

/* -------------------------------------------------------------------------- */
/* Payments                                                                   */
/* -------------------------------------------------------------------------- */

export async function recordPaymentAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const userId = text(formData, "student_id");
  const amountCents = parseMoneyToCents(text(formData, "amount"));

  if (!userId) return { error: "Missing student." };
  if (amountCents === null || amountCents === 0) {
    return { error: "Enter an amount, e.g. 45 or 45.50." };
  }

  const { error } = await supabase.from("cars_payments").insert({
    user_id: userId,
    reservation_id: optionalText(formData, "reservation_id"),
    amount_cents: amountCents,
    method: (text(formData, "method") || "cash") as PaymentMethod,
    reference: text(formData, "reference"),
    note: text(formData, "note"),
    paid_on: text(formData, "paid_on") || new Date().toISOString().slice(0, 10),
    recorded_by: admin.userId,
  });

  if (error) return { error: friendlyDbError(error) };

  revalidateAdmin();
  return { success: "Payment recorded." };
}

export async function deletePaymentAction(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("cars_payments").delete().eq("id", text(formData, "payment_id"));
  revalidateAdmin();
}
