import type { NextConfig } from "next";

/**
 * The car photos live in Supabase Storage rather than in the repo, so
 * next/image has to be told the bucket's host is allowed. The project's own
 * hostname comes from the environment; the `*.supabase.co` pattern is the
 * fallback for a build that cannot read it, and both are narrowed to the
 * public-object path so nothing else on that host can be proxied through the
 * image optimiser.
 */
function supabaseHostname(): string | null {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
  } catch {
    return null;
  }
}

const host = supabaseHostname();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      ...(host ? [{ protocol: "https" as const, hostname: host, pathname: "/storage/v1/object/public/**" }] : []),
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
    ],
  },
  experimental: {
    // A photo straight off a phone is well over the 1 MB default, and the
    // office is uploading one through a server action.
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
