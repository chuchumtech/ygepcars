"use client";

import { useActionState, useState } from "react";
import { joinWaitlistAction } from "@/app/actions/waitlist";
import type { ActionResult } from "@/app/actions/shared";
import { Modal } from "@/components/Modal";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert, Field } from "@/components/ui";
import { formatRange } from "@/lib/dates";
import type { Destination, Vehicle } from "@/lib/types";

/**
 * Shown against a car that is already taken. The count tells the student how
 * much competition there is for the window without naming anybody.
 */
export function WaitlistButton({
  vehicle,
  destinations,
  window: win,
  startsAtIso,
  endsAtIso,
  waitingCount,
}: {
  vehicle: Vehicle;
  destinations: Destination[];
  window: { startDate: string; startTime: string; endDate: string; endTime: string };
  startsAtIso: string;
  endsAtIso: string;
  waitingCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionResult, FormData>(joinWaitlistAction, {});

  return (
    <>
      <button type="button" className="btn-secondary w-full sm:w-auto" onClick={() => setOpen(true)}>
        Join the waitlist
      </button>

      {waitingCount > 0 ? (
        <p className="mt-1.5 text-xs text-ink-soft">
          {waitingCount} {waitingCount === 1 ? "student is" : "students are"} already
          waiting on this window.
        </p>
      ) : null}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        width="md"
        title="Join the waitlist"
        subtitle={`${vehicle.name} · ${formatRange(startsAtIso, endsAtIso)}`}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Never mind
            </button>
            <SubmitButton form="join-waitlist" pendingLabel="Adding you...">
              Add me to the waitlist
            </SubmitButton>
          </>
        }
      >
        <form id="join-waitlist" action={action} className="space-y-4">
          <input type="hidden" name="start_date" value={win.startDate} />
          <input type="hidden" name="start_time" value={win.startTime} />
          <input type="hidden" name="end_date" value={win.endDate} />
          <input type="hidden" name="end_time" value={win.endTime} />

          {state.error ? <Alert tone="error">{state.error}</Alert> : null}

          <Alert tone="info">
            This is not a booking. If the car frees up, the office decides who
            gets it and will reach out to you.
            {waitingCount > 0 ? (
              <>
                {" "}
                <strong>
                  {waitingCount} {waitingCount === 1 ? "student is" : "students are"}
                </strong>{" "}
                already waiting on this window.
              </>
            ) : null}
          </Alert>

          <Field label="Which car?">
            <select className="input" name="vehicle_id" defaultValue={vehicle.id}>
              <option value={vehicle.id}>{vehicle.name}</option>
              <option value="">Whichever frees up first</option>
            </select>
          </Field>

          <Field label="Where are you heading?">
            <select className="input" name="destination_id" defaultValue={destinations[0]?.id ?? ""}>
              {destinations.map((destination) => (
                <option key={destination.id} value={destination.id}>
                  {destination.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Reason for the trip">
            <input className="input" name="purpose" maxLength={160} required />
          </Field>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="flexible"
              defaultChecked
              className="mt-0.5 h-4 w-4 accent-slate-500"
            />
            <span>
              Nearby times would also work
              <span className="block text-xs text-ink-soft">
                Gives the office room to fit you in somewhere close by.
              </span>
            </span>
          </label>

          <Field label="Anything else? (optional)">
            <textarea className="input min-h-20 resize-y" name="student_notes" rows={2} maxLength={600} />
          </Field>
        </form>
      </Modal>
    </>
  );
}
