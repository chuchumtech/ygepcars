"use client";

import { useState } from "react";
import {
  deleteAccountChargeAction,
  deletePaymentAction,
} from "@/app/actions/billing";
import { ChargeForm } from "@/components/billing/ChargeForm";
import { PaymentForm, type PayableReservation } from "@/components/billing/PaymentForm";
import { formatDate, formatRange } from "@/lib/dates";
import { formatMoney } from "@/lib/pricing";
import {
  paymentMethodLabel,
  type AccountCharge,
  type Payment,
  type PaymentPreference,
} from "@/lib/types";
import type { AdminReservation } from "@/components/calendar/types";

/**
 * The account, as the office works it: what is owed, and the two things they
 * can do about it -- take money, or put something on the bill.
 *
 * No money moves through the site, so this is a ledger kept by hand. A payment
 * need not name a rental; money usually turns up for "whatever I owe".
 */
export function BillingPanel({
  studentId,
  prefer,
  payments,
  charges,
  reservations,
  balanceCents,
  creditCents,
}: {
  studentId: string;
  prefer: PaymentPreference;
  payments: Payment[];
  charges: AccountCharge[];
  reservations: AdminReservation[];
  balanceCents: number;
  creditCents: number;
}) {
  const [open, setOpen] = useState<"payment" | "charge" | null>(null);

  const payable: PayableReservation[] = reservations
    .filter((r) => ["approved", "completed"].includes(r.status))
    .map((r) => {
      const paid = (r.payments ?? []).reduce((sum, p) => sum + p.amount_cents, 0);
      return {
        id: r.id,
        reference: r.reference,
        label: `${r.vehicle?.name ?? "Car"} ${formatRange(r.starts_at, r.ends_at)}`,
        outstandingCents: r.total_cents - paid,
      };
    })
    .filter((r) => r.outstandingCents > 0);

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wider text-ink-soft">
          Account
        </h2>
        <span
          className={`chip ${
            balanceCents > 0
              ? "bg-red-100 text-red-700"
              : creditCents > 0
                ? "bg-emerald-100 text-emerald-800"
                : "bg-parchment-deep text-ink"
          }`}
        >
          {balanceCents > 0
            ? `${formatMoney(balanceCents)} owed`
            : creditCents > 0
              ? `${formatMoney(creditCents)} in credit`
              : "Settled up"}
        </span>

        <div className="ml-auto flex gap-2">
          <button
            type="button"
            className="btn-primary btn-sm"
            onClick={() => setOpen(open === "payment" ? null : "payment")}
          >
            {open === "payment" ? "Close" : "Add payment"}
          </button>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => setOpen(open === "charge" ? null : "charge")}
          >
            {open === "charge" ? "Close" : "Add charge or credit"}
          </button>
        </div>
      </div>

      {open === "payment" ? (
        <div className="card-pad mb-4">
          <PaymentForm
            studentId={studentId}
            prefer={prefer}
            reservations={payable}
            suggestCents={balanceCents > 0 ? balanceCents : undefined}
            onDone={() => setOpen(null)}
          />
        </div>
      ) : null}

      {open === "charge" ? (
        <div className="card-pad mb-4">
          <ChargeForm studentId={studentId} onDone={() => setOpen(null)} />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Ledger
          title="Payments in"
          empty="Nothing received yet."
          rows={payments.map((p) => ({
            id: p.id,
            date: p.paid_on,
            title: paymentMethodLabel(p.method),
            detail: [p.reference, p.note, p.reservation_id ? "against a rental" : null]
              .filter(Boolean)
              .join(" · "),
            cents: -p.amount_cents,
            remove: (
              <form action={deletePaymentAction}>
                <input type="hidden" name="payment_id" value={p.id} />
                <RemoveButton label={`Remove the ${formatMoney(p.amount_cents)} payment`} />
              </form>
            ),
          }))}
        />

        <Ledger
          title="Charges and credits on the account"
          empty="Nothing beyond the rentals."
          rows={charges.map((c) => ({
            id: c.id,
            date: c.charged_on,
            title: c.description || "Charge",
            detail: c.note,
            cents: c.amount_cents,
            remove: (
              <form action={deleteAccountChargeAction}>
                <input type="hidden" name="charge_id" value={c.id} />
                <RemoveButton label={`Remove ${c.description}`} />
              </form>
            ),
          }))}
        />
      </div>
    </section>
  );
}

type LedgerRow = {
  id: string;
  date: string;
  title: string;
  detail: string;
  /** Positive is owed, negative is money in or a credit. */
  cents: number;
  remove: React.ReactNode;
};

function Ledger({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: LedgerRow[];
}) {
  return (
    <div className="card overflow-hidden">
      <p className="border-b border-line/70 bg-parchment px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-ink-soft">
        {title}
      </p>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-ink-soft">{empty}</p>
      ) : (
        <ul className="divide-y divide-line/70">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-20 shrink-0 text-xs text-ink-soft">
                {formatDate(row.date)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">
                  {row.title}
                </span>
                {row.detail ? (
                  <span className="block truncate text-xs text-ink-soft">{row.detail}</span>
                ) : null}
              </span>
              <span
                className={`shrink-0 text-sm font-bold tabular-nums ${
                  row.cents < 0 ? "text-good" : "text-ink"
                }`}
              >
                {row.cents < 0 ? `−${formatMoney(-row.cents)}` : formatMoney(row.cents)}
              </span>
              {row.remove}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RemoveButton({ label }: { label: string }) {
  return (
    <button
      type="submit"
      aria-label={label}
      className="tap shrink-0 rounded-lg p-1 text-ink-soft transition hover:bg-red-50 hover:text-bad"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    </button>
  );
}
