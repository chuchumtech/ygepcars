"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { text } from "@/app/actions/shared";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** An unticked checkbox is absent from the form data rather than false. */
function checked(formData: FormData, name: string): boolean {
  return formData.get(name) !== null;
}

function refreshEverywhereItShows() {
  revalidatePath("/admin", "layout");
  revalidatePath("/", "layout");
}

/**
 * Marks a Shabbos as one the yeshiva is off, or unmarks it.
 *
 * The Saturday itself is the primary key, so a double click cannot create two
 * rows; upsert makes the toggle idempotent.
 */
export async function toggleOffShabbosAction(formData: FormData) {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const date = text(formData, "shabbos_on");
  if (!DATE_RE.test(date)) return;

  if (text(formData, "next_state") === "off") {
    await supabase.from("cars_off_shabbosim").upsert(
      {
        shabbos_on: date,
        label: text(formData, "label") || "Off",
        created_by: admin.userId,
      },
      { onConflict: "shabbos_on" },
    );
  } else {
    await supabase.from("cars_off_shabbosim").delete().eq("shabbos_on", date);
  }

  refreshEverywhereItShows();
}

/**
 * Renames an off Shabbos and says which days it covers.
 *
 * Some off Shabbosim start Friday, some run through Sunday, some are the
 * Shabbos alone, so the office ticks whichever apply rather than the app
 * guessing. Unticked boxes are absent from the form data, hence `checked`.
 */
export async function updateOffShabbosLabelAction(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();

  const date = text(formData, "shabbos_on");
  if (!DATE_RE.test(date)) return;

  await supabase
    .from("cars_off_shabbosim")
    .update({
      label: text(formData, "label") || "Off",
      note: text(formData, "note"),
      includes_friday: checked(formData, "includes_friday"),
      includes_sunday: checked(formData, "includes_sunday"),
    })
    .eq("shabbos_on", date);

  refreshEverywhereItShows();
}
