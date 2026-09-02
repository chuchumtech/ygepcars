"use client";

import { useActionState, useMemo, useState } from "react";
import { createReservationAction } from "@/app/actions/admin-reservations";
import type { ActionResult } from "@/app/actions/shared";
import { Modal } from "@/components/Modal";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert, Field } from "@/components/ui";
import { halfHourOptions, todayLocal } from "@/lib/dates";
import { formatMoney } from "@/lib/pricing";
import type { Destination, Profile, Vehicle } from "@/lib/types";

/** Lets the office put a reservation in for a student who called or walked in. */
export function NewReservationButton({
  vehicles,
  destinations,
  students,
}: {
  vehicles: Vehicle[];
  destinations: Destination[];
  students: Pick<Profile, "id" | "full_name" | "email" | "status">[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionResult, FormData>(
    createReservationAction,
    {},
  );
  const times = useMemo(() => halfHourOptions(), []);
  const today = todayLocal();

  const bookable = students.filter((student) => student.status === "active");

  return (
    <>
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        Add reservation
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add a reservation"
        subtitle="For a student who asked in person or over the phone."
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
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
            <select className="input" name="user_id" required defaultValue="">
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
            <select className="input" name="vehicle_id" required defaultValue="">
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

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Picks up">
              <div className="flex gap-2">
                <input
                  type="date"
                  className="input"
                  name="start_date"
                  defaultValue={today}
                  required
                />
                <select className="input w-32 shrink-0" name="start_time" defaultValue="09:00">
                  {times.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </Field>

            <Field label="Returns">
              <div className="flex gap-2">
                <input
                  type="date"
                  className="input"
                  name="end_date"
                  defaultValue={today}
                  required
                />
                <select className="input w-32 shrink-0" name="end_time" defaultValue="17:00">
                  {times.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
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

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="approve_now"
              defaultChecked
              className="h-4 w-4 accent-navy-700"
            />
            Approve it right away
          </label>
        </form>
      </Modal>
    </>
  );
}
