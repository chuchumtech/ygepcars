"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import type { ProfileStatus } from "@/lib/types";
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
  const firstName = text(formData, "first_name");
  const lastName = text(formData, "last_name");
  const email = text(formData, "email").toLowerCase();
  const paymentMethod = text(formData, "payment_method") || "cash";

  if (!firstName || !lastName) return { error: "First and last name are both required." };
  if (!["zelle", "cash"].includes(paymentMethod)) return { error: "Choose Zelle or cash." };

  const { error } = await supabase
    .from("cars_profiles")
    .update({
      first_name: firstName,
      last_name: lastName,
      phone: text(formData, "phone"),
      email,
      payment_method: paymentMethod,
      address: text(formData, "address"),
      emergency_contact: text(formData, "emergency_contact"),
      license_number: text(formData, "license_number"),
      license_expires_on: optionalText(formData, "license_expires_on"),
      notes: text(formData, "notes"),
    })
    .eq("id", id);

  if (error) return { error: friendlyDbError(error) };

  // The profile email is what the office reads; the auth email is what the
  // student signs in with. Keeping them apart would be a support ticket
  // waiting to happen, so move both together.
  if (email) {
    const service = createAdminClient();
    const { error: authError } = await service.auth.admin.updateUserById(id, { email });
    if (authError) {
      return {
        error: `Details saved, but the sign-in email could not be changed: ${authError.message}`,
      };
    }
  }

  revalidateAdmin();
  return { success: "Student updated." };
}

/**
 * Sets a new password for a student who has locked themselves out.
 *
 * The office reads the new password off the screen and tells the student; there
 * is no email round trip, which is how they already hand out accounts.
 */
export async function resetStudentPasswordAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const id = text(formData, "student_id");
  const password = String(formData.get("new_password") ?? "");

  if (!id) return { error: "Missing student." };
  if (password.length < 8) {
    return { error: "Set a password of at least 8 characters." };
  }

  const service = createAdminClient();
  const { error } = await service.auth.admin.updateUserById(id, { password });
  if (error) return { error: error.message };

  const supabase = await createClient();
  await supabase.from("cars_activity").insert({
    actor_id: admin.userId,
    actor_name: admin.profile.full_name,
    entity_type: "student",
    entity_id: id,
    action: "password reset",
  });

  revalidateAdmin();
  return { success: "Password changed. Give it to the student and ask them to change it." };
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

  const firstName = text(formData, "first_name");
  const lastName = text(formData, "last_name");
  const email = text(formData, "email").toLowerCase();
  const phone = text(formData, "phone");
  const paymentMethod = text(formData, "payment_method") || "cash";
  const password = String(formData.get("password") ?? "");
  const fullName = `${firstName} ${lastName}`.trim();

  if (!firstName || !lastName || !email) {
    return { error: "First name, last name and email are all required." };
  }
  if (password.length < 8) {
    return { error: "Set a starting password of at least 8 characters." };
  }

  const service = createAdminClient();
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, first_name: firstName, last_name: lastName, phone },
  });

  if (error) return { error: error.message };
  if (!data.user) return { error: "Could not create that account." };

  const { error: profileError } = await service.from("cars_profiles").upsert(
    {
      id: data.user.id,
      first_name: firstName,
      last_name: lastName,
      full_name: fullName,
      email,
      phone,
      payment_method: paymentMethod,
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

/* Payments and account charges live in @/app/actions/billing now, so that the
   one place money is recorded is the one place that knows what recording it
   does to a balance and to the car's availability. */
