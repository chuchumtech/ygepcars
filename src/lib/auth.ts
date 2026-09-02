import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export type Viewer = {
  userId: string;
  email: string;
  profile: Profile | null;
};

/** The signed-in person and their car-system profile, or null if signed out. */
export async function getViewer(): Promise<Viewer | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("cars_profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return {
    userId: user.id,
    email: user.email ?? "",
    profile: (profile as Profile | null) ?? null,
  };
}

/**
 * For student pages. Sends people who are not signed in to the login page, and
 * people whose account is not active yet to the holding page that explains why.
 */
export async function requireActiveStudent(): Promise<Viewer & { profile: Profile }> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.profile) redirect("/account/pending");
  if (viewer.profile.status !== "active") redirect("/account/pending");
  return viewer as Viewer & { profile: Profile };
}

/** For admin pages. */
export async function requireAdmin(): Promise<Viewer & { profile: Profile }> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/admin");
  if (!viewer.profile || viewer.profile.role !== "admin" || viewer.profile.status !== "active") {
    redirect("/?error=admin-only");
  }
  return viewer as Viewer & { profile: Profile };
}
