"use client";

import { useActionState } from "react";
import { saveSettingsAction } from "@/app/actions/admin-fleet";
import type { ActionResult } from "@/app/actions/shared";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert, Field } from "@/components/ui";
import { ORG_TIMEZONE } from "@/lib/dates";

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function num(value: unknown, fallback: number): string {
  return typeof value === "number" ? String(value) : String(fallback);
}

export function SettingsForm({ values }: { values: Record<string, unknown> }) {
  const [state, action] = useActionState<ActionResult, FormData>(saveSettingsAction, {});

  return (
    <form action={action} className="card-pad space-y-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      <section className="rounded-lg border border-gold-200 bg-gold-50/60 p-4">
        <h2 className="text-sm font-bold text-ink">Booking rules</h2>
        <p className="mt-0.5 text-xs text-ink-soft">
          These apply to students booking themselves. The office is not bound by
          them when adding a reservation by hand.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Minimum rental" hint="Hours. Shortest a student can book.">
            <input
              className="input"
              name="min_rental_hours"
              inputMode="numeric"
              defaultValue={num(values.min_rental_hours, 4)}
            />
          </Field>

          <Field label="Notice required" hint="Hours ahead of pickup.">
            <input
              className="input"
              name="min_advance_hours"
              inputMode="numeric"
              defaultValue={num(values.min_advance_hours, 2)}
            />
          </Field>

          <Field label="Car held unpaid for" hint="Hours from the request.">
            <input
              className="input"
              name="payment_hold_hours"
              inputMode="numeric"
              defaultValue={num(values.payment_hold_hours, 12)}
            />
          </Field>
        </div>

        <p className="mt-3 text-xs text-ink-soft">
          After the hold window runs out on an unpaid reservation, the car goes
          back into the pool for anyone to book, but the reservation stays
          pending. If the student pays later and nobody else has taken the car,
          it is still theirs. Recording a payment against a reservation marks it
          paid automatically.
        </p>
      </section>

      <Field label="Organisation name">
        <input
          className="input"
          name="org_name"
          defaultValue={str(values.org_name, "Yeshiva Gedolah of Elkins Park")}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Office email">
          <input className="input" type="email" name="office_email" defaultValue={str(values.office_email)} />
        </Field>
        <Field label="Office phone">
          <input className="input" type="tel" name="office_phone" defaultValue={str(values.office_phone)} />
        </Field>
      </div>

      <Field label="Notice shown to students when they book">
        <textarea
          className="input min-h-20 resize-y"
          name="booking_notice"
          rows={2}
          defaultValue={str(values.booking_notice)}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Longest rental (days)">
          <input
            className="input"
            name="max_booking_days"
            inputMode="numeric"
            defaultValue={num(values.max_booking_days, 14)}
          />
        </Field>
        <Field label="How far ahead students can book (days)">
          <input
            className="input"
            name="max_advance_days"
            inputMode="numeric"
            defaultValue={num(values.max_advance_days, 120)}
          />
        </Field>
      </div>

      <p className="text-xs text-ink-soft">
        All times run on {ORG_TIMEZONE.replace("_", " ")}.
      </p>

      <SubmitButton pendingLabel="Saving...">Save settings</SubmitButton>
    </form>
  );
}
