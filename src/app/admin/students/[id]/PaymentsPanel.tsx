"use client";

import { useActionState, useState } from "react";
import {
  deletePaymentAction,
  recordPaymentAction,
} from "@/app/actions/admin-people";
import type { ActionResult } from "@/app/actions/shared";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert, Field } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/pricing";
import type { Payment } from "@/lib/types";
import type { AdminReservation } from "@/components/calendar/types";

const METHODS = ["cash", "check", "zelle", "venmo", "card", "credit", "other"];

/**
 * No money moves through the site, so this is a ledger the office keeps by hand:
 * charges come from reservations, and everything received gets logged here.
 */
export function PaymentsPanel({
  studentId,
  payments,
  reservations,
  balanceCents,
}: {
  studentId: string;
  payments: Payment[];
  reservations: AdminReservation[];
  balanceCents: number;
}) {
  const [adding, setAdding] = useState(false);
  const [state, action] = useActionState<ActionResult, FormData>(recordPaymentAction, {});

  const billable = reservations.filter((r) =>
    ["approved", "completed"].includes(r.status),
  );

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
          Payments
        </h2>
        <span
          className={`chip ${
            balanceCents > 0
              ? "bg-red-100 text-red-700"
              : balanceCents < 0
                ? "bg-emerald-100 text-emerald-800"
                : "bg-navy-100 text-navy-700"
          }`}
        >
          {balanceCents > 0
            ? `${formatMoney(balanceCents)} owed`
            : balanceCents < 0
              ? `${formatMoney(-balanceCents)} credit`
              : "Settled up"}
        </span>
        <button
          type="button"
          className="btn-primary btn-sm ml-auto"
          onClick={() => setAdding((value) => !value)}
        >
          {adding ? "Close" : "Record a payment"}
        </button>
      </div>

      {adding ? (
        <form action={action} className="card-pad mb-3 space-y-4">
          <input type="hidden" name="student_id" value={studentId} />

          {state.error ? <Alert tone="error">{state.error}</Alert> : null}
          {state.success ? <Alert tone="success">{state.success}</Alert> : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Amount" hint="Use a negative number to issue a credit.">
              <input
                className="input"
                name="amount"
                inputMode="decimal"
                placeholder="45.00"
                required
                autoFocus
              />
            </Field>

            <Field label="Method">
              <select className="input" name="method" defaultValue="cash">
                {METHODS.map((method) => (
                  <option key={method} value={method} className="capitalize">
                    {method}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Date received">
              <input
                className="input"
                type="date"
                name="paid_on"
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Against which rental?" hint="Optional.">
              <select className="input" name="reservation_id" defaultValue="">
                <option value="">— general payment —</option>
                {billable.map((reservation) => (
                  <option key={reservation.id} value={reservation.id}>
                    {reservation.reference} · {formatDate(reservation.starts_at)} ·{" "}
                    {formatMoney(reservation.total_cents)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Check number / reference">
              <input className="input" name="reference" />
            </Field>
          </div>

          <Field label="Note">
            <input className="input" name="note" />
          </Field>

          <SubmitButton pendingLabel="Recording...">Record payment</SubmitButton>
        </form>
      ) : null}

      {payments.length === 0 ? (
        <p className="card-pad text-sm text-muted">Nothing recorded yet.</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[36rem]">
            <thead className="border-b border-[var(--color-line)] bg-navy-50">
              <tr>
                <th className="th">Date</th>
                <th className="th">Method</th>
                <th className="th">Note</th>
                <th className="th text-right">Amount</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-line)]">
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td className="td whitespace-nowrap">{formatDate(payment.paid_on)}</td>
                  <td className="td capitalize">{payment.method}</td>
                  <td className="td text-muted">
                    {[payment.reference, payment.note].filter(Boolean).join(" · ") || "--"}
                  </td>
                  <td
                    className={`td text-right font-semibold tabular-nums ${
                      payment.amount_cents < 0 ? "text-amber-700" : "text-emerald-700"
                    }`}
                  >
                    {formatMoney(payment.amount_cents)}
                  </td>
                  <td className="td text-right">
                    <form action={deletePaymentAction}>
                      <input type="hidden" name="payment_id" value={payment.id} />
                      <button
                        type="submit"
                        className="text-xs text-muted hover:text-red-700"
                        onClick={(event) => {
                          if (!confirm("Remove this payment from the ledger?")) {
                            event.preventDefault();
                          }
                        }}
                      >
                        Remove
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
