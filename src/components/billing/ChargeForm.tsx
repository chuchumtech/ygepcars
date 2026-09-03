"use client";

import { useActionState, useState } from "react";
import { addAccountChargeAction } from "@/app/actions/billing";
import type { ActionResult } from "@/app/actions/shared";
import { DateField } from "@/components/DateField";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert, Field } from "@/components/ui";
import { todayLocal } from "@/lib/dates";

/**
 * A charge that belongs to the account rather than to a rental -- a share of a
 * repair, a fee, anything the office needs on somebody's statement that no
 * trip explains. The same form gives a credit, which is how a goodwill
 * gesture gets recorded without pretending money arrived.
 */
export function ChargeForm({
  studentId,
  onDone,
}: {
  studentId: string;
  onDone?: () => void;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(
    addAccountChargeAction,
    {},
  );
  const [chargedOn, setChargedOn] = useState(todayLocal());
  const [direction, setDirection] = useState<"charge" | "credit">("charge");

  return (
    <form
      action={async (formData) => {
        await action(formData);
        onDone?.();
      }}
      className="space-y-4"
    >
      <input type="hidden" name="student_id" value={studentId} />
      <input type="hidden" name="direction" value={direction} />

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      <div className="flex gap-1 rounded-xl bg-parchment-deep p-1">
        {(
          [
            ["charge", "They owe this"],
            ["credit", "Credit them"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setDirection(value)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-bold transition ${
              direction === value ? "bg-surface text-ink shadow-card" : "text-ink-soft"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_9rem_11rem]">
        <Field label="What is it for?" hint="This is what the student reads.">
          <input
            className="input"
            name="description"
            maxLength={120}
            autoFocus
            placeholder={
              direction === "credit" ? "Goodwill for the cancelled trip" : "Share of the new roof rack"
            }
            required
          />
        </Field>

        <Field label="How much" hint="Dollars.">
          <input
            className="input"
            name="amount"
            inputMode="decimal"
            placeholder="40.00"
            required
          />
        </Field>

        <Field label="Dated">
          <DateField
            id={`charged-on-${studentId}`}
            label="Charge date"
            name="charged_on"
            value={chargedOn}
            onChange={setChargedOn}
          />
        </Field>
      </div>

      <Field label="Note" hint="Only the office sees this.">
        <input className="input" name="note" maxLength={200} />
      </Field>

      <SubmitButton className="btn-primary" pendingLabel="Saving...">
        {direction === "credit" ? "Add credit" : "Add charge"}
      </SubmitButton>
    </form>
  );
}
