"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export type AuthFormState = { error?: string; notice?: string };

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** Only allow relative paths, so ?next= can't be used as an open redirect. */
function safeNext(raw: string, fallback: string): string {
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : fallback;
}

export async function signUpAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const fullName = readString(formData, "full_name");
  const email = readString(formData, "email").toLowerCase();
  const phone = readString(formData, "phone");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");

  if (!fullName || !email || !phone || !password) {
    return { error: "Please fill in every field." };
  }
  if (password.length < 8) {
    return { error: "Choose a password of at least 8 characters." };
  }
  if (password !== confirm) {
    return { error: "The two passwords do not match." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, phone } },
  });

  if (error) {
    return { error: error.message };
  }
  if (!data.user) {
    return { error: "Could not create the account. Please try again." };
  }

  // The profile row is what makes someone a member of the car system, and it
  // starts life pending so the office decides who can actually book.
  const admin = createAdminClient();
  const { error: profileError } = await admin.from("cars_profiles").upsert(
    {
      id: data.user.id,
      full_name: fullName,
      email,
      phone,
      role: "student",
      status: "pending",
    },
    { onConflict: "id" },
  );

  if (profileError) {
    return { error: `Account created, but the profile failed to save: ${profileError.message}` };
  }

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
