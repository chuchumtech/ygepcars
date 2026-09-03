"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { text } from "@/app/actions/shared";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

export async function updateOffShabbosLabelAction(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();

  const date = text(formData, "shabbos_on");
  if (!DATE_RE.test(date)) return;

  await supabase
    .from("cars_off_shabbosim")
    .update({ label: text(formData, "label") || "Off", note: text(formData, "note") })
    .eq("shabbos_on", date);

  refreshEverywhereItShows();
}
