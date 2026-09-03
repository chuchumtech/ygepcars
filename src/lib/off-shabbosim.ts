import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { OffShabbosim } from "@/components/OffShabbosimProvider";

/** One row as the office stores it. */
type Row = {
  shabbos_on: string;
  label: string;
  includes_friday: boolean;
  includes_sunday: boolean;
};

/** The day before a YYYY-MM-DD, in plain date terms. */
function shift(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * The Shabbosim the yeshiva is off, spread across whichever days each one
 * covers, so a calendar can look up any single date and get an answer.
 *
 * Only ones from a month ago onward, since nobody books backwards.
 */
export async function loadOffShabbosim(): Promise<OffShabbosim> {
  try {
    const supabase = await createClient();
    const from = new Date();
    from.setMonth(from.getMonth() - 1);

    const { data } = await supabase
      .from("cars_off_shabbosim")
      .select("shabbos_on, label, includes_friday, includes_sunday")
      .gte("shabbos_on", from.toISOString().slice(0, 10))
      .order("shabbos_on");

    const map: OffShabbosim = {};
    for (const row of (data ?? []) as Row[]) {
      const label = row.label || "Off";
      map[row.shabbos_on] = { label, part: "shabbos", shabbos: row.shabbos_on };
      if (row.includes_friday) {
        map[shift(row.shabbos_on, -1)] = { label, part: "friday", shabbos: row.shabbos_on };
      }
      if (row.includes_sunday) {
        map[shift(row.shabbos_on, 1)] = { label, part: "sunday", shabbos: row.shabbos_on };
      }
    }
    return map;
  } catch {
    return {};
  }
}
