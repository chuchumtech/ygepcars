import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { RESERVATION_SELECT } from "@/lib/admin-queries";
import { PrintControls } from "./PrintControls";
import {
  dateRangeList,
  shiftDays,
  splitIntoDaySegments,
} from "@/lib/calendar";
import {
  describeDuration,
  formatDayLong,
  formatTime,
  hoursBetween,
  localToInstant,
  todayLocal,
} from "@/lib/dates";
import { formatMoney } from "@/lib/pricing";
import type { AdminReservation } from "@/components/calendar/types";
import type { Blackout, Vehicle } from "@/lib/types";

export const metadata: Metadata = { title: "Print run sheet" };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type BlackoutRow = Blackout & { vehicle: Pick<Vehicle, "id" | "name"> | null };

export default async function PrintPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; status?: string }>;
}) {
  const params = await searchParams;
  const from = params.from && DATE_RE.test(params.from) ? params.from : todayLocal();
  const to = params.to && DATE_RE.test(params.to) && params.to >= from ? params.to : from;
  const includeAll = params.status === "all";

  const rangeStart = localToInstant(from, "00:00");
  const rangeEnd = localToInstant(shiftDays(to, 1), "00:00");

  const supabase = await createClient();

  const [reservations, blackouts, vehicles, settings] = await Promise.all([
    supabase
      .from("cars_reservations")
      .select(RESERVATION_SELECT)
      .lt("starts_at", rangeEnd.toISOString())
      .gt("ends_at", rangeStart.toISOString())
      .order("starts_at"),
    supabase
      .from("cars_blackouts")
      .select("*, vehicle:cars_vehicles(id, name)")
      .lt("starts_at", rangeEnd.toISOString())
      .gt("ends_at", rangeStart.toISOString()),
    supabase.from("cars_vehicles").select("*").order("sort_order"),
    supabase.from("cars_settings").select("key, value").eq("key", "org_name").maybeSingle(),
  ]);

  const all = (reservations.data ?? []) as AdminReservation[];
  const shown = includeAll
    ? all
    : all.filter((r) => ["approved", "completed"].includes(r.status));

  const blackoutRows = (blackouts.data ?? []) as BlackoutRow[];
  const fleet = (vehicles.data ?? []) as Vehicle[];
  const orgName =
    typeof settings.data?.value === "string"
      ? settings.data.value
      : "Yeshiva Gedolah of Elkins Park";

  // One bucket per day so the sheet reads chronologically, with a multi-day
  // rental appearing on each day it is actually out.
  const days = dateRangeList(from, to);
  const byDay = new Map<string, AdminReservation[]>();
  for (const day of days) byDay.set(day, []);
  for (const reservation of shown) {
    for (const segment of splitIntoDaySegments(
      reservation.starts_at,
      reservation.ends_at,
      from,
      to,
    )) {
      byDay.get(segment.date)?.push(reservation);
    }
  }

  const totalCents = shown.reduce((sum, r) => sum + r.total_cents, 0);

  return (
    <div className="mx-auto max-w-4xl">
      <PrintControls from={from} to={to} status={includeAll ? "all" : "confirmed"} />

      <article className="print-sheet">
        <header className="mb-6 flex items-start justify-between gap-6 border-b-[3px] border-gold-500 pb-4">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="" width={54} height={54} className="h-14 w-auto" />
            <div>
              <h1 className="text-lg font-bold text-slate-500">{orgName}</h1>
              <p className="text-sm text-muted">Car run sheet</p>
            </div>
          </div>
          <div className="text-right text-sm">
            <p className="font-semibold text-navy-800">
              {from === to
                ? formatDayLong(`${from}T12:00:00Z`)
                : `${formatDayLong(`${from}T12:00:00Z`)} — ${formatDayLong(`${to}T12:00:00Z`)}`}
            </p>
            <p className="text-muted">
              {shown.length} {shown.length === 1 ? "rental" : "rentals"} ·{" "}
              {formatMoney(totalCents)}
            </p>
          </div>
        </header>

        {days.map((day) => {
          const dayRows = (byDay.get(day) ?? []).sort(
            (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
          );
          const dayBlackouts = blackoutRows.filter((blackout) =>
            splitIntoDaySegments(blackout.starts_at, blackout.ends_at, day, day).length > 0,
          );

          return (
            <section key={day} className="mb-6 break-inside-avoid">
              <h2 className="mb-2 border-b border-[var(--color-line)] pb-1 text-sm font-bold text-slate-500">
                {formatDayLong(`${day}T12:00:00Z`)}
              </h2>

              {dayRows.length === 0 && dayBlackouts.length === 0 ? (
                <p className="py-2 text-sm text-muted">Nothing out.</p>
              ) : null}

              {dayRows.length > 0 ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                      <th className="py-1.5 pr-3 font-semibold">Out</th>
                      <th className="py-1.5 pr-3 font-semibold">Back</th>
                      <th className="py-1.5 pr-3 font-semibold">Student</th>
                      <th className="py-1.5 pr-3 font-semibold">Car</th>
                      <th className="py-1.5 pr-3 font-semibold">Destination</th>
                      <th className="py-1.5 pr-3 text-right font-semibold">Total</th>
                      <th className="w-16 py-1.5 font-semibold">Keys</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dayRows.map((reservation) => (
                      <tr
                        key={`${day}-${reservation.id}`}
                        className="border-t border-[var(--color-line)] align-top"
                      >
                        <td className="py-2 pr-3 tabular-nums">
                          {formatTime(reservation.starts_at)}
                        </td>
                        <td className="py-2 pr-3 tabular-nums">
                          {formatTime(reservation.ends_at)}
                        </td>
                        <td className="py-2 pr-3">
                          <span className="font-medium text-navy-800">
                            {reservation.student?.full_name ?? "--"}
                          </span>
                          {reservation.student?.phone ? (
                            <span className="block text-xs text-muted">
                              {reservation.student.phone}
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2 pr-3">{reservation.vehicle?.name ?? "--"}</td>
                        <td className="py-2 pr-3">
                          {reservation.destination_label || "--"}
                          <span className="block text-xs text-muted">
                            {describeDuration(
                              hoursBetween(reservation.starts_at, reservation.ends_at),
                            )}
                            {reservation.status !== "approved"
                              ? ` · ${reservation.status}`
                              : ""}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {formatMoney(reservation.total_cents)}
                        </td>
                        <td className="py-2">
                          <span className="block h-5 border-b border-navy-300" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}

              {dayBlackouts.length > 0 ? (
                <ul className="mt-2 text-xs text-muted">
                  {dayBlackouts.map((blackout) => (
                    <li key={`${day}-${blackout.id}`}>
                      {blackout.vehicle?.name ?? "Car"} out of service
                      {blackout.reason ? ` — ${blackout.reason}` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          );
        })}

        <footer className="mt-8 border-t border-[var(--color-line)] pt-3 text-xs text-muted">
          <p>
            Fleet: {fleet.map((vehicle) => vehicle.name).join(" · ") || "no cars set up"}
          </p>
          <p className="mt-0.5">
            Printed from the car rental office portal.{" "}
            {includeAll ? "Includes pending and cancelled." : "Confirmed rentals only."}
          </p>
        </footer>
      </article>

      <p className="no-print mt-6 text-sm text-muted">
        <Link href="/admin" className="link">
          Back to the calendar
        </Link>
      </p>
    </div>
  );
}
