import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * The Shabbosim the yeshiva is off, as a lookup the picker can use directly.
 * Only ones from a month ago onward, since nobody books backwards.
 */
export async function loadOffShabbosim(): Promise<Record<string, string>> {
  try {
    const supabase = await createClient();
    const from = new Date();
    from.setMonth(from.getMonth() - 1);

    const { data } = await supabase
      .from("cars_off_shabbosim")
      .select("shabbos_on, label")
      .gte("shabbos_on", from.toISOString().slice(0, 10))
      .order("shabbos_on");

    const map: Record<string, string> = {};
    for (const row of (data ?? []) as { shabbos_on: string; label: string }[]) {
      map[row.shabbos_on] = row.label || "Off";
    }
    return map;
  } catch {
    return {};
  }
}
