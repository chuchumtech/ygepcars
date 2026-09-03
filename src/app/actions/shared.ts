import "server-only";
import { revalidatePath } from "next/cache";
import type { createClient } from "@/lib/supabase/server";

export type ActionResult = { error?: string; success?: string };

export function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function optionalText(formData: FormData, key: string): string | null {
  const value = text(formData, key);
  return value === "" ? null : value;
}

export function integer(formData: FormData, key: string, fallback = 0): number {
  const value = Number(text(formData, key));
  return Number.isFinite(value) ? Math.round(value) : fallback;
}

export function checkbox(formData: FormData, key: string): boolean {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}

/** The office portal cross-references everything, so a write refreshes it all. */
export function revalidateAdmin() {
  revalidatePath("/admin", "layout");
  revalidatePath("/reservations");
  revalidatePath("/", "layout");
}

/** Turns a Postgres error into something an office admin can act on. */
export function friendlyDbError(error: { code?: string; message: string }): string {
  if (error.code === "23P01") {
    return "That would double-book the car — another approved reservation covers part of that window.";
  }
  if (error.code === "23514") {
    return "Those values are out of range. Check the times and amounts.";
  }
  if (error.code === "23503") {
    return "Something this record points at no longer exists. Refresh and try again.";
  }
  return error.message;
}

/** One line in the office's audit trail. Never allowed to fail a write. */
export async function logActivity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actor: { userId: string; name: string },
  entry: {
    entityType: string;
    entityId: string | null;
    action: string;
    detail?: Record<string, unknown>;
  },
) {
  await supabase.from("cars_activity").insert({
    actor_id: actor.userId,
    actor_name: actor.name,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    action: entry.action,
    detail: entry.detail ?? {},
  });
}
