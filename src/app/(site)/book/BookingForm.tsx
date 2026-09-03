"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import {
  requestReservationAction,
  type ActionState,
} from "@/app/actions/reservations";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert, Field } from "@/components/ui";
import { PaymentHoldNotice } from "@/components/BookingRulesNote";
import { formatMoney, quoteForVehicle } from "@/lib/pricing";
import type { BookingRules } from "@/lib/booking-rules";
import type { Destination, Vehicle } from "@/lib/types";

export function BookingForm({
  vehicle,
  destinations,
  window: win,
  startsAtIso,
  endsAtIso,
  rules,
  blocked = false,
}: {
  vehicle: Vehicle;
  destinations: Destination[];
  window: { startDate: string; startTime: string; endDate: string; endTime: string };
  startsAtIso: string;
  endsAtIso: string;
  rules: BookingRules;
  blocked?: boolean;
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    requestReservationAction,
    {},
  );
  const [destinationId, setDestinationId] = useState(destinations[0]?.id ?? "");

  const destination = destinations.find((d) => d.id === destinationId) ?? null;

  // Recomputed in the browser so the total moves the instant the student picks a
  // destination. The server recalculates it from scratch before saving.
  const estimate = useMemo(
    () =>
      quoteForVehicle(
        vehicle,
        new Date(startsAtIso),
        new Date(endsAtIso),
        destination?.toll_cents ?? 0,
      ),
    [vehicle, startsAtIso, endsAtIso, destination?.toll_cents],
  );

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="vehicle_id" value={vehicle.id} />
      <input type="hidden" name="start_date" value={win.startDate} />
      <input type="hidden" name="start_time" value={win.startTime} />
      <input type="hidden" name="end_date" value={win.endDate} />
      <input type="hidden" name="end_time" value={win.endTime} />

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <section className="card-pad space-y-4">
        <h2 className="text-base font-bold text-slate-500">Where are you going?</h2>
        <p className="-mt-2 text-sm text-muted">
          Tolls are billed as one flat fee for the trip, based on the destination.
        </p>

        <div className="space-y-2">
          {destinations.map((option) => (
            <label
              key={option.id}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition ${
                option.id === destinationId
                  ? "border-navy-600 bg-navy-50 ring-1 ring-navy-600"
                  : "border-[var(--color-line)] hover:border-navy-300 hover:bg-navy-50/50"
              }`}
            >
              <input
                type="radio"
                name="destination_id"
                value={option.id}
                checked={option.id === destinationId}
                onChange={() => setDestinationId(option.id)}
                className="h-4 w-4 shrink-0 accent-slate-500"
                required
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-navy-800">
                  {option.name}
                </span>
                {option.description ? (
                  <span className="block text-xs text-muted">{option.description}</span>
                ) : null}
              </span>
              <span className="shrink-0 text-sm font-bold tabular-nums text-gold-500">
                {option.toll_cents > 0 ? formatMoney(option.toll_cents) : "No tolls"}
              </span>
            </label>
          ))}
          {destinations.length === 0 ? (
            <Alert tone="warn">
              The office has not set up any destinations yet. Ask them to add one
              before you request a car.
            </Alert>
          ) : null}
        </div>

        <Field
          label="Exact destination (optional)"
          hint="Helps the office confirm the toll estimate is right."
        >
          <input
            className="input"
            name="destination_note"
            placeholder="e.g. Lakewood, 14th Street"
            maxLength={120}
          />
        </Field>
      </section>

      <section className="card-pad space-y-4">
        <h2 className="text-base font-bold text-slate-500">A few details</h2>

        <Field
          label="Reason for the trip"
          hint="Required. The office decides on requests based on this, so be specific."
        >
          <input
            className="input"
            name="purpose"
            placeholder="e.g. Shabbos at home in Lakewood, cousin's wedding, dentist"
            maxLength={160}
            required
          />
        </Field>

        <Field label="Anything the office should know? (optional)">
          <textarea
            className="input min-h-24 resize-y"
            name="student_notes"
            rows={3}
            maxLength={600}
            placeholder="Another bochur is coming with me, I may need it an hour longer, etc."
          />
        </Field>
      </section>

      <section className="card-pad">
        <h2 className="text-base font-bold text-slate-500">Estimated total</h2>

        <dl className="mt-3 text-sm">
          <div className="flex justify-between border-b border-[var(--color-line)] py-2">
            <dt className="text-muted">
              {estimate.billableHours} hour{estimate.billableHours === 1 ? "" : "s"} at{" "}
              {formatMoney(vehicle.hourly_rate_cents)}/hr
              {estimate.capApplied ? " (daily cap applied)" : ""}
            </dt>
            <dd className="font-medium tabular-nums">
              {formatMoney(estimate.timeChargeCents)}
            </dd>
          </div>
          <div className="flex justify-between border-b border-[var(--color-line)] py-2">
            <dt className="text-muted">
              Tolls{destination ? ` — ${destination.name}` : ""}
            </dt>
            <dd className="font-medium tabular-nums">{formatMoney(estimate.tollCents)}</dd>
          </div>
          <div className="flex justify-between pt-3">
            <dt className="text-base font-bold text-navy-800">Estimate</dt>
            <dd className="text-xl font-bold tabular-nums text-navy-800">
              {formatMoney(estimate.totalCents)}
            </dd>
          </div>
        </dl>

        <p className="mt-3 text-xs text-muted">
          This is an estimate, not a bill. Nothing is charged online — the office
          settles up with you and can adjust the tolls if the trip changes.
        </p>

        <div className="mt-4">
          <Alert tone="warn" title="How long the car is held for you">
            <PaymentHoldNotice rules={rules} />
          </Alert>
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <SubmitButton
          className="btn-primary"
          pendingLabel="Sending request..."
          disabled={blocked}
        >
          Request this reservation
        </SubmitButton>
        <Link href="/" className="btn-secondary">
          Cancel
        </Link>
      </div>
    </form>
  );
}
