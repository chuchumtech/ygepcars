"use client";

import { useActionState } from "react";
import { addPaymentAction } from "@/app/actions/billing";
import type { ActionResult } from "@/app/actions/shared";
import { DateField } from "@/components/DateField";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert, Field } from "@/components/ui";
import { todayLocal } from "@/lib/dates";
import { formatMoney } from "@/lib/pricing";
import { PAYMENT_METHODS, type PaymentPreference } from "@/lib/types";
import { useState } from "react";

export type PayableReservation = {
  id: string;
  reference: string;
  label: string;
  outstandingCents: number;
};

/**
 * How much, when, and how -- which is what the office actually knows when
 * somebody hands them money or a Zelle lands.
 *
 * Attaching it to a rental is optional: money often arrives for "whatever I
 * owe" rather than for one trip, and a payment with no rental against it still
 * settles the account. Attaching it does one extra thing, which is mark that
 * reservation paid so its car stays out of the pool.
 */
export function PaymentForm({
  studentId,
  prefer,
  reservations,
  suggestCents,
  lockedReservationId,
  onDone,
}: {
  studentId: string;
  /** How this student normally pays, so the method starts on the right one. */
  prefer?: PaymentPreference;
  reservations: PayableReservation[];
  /** What to put in the amount box to start with, usually what is owed. */
  suggestCents?: number;
  /** Set when the form is opened from one reservation: it cannot be changed. */
  lockedReservationId?: string;
  onDone?: () => void;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(addPaymentAction, {});
  const [paidOn, setPaidOn] = useState(todayLocal());

  return (
    <form
      action={async (formData) => {
        await action(formData);
        onDone?.();
      }}
      className="space-y-4"
    >
      <input type="hidden" name="student_id" value={studentId} />
      {lockedReservationId ? (
        <input type="hidden" name="reservation_id" value={lockedReservationId} />
      ) : null}

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="How much" hint="Dollars.">
          <input
            className="input"
            name="amount"
            inputMode="decimal"
            autoFocus
            defaultValue={
              suggestCents && suggestCents > 0 ? (suggestCents / 100).toFixed(2) : ""
            }
            placeholder="45.00"
            required
          />
        </Field>

        <Field label="When it came in">
          <DateField
            id={`paid-on-${studentId}`}
            label="Date received"
            name="paid_on"
            value={paidOn}
            onChange={setPaidOn}
          />
        </Field>

        <Field label="How">
          <select className="input" name="method" defaultValue={prefer ?? "zelle"}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {lockedReservationId ? null : (
        <Field
          label="Against a rental?"
          hint="Optional. Leave it off and it just comes off the balance."
        >
          <select className="input" name="reservation_id" defaultValue="">
            <option value="">Nothing in particular — put it on the account</option>
            {reservations.map((r) => (
              <option key={r.id} value={r.id}>
                {r.reference} · {r.label} · {formatMoney(r.outstandingCents)}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Reference" hint="Check number, Zelle confirmation.">
          <input className="input" name="reference" maxLength={80} />
        </Field>
        <Field label="Note" hint="Only the office sees this.">
          <input className="input" name="note" maxLength={200} />
        </Field>
      </div>

      <SubmitButton className="btn-primary" pendingLabel="Recording...">
        Record payment
      </SubmitButton>
    </form>
  );
}
