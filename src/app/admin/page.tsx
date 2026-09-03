import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadCalendarData } from "@/lib/admin-queries";
import { CalendarBoard } from "@/components/calendar/CalendarBoard";
import { NewReservationButton } from "./NewReservationButton";
import { StatTile } from "@/components/ui";
import { isCalendarView, viewInstants } from "@/lib/calendar";
import { todayLocal } from "@/lib/dates";
import { formatMoney } from "@/lib/pricing";
import type { StudentBalance } from "@/lib/types";

export const metadata: Metadata = { title: "Calendar" };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function AdminCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const params = await searchParams;
  const view = isCalendarView(params.view) ? params.view : "month";
  const anchor = params.date && DATE_RE.test(params.date) ? params.date : todayLocal();

  const { from, to } = viewInstants(view, anchor);
  const [data, supabase] = await Promise.all([loadCalendarData(from, to), createClient()]);

  const now = new Date();
  const weekOut = new Date(now.getTime() + 7 * 86_400_000);

  const [pendingCount, outNowCount, weekCount, balances, holds] = await Promise.all([
    supabase
      .from("cars_reservations")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("cars_reservations")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved")
      .lte("starts_at", now.toISOString())
      .gte("ends_at", now.toISOString()),
    supabase
      .from("cars_reservations")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved")
      .gte("starts_at", now.toISOString())
      .lte("starts_at", weekOut.toISOString()),
    supabase.from("cars_student_balances").select("balance_cents"),
    supabase
      .from("cars_reservations")
      .select("id, hold_expires_at", { count: "exact" })
      .eq("status", "hold"),
  ]);

  const holdRows = (holds.data ?? []) as { hold_expires_at: string | null }[];
  const lapsedHolds = holdRows.filter(
    (row) => row.hold_expires_at !== null && new Date(row.hold_expires_at) < now,
  ).length;

  const owed = ((balances.data ?? []) as Pick<StudentBalance, "balance_cents">[])
    .filter((row) => row.balance_cents > 0)
    .reduce((sum, row) => sum + row.balance_cents, 0);

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Calendar</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Every reservation, request and blocked-off day for both cars.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/print?from=${anchor}&to=${anchor}`} className="btn-secondary">
            Print run sheet
          </Link>
          <NewReservationButton
            vehicles={data.vehicles}
            destinations={data.destinations}
            students={data.students}
          />
        </div>
      </div>

      <div className="no-print grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile
          label="Waiting on you"
          value={String(pendingCount.count ?? 0)}
          hint="Requests needing a decision"
          tone={pendingCount.count ? "warn" : "default"}
          href="/admin/requests"
        />
        <StatTile
          label="Out right now"
          value={String(outNowCount.count ?? 0)}
          hint={`of ${data.vehicles.filter((v) => v.is_active).length} cars`}
        />
        <StatTile
          label="Next 7 days"
          value={String(weekCount.count ?? 0)}
          hint="Approved pickups coming up"
        />
        <StatTile
          label="On hold"
          value={String(holds.count ?? 0)}
          hint={
            lapsedHolds > 0
              ? `${lapsedHolds} past the date you set`
              : "Blocking a car, not confirmed"
          }
          tone={lapsedHolds > 0 ? "warn" : "default"}
        />
        <StatTile
          label="Outstanding"
          value={formatMoney(owed)}
          hint="Owed across all students"
          tone={owed > 0 ? "bad" : "good"}
          href="/admin/students"
        />
      </div>

      {data.vehicles.length === 0 ? (
        <p className="card-pad text-sm">
          No cars are set up yet.{" "}
          <Link href="/admin/cars" className="link">
            Add the first one
          </Link>{" "}
          so students can start booking.
        </p>
      ) : null}

      <CalendarBoard view={view} anchor={anchor} data={data} />
    </div>
  );
}
