"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { notifyNewAccount } from "@/lib/email/notify";

export type AuthFormState = { error?: string; notice?: string };

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Supabase words this differently depending on the endpoint and version, so
 * match on the code first and fall back to the text.
 */
function isAlreadyRegistered(error: { message: string; code?: string; status?: number }): boolean {
  if (error.code === "email_exists" || error.code === "user_already_exists") return true;
  const message = error.message.toLowerCase();
  return message.includes("already been registered") || message.includes("already registered");
}

/** Only allow relative paths, so ?next= can't be used as an open redirect. */
function safeNext(raw: string, fallback: string): string {
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : fallback;
}

export async function signUpAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const firstName = readString(formData, "first_name");
  const lastName = readString(formData, "last_name");
  const email = readString(formData, "email").toLowerCase();
  const phone = readString(formData, "phone");
  const paymentMethod = readString(formData, "payment_method");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");
  const fullName = `${firstName} ${lastName}`.trim();

  if (!firstName || !lastName || !email || !phone || !password) {
    return { error: "Please fill in every field." };
  }
  if (!["zelle", "cash"].includes(paymentMethod)) {
    return { error: "Choose how you plan to pay — Zelle or cash." };
  }
  if (password.length < 8) {
    return { error: "Choose a password of at least 8 characters." };
  }
  if (password !== confirm) {
    return { error: "The two passwords do not match." };
  }

  // The account is created through the admin API rather than a public sign-up.
  //
  // This Supabase project is shared with the yeshiva's other site, which has
  // email confirmation switched on. A public sign-up there does two things we
  // cannot live with: it burns the project's shared confirmation-email quota,
  // and -- when the address already belongs to one of that site's users -- it
  // answers 200 with a decoy user carrying a made-up id, to avoid telling a
  // stranger whether an address is registered. Writing that id to a profile is
  // what produced "violates foreign key constraint cars_profiles_id_fkey".
  //
  // Creating the user here instead gives a real id, a straight answer when the
  // address is taken, and no email. Nothing is lost by skipping confirmation:
  // the office approves every account by hand before it can book anything, and
  // the student collects a physical key.
  const admin = createAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, first_name: firstName, last_name: lastName, phone },
  });

  if (createError) {
    if (isAlreadyRegistered(createError)) {
      return {
        error:
          "That email address already has an account here. Sign in with it instead " +
          "-- if you do not know the password, the office can reset it for you.",
      };
    }
    return { error: createError.message };
  }
  if (!created.user) {
    return { error: "Could not create the account. Please try again." };
  }

  // The profile row is what makes someone a member of the car system, and it
  // starts life pending so the office decides who can actually book.
  const { error: profileError } = await admin.from("cars_profiles").upsert(
    {
      id: created.user.id,
      first_name: firstName,
      last_name: lastName,
      full_name: fullName,
      email,
      phone,
      payment_method: paymentMethod,
      role: "student",
      status: "pending",
    },
    { onConflict: "id" },
  );

  if (profileError) {
    return { error: `Account created, but the profile failed to save: ${profileError.message}` };
  }

  // Sign them in so the "waiting on the office" page has somebody to greet.
  const supabase = await createClient();
  await supabase.auth.signInWithPassword({ email, password });

  await notifyNewAccount({ userId: created.user.id, name: fullName, email, phone });

  redirect("/pending");
}

export async function signInAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = readString(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(readString(formData, "next"), "/");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "That email and password do not match an account." };
  }

  // Someone who signed up through the other app in this Supabase project has no
  // car-system profile yet; give them one so the office can approve them.
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("cars_profiles")
    .select("id, role, status")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile) {
    await admin.from("cars_profiles").insert({
      id: data.user.id,
      first_name: (data.user.user_metadata?.first_name as string) ?? "",
      last_name: (data.user.user_metadata?.last_name as string) ?? "",
      full_name: (data.user.user_metadata?.full_name as string) ?? "",
      email: data.user.email ?? email,
      phone: (data.user.user_metadata?.phone as string) ?? "",
      role: "student",
      status: "pending",
    });
    redirect("/pending");
  }

  revalidatePath("/", "layout");
  if (profile.status !== "active") redirect("/pending");
  redirect(profile.role === "admin" && next === "/" ? "/admin" : next);
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
