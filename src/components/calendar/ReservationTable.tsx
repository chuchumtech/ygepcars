"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/ui";
import { describeDuration, formatDateTime, hoursBetween } from "@/lib/dates";
import { formatMoney } from "@/lib/pricing";
import { carColor } from "@/lib/calendar";
import { ReservationDialog } from "./ReservationDialog";
import type { AdminReservation } from "./types";
import type { Destination, Vehicle } from "@/lib/types";

/**
 * Shared list view. Every row opens the same dialog the calendar uses, so the
 * office edits a reservation the same way wherever they find it.
 */
export function ReservationTable({
  reservations,
  vehicles,
  destinations,
  emptyMessage = "Nothing here.",
  showStudent = true,
}: {
  reservations: AdminReservation[];
  vehicles: Vehicle[];
  destinations: Destination[];
  emptyMessage?: string;
  showStudent?: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const order = new Map(vehicles.map((vehicle, index) => [vehicle.id, index]));
  const selected = reservations.find((r) => r.id === selectedId) ?? null;

  if (reservations.length === 0) {
    return <p className="card-pad text-sm text-muted">{emptyMessage}</p>;
  }

  return (
    <>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[46rem]">
          <thead className="border-b border-[var(--color-line)] bg-navy-50">
            <tr>
              <th className="th">When</th>
              {showStudent ? <th className="th">Student</th> : null}
              <th className="th">Car</th>
              <th className="th">Destination</th>
              <th className="th">Status</th>
              <th className="th text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-line)]">
            {reservations.map((reservation) => (
              <tr
                key={reservation.id}
                onClick={() => setSelectedId(reservation.id)}
                className="cursor-pointer transition hover:bg-navy-50"
              >
                <td className="td">
                  <p className="font-medium text-navy-800">
                    {formatDateTime(reservation.starts_at)}
                  </p>
                  <p className="text-xs text-muted">
                    {describeDuration(
                      hoursBetween(reservation.starts_at, reservation.ends_at),
                    )}{" "}
                    · {reservation.reference}
                  </p>
                </td>

                {showStudent ? (
                  <td className="td">
                    <p className="font-medium text-navy-800">
                      {reservation.student?.full_name ?? "--"}
                    </p>
                    <p className="text-xs text-muted">{reservation.student?.phone}</p>
                  </td>
                ) : null}

                <td className="td">
                  <span className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                        carColor(order.get(reservation.vehicle_id) ?? 0).dot
                      }`}
                      aria-hidden
                    />
                    {reservation.vehicle?.name ?? "--"}
                  </span>
                </td>

                <td className="td max-w-56 truncate text-muted">
                  {reservation.destination_label || "--"}
                </td>

                <td className="td">
                  <StatusBadge status={reservation.status} />
                </td>

                <td className="td text-right font-semibold tabular-nums">
                  {formatMoney(reservation.total_cents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ReservationDialog
        reservation={selected}
        vehicles={vehicles}
        destinations={destinations}
        onClose={() => setSelectedId(null)}
      />
    </>
  );
}
