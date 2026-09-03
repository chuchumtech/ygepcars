"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireActiveStudent } from "@/lib/auth";
import type { ActionState } from "@/app/actions/reservations";

export async function updateMyProfileAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const viewer = await requireActiveStudent();
  const supabase = await createClient();

  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const paymentMethod = String(formData.get("payment_method") ?? "cash");

  if (!firstName || !lastName || !phone) {
    return { error: "Your name and phone number are both required." };
  }
  if (!["zelle", "cash"].includes(paymentMethod)) {
    return { error: "Choose Zelle or cash." };
  }

  // role and status are pinned by a database trigger, so a student editing this
  // form can only ever change their own contact details.
  const { error } = await supabase
    .from("cars_profiles")
    .update({
      first_name: firstName,
      last_name: lastName,
      phone,
      payment_method: paymentMethod,
      address: String(formData.get("address") ?? "").trim(),
      emergency_contact: String(formData.get("emergency_contact") ?? "").trim(),
      license_number: String(formData.get("license_number") ?? "").trim(),
      license_expires_on: String(formData.get("license_expires_on") ?? "") || null,
    })
    .eq("id", viewer.userId);

  if (error) return { error: error.message };

  revalidatePath("/account", "layout");
  return { success: "Saved." };
}
