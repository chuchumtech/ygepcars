"use client";

import { useActionState, useMemo, useState } from "react";
import {
  updateMyReservationAction,
  type ActionState,
} from "@/app/actions/reservations";
import { Modal } from "@/components/Modal";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert, Field } from "@/components/ui";
import { halfHourOptions, instantToLocalParts } from "@/lib/dates";
import { formatMoney } from "@/lib/pricing";
import type { Destination, Reservation } from "@/lib/types";

/**
 * Lets a student fix a request before the office has looked at it. Once it is
 * approved the times are a commitment to a car, so editing stops there and the
 * student is pointed at the office instead.
 */
export function EditReservationButton({
  reservation,
  destinations,
}: {
  reservation: Reservation;
  destinations: Destination[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionState, FormData>(
    updateMyReservationAction,
    {},
  );
  const times = useMemo(() => halfHourOptions(), []);

  const start = instantToLocalParts(reservation.starts_at);
  const end = instantToLocalParts(reservation.ends_at);

  return (
    <>
      <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(true)}>
        Change this request
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        width="md"
        title="Change your request"
        subtitle="The office has not decided on this one yet, so you can still adjust it."
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Close
            </button>
            <SubmitButton form={`edit-${reservation.id}`} pendingLabel="Saving...">
              Save changes
            </SubmitButton>
          </>
        }
      >
        <form id={`edit-${reservation.id}`} action={action} className="space-y-4">
          <input type="hidden" name="reservation_id" value={reservation.id} />

          {state.error ? <Alert tone="error">{state.error}</Alert> : null}
          {state.success ? <Alert tone="success">{state.success}</Alert> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Pick up">
              <div className="flex gap-2">
                <input
                  type="date"
                  className="input min-w-0 px-3"
                  name="start_date"
                  defaultValue={start.date}
                  required
                />
                <select
                  className="input w-[7.25rem] shrink-0 px-3"
                  name="start_time"
                  defaultValue={start.time}
                >
                  {times.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </Field>

            <Field label="Return">
              <div className="flex gap-2">
                <input
                  type="date"
                  className="input min-w-0 px-3"
                  name="end_date"
                  defaultValue={end.date}
                  required
                />
                <select
                  className="input w-[7.25rem] shrink-0 px-3"
                  name="end_time"
                  defaultValue={end.time}
                >
                  {times.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </Field>
          </div>

          <Field label="Where are you heading?">
            <select
              className="input"
              name="destination_id"
              defaultValue={reservation.destination_id ?? destinations[0]?.id ?? ""}
              required
            >
              {destinations.map((destination) => (
                <option key={destination.id} value={destination.id}>
                  {destination.name} ({formatMoney(destination.toll_cents)} tolls)
                </option>
              ))}
            </select>
          </Field>

          <Field label="Exact destination (optional)">
            <input className="input" name="destination_note" maxLength={120} />
          </Field>

          <Field label="Reason for the trip">
            <input
              className="input"
              name="purpose"
              defaultValue={reservation.purpose}
              maxLength={160}
              required
            />
          </Field>

          <Field label="Anything else for the office?">
            <textarea
              className="input min-h-20 resize-y"
              name="student_notes"
              rows={2}
              defaultValue={reservation.student_notes}
              maxLength={600}
            />
          </Field>

          <p className="text-xs text-ink-soft">
            The total is worked out again from your new times and destination, so it
            may change.
          </p>
        </form>
      </Modal>
    </>
  );
}
