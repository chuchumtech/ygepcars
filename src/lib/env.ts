/**
 * Reading env vars through here (rather than process.env everywhere) means a
 * missing key fails loudly at the point of use with a message that says which
 * variable to set, instead of surfacing as a confusing Supabase 401.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export const supabaseUrl = () => required("NEXT_PUBLIC_SUPABASE_URL");
export const supabaseAnonKey = () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
export const supabaseServiceKey = () => required("SUPABASE_SERVICE_ROLE_KEY");

export const siteUrl = () =>
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
