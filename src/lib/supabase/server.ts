import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { supabaseAnonKey, supabaseServiceKey, supabaseUrl } from "@/lib/env";

/**
 * Request-scoped client that carries the signed-in user's session, so every
 * query runs under row level security as that user.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The middleware refreshes the session instead, so this is safe.
        }
      },
    },
  });
}

/**
 * Service-role client. Bypasses row level security entirely, so it is only for
 * things the office genuinely cannot do as itself: creating the auth user and
 * profile row for a brand new sign-up, and reading auth metadata.
 *
 * This is a plain client rather than the cookie-aware one: it must never pick
 * up a visitor's session, and `auth.admin` only works when the service key is
 * the credential on the request.
 *
 * Never import this into a Client Component.
 */
export function createAdminClient() {
  return createSupabaseClient(supabaseUrl(), supabaseServiceKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
