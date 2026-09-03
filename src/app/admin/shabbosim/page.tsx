import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { ShabbosimManager } from "./ShabbosimManager";
import { loadHebrewMonth, upcomingShabbosim } from "@/lib/hebrew";

export const metadata: Metadata = { title: "Shabbosim" };
export const dynamic = "force-dynamic";

const WEEKS_AHEAD = 40;

export type ShabbosRow = {
  date: string;
  hebrew: string;
  parsha: string;
  holiday: string;
  offLabel: string | null;
  note: string;
  includesFriday: boolean;
  includesSunday: boolean;
};

export default async function ShabbosimPage() {
  const supabase = await createClient();

  // A month back so a Shabbos just gone is still visible and correctable.
  const from = new Date();
  from.setDate(from.getDate() - 28);

  const dates = upcomingShabbosim(from, WEEKS_AHEAD);
  const first = dates[0];
  const last = dates[dates.length - 1];

  const [{ data: marked }, notes] = await Promise.all([
    supabase
      .from("cars_off_shabbosim")
      .select("shabbos_on, label, note, includes_friday, includes_sunday")
      .gte("shabbos_on", first)
      .lte("shabbos_on", last),
    loadHebrewMonth(new Date(`${first}T12:00:00`), new Date(`${last}T12:00:00`)),
  ]);

  type Marked = {
    shabbos_on: string;
    label: string;
    note: string;
    includes_friday: boolean;
    includes_sunday: boolean;
  };

  const off = new Map(((marked ?? []) as Marked[]).map((r) => [r.shabbos_on, r]));

  const rows: ShabbosRow[] = dates.map((date) => {
    const note = notes.get(date);
    const entry = off.get(date);
    return {
      date,
      hebrew: note?.hebrew ?? "",
      parsha: note?.parsha ?? "",
      holiday: note?.holiday ?? "",
      offLabel: entry ? entry.label || "Off" : null,
      note: entry?.note ?? "",
      includesFriday: entry?.includes_friday ?? false,
      includesSunday: entry?.includes_sunday ?? false,
    };
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Shabbosim"
        description="Mark the Shabbosim the yeshiva is off, and say whether each one runs into the Friday or the Sunday. It is a label only — the parsha still shows, students still see the days on the calendar, and they can still request a car, which is usually exactly what happens on an off Shabbos."
      />
      <ShabbosimManager rows={rows} />
    </div>
  );
}
