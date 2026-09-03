"use client";

import { useActionState, useMemo, useState } from "react";
import { createReservationAction } from "@/app/actions/admin-reservations";
import type { ActionResult } from "@/app/actions/shared";
import { DateField, DateRangeField } from "@/components/DateField";
import { Modal } from "@/components/Modal";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert, Field } from "@/components/ui";
import { formatDayLong, halfHourOptions, todayLocal } from "@/lib/dates";
import { formatMoney } from "@/lib/pricing";
import type { Destination, Profile, Vehicle } from "@/lib/types";

/** Where the office started from, so the form opens on it. */
export type NewReservationSeed = {
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  /** Set when they clicked a car's column in the day view. */
  vehicleId?: string;
};

export function defaultSeed(): NewReservationSeed {
  const today = todayLocal();
  return { startDate: today, endDate: today, startTime: "09:00", endTime: "17:00" };
}

/** "09:00" plus n hours, clamped so a late-evening click still makes a rental. */
export function addHours(time: string, hours: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = Math.min(h * 60 + m + hours * 60, 23 * 60 + 30);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * The office's own booking form, for a student who asked in person, over the
 * phone, or by walking up to the desk.
 *
 * Controlled rather than self-opening, so the calendar can hand it the day --
 * and in the day view the car -- that was clicked, and the office is typing a
 * name rather than re-entering what they just pointed at.
 */
export function NewReservationDialog({
  open,
  onClose,
  seed,
  vehicles,
  destinations,
  students,
}: {
  open: boolean;
  onClose: () => void;
  seed: NewReservationSeed;
  vehicles: Vehicle[];
  destinations: Destination[];
  students: Pick<Profile, "id" | "full_name" | "email" | "status">[];
}) {
  const [initialStatus, setInitialStatus] = useState("approved");
  const [state, action] = useActionState<ActionResult, FormData>(
    createReservationAction,
    {},
  );
  const times = useMemo(() => halfHourOptions(), []);
  const today = todayLocal();
  const [dates, setDates] = useState({
    startDate: seed.startDate,
    endDate: seed.endDate,
  });
  const [holdUntil, setHoldUntil] = useState("");

  const bookable = students.filter((student) => student.status === "active");

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="lg"
      title="Add a reservation"
      subtitle={`For a student who asked in person or over the phone · ${formatDayLong(seed.startDate)}`}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
          <SubmitButton form="new-reservation" pendingLabel="Saving...">
            Create reservation
          </SubmitButton>
        </>
      }
    >
      <form id="new-reservation" action={action} className="space-y-4">
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}
        {state.success ? <Alert tone="success">{state.success}</Alert> : null}

        <Field
          label="Student"
          hint={
            bookable.length === 0
              ? "No active students yet — approve an account first."
              : undefined
          }
        >
          <select className="input" name="user_id" required defaultValue="" autoFocus>
            <option value="" disabled>
              Choose a student
            </option>
            {bookable.map((student) => (
              <option key={student.id} value={student.id}>
                {student.full_name} — {student.email}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Car">
          <select
            className="input"
            name="vehicle_id"
            required
            defaultValue={seed.vehicleId ?? ""}
          >
            <option value="" disabled>
              Choose a car
            </option>
            {vehicles
              .filter((vehicle) => vehicle.is_active)
              .map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.name} — {formatMoney(vehicle.hourly_rate_cents)}/hr
                </option>
              ))}
          </select>
        </Field>

        <Field label="Dates">
          <DateRangeField
            id="new-reservation-dates"
            startDate={dates.startDate}
            endDate={dates.endDate}
            startName="start_date"
            endName="end_date"
            startLabel="Picks up"
            endLabel="Returns"
            onChange={setDates}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Pick up time">
            <select className="input" name="start_time" defaultValue={seed.startTime}>
              {times.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Return time">
            <select className="input" name="end_time" defaultValue={seed.endTime}>
              {times.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Destination">
            <select className="input" name="destination_id" defaultValue="">
              <option value="">— none —</option>
              {destinations
                .filter((destination) => destination.is_active)
                .map((destination) => (
                  <option key={destination.id} value={destination.id}>
                    {destination.name} ({formatMoney(destination.toll_cents)})
                  </option>
                ))}
            </select>
          </Field>

          <Field label="Toll override" hint="Leave blank to use the preset.">
            <input className="input" name="toll" inputMode="decimal" placeholder="18.00" />
          </Field>
        </div>

        <Field label="Reason for the trip">
          <input className="input" name="purpose" placeholder="Shabbos at home" />
        </Field>

        <Field label="Office notes">
          <textarea className="input min-h-20 resize-y" name="admin_notes" rows={2} />
        </Field>

        <Field
          label="Create it as"
          hint="A hold blocks the car without confirming it or charging anything."
        >
          <select
            className="input"
            name="initial_status"
            defaultValue="approved"
            onChange={(e) => setInitialStatus(e.target.value)}
          >
            <option value="approved">Approved — confirmed booking</option>
            <option value="hold">On hold — car blocked, not confirmed</option>
            <option value="pending">Pending — decide later</option>
          </select>
        </Field>

        {initialStatus === "hold" ? (
          <Field label="Revisit the hold by (optional)">
            <DateField
              id="new-reservation-hold-until"
              label="Revisit the hold by"
              name="hold_expires_at"
              value={holdUntil}
              min={today}
              onChange={setHoldUntil}
            />
          </Field>
        ) : null}
      </form>
    </Modal>
  );
}
