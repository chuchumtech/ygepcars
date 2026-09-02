import "server-only";
import { revalidatePath } from "next/cache";

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
