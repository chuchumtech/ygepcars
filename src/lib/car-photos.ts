import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Where the car photos live. Created by migration 0012. */
export const CAR_PHOTO_BUCKET = "cars-photos";

/** What a browser can actually render, so nobody uploads a HEIC and wonders. */
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

const MAX_BYTES = 5 * 1024 * 1024;

const PUBLIC_MARKER = `/storage/v1/object/public/${CAR_PHOTO_BUCKET}/`;

/** The object path inside our bucket, or null for anything we did not store. */
export function pathInBucket(url: string): string | null {
  const at = url.indexOf(PUBLIC_MARKER);
  if (at === -1) return null;
  return decodeURIComponent(url.slice(at + PUBLIC_MARKER.length));
}

/**
 * Puts a photo in the bucket and hands back its public URL.
 *
 * Uses the service-role client on purpose: the bucket has no write policy, so
 * the only way in is through here, and the only way here is through an action
 * that has already called `requireAdmin()`.
 *
 * The name carries a timestamp rather than overwriting a fixed one, because a
 * replaced photo that keeps its URL stays in every CDN and browser cache that
 * already has it.
 */
export async function uploadCarPhoto(
  admin: SupabaseClient,
  vehicleId: string,
  file: File,
): Promise<{ url: string } | { error: string }> {
  if (!ALLOWED.has(file.type)) {
    return {
      error:
        "That file is not an image a browser can show. Use a JPEG, PNG or WebP — on an iPhone, choosing the photo from the library gives you a JPEG.",
    };
  }
  if (file.size > MAX_BYTES) {
    return { error: "That photo is over 5 MB. Shrink it a little and try again." };
  }

  const path = `vehicles/${vehicleId}/${Date.now()}.${EXTENSION[file.type]}`;

  const { error } = await admin.storage
    .from(CAR_PHOTO_BUCKET)
    .upload(path, file, { contentType: file.type, cacheControl: "31536000" });

  if (error) return { error: `The photo would not upload: ${error.message}` };

  const { data } = admin.storage.from(CAR_PHOTO_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl };
}

/**
 * Removes a photo we stored. Anything else -- a path under /public from before
 * the bucket existed, or a link to somewhere else -- is left alone.
 */
export async function deleteCarPhoto(admin: SupabaseClient, url: string): Promise<void> {
  const path = pathInBucket(url);
  if (!path) return;
  await admin.storage.from(CAR_PHOTO_BUCKET).remove([path]);
}
