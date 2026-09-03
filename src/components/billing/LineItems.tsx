"use client";

import { useActionState, useState } from "react";
import {
  addReservationItemAction,
  deleteReservationItemAction,
} from "@/app/actions/billing";
import type { ActionResult } from "@/app/actions/shared";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert, Field } from "@/components/ui";
import { formatMoney } from "@/lib/pricing";
import type { ReservationItem } from "@/lib/types";

/**
 * Extras and discounts on one rental.
 *
 * This replaces a single nameless "adjustment" box. Each one carries the
 * office's own wording, because that wording is what the student reads on the
 * statement -- "adjustment $25" tells them nothing, "car wash after the trip
 * $25" tells them everything.
 *
 * A discount is a separate button rather than a negative number, so nobody has
 * to think about signs, and a discount cannot be typed in as a charge.
 */
export function LineItems({
  reservationId,
  items,
}: {
  reservationId: string;
  items: ReservationItem[];
}) {
  const [state, action] = useActionState<ActionResult, FormData>(
    addReservationItemAction,
    {},
  );
  const [kind, setKind] = useState<"charge" | "discount" | null>(null);

  return (
    <div className="space-y-3">
      {items.length > 0 ? (
        <ul className="divide-y divide-line/70 rounded-xl border border-line/70 bg-surface">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-3 py-2">
              <span
                className={`chip shrink-0 ${
                  item.kind === "discount"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-parchment-deep text-ink"
                }`}
              >
                {item.kind === "discount" ? "Discount" : "Charge"}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-ink">
                {item.description}
              </span>
              <span
                className={`shrink-0 text-sm font-bold tabular-nums ${
                  item.kind === "discount" ? "text-good" : "text-ink"
                }`}
              >
                {item.kind === "discount" ? "−" : ""}
                {formatMoney(item.amount_cents)}
              </span>
              <form action={deleteReservationItemAction} className="shrink-0">
                <input type="hidden" name="item_id" value={item.id} />
                <button
                  type="submit"
                  aria-label={`Remove ${item.description}`}
                  className="tap rounded-lg p-1 text-ink-soft transition hover:bg-red-50 hover:text-bad"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path
                      d="M4 4l8 8M12 4l-8 8"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-soft">
          Nothing added beyond the time and tolls.
        </p>
      )}

      {kind === null ? (
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => setKind("charge")}
          >
            Add a line item
          </button>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => setKind("discount")}
          >
            Add a discount
          </button>
        </div>
      ) : (
        <form
          action={async (formData) => {
            await action(formData);
            setKind(null);
          }}
          className="space-y-3 rounded-xl border border-line/70 bg-parchment/50 p-3"
        >
          <input type="hidden" name="reservation_id" value={reservationId} />
          <input type="hidden" name="kind" value={kind} />

          {state.error ? <Alert tone="error">{state.error}</Alert> : null}

          <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
            <Field
              label={kind === "discount" ? "What is the discount for?" : "What is the charge for?"}
              hint="The student sees this on their statement."
            >
              <input
                className="input"
                name="description"
                maxLength={120}
                autoFocus
                placeholder={
                  kind === "discount" ? "Goodwill, car was filthy" : "Car wash after the trip"
                }
                required
              />
            </Field>
            <Field label="How much" hint="Dollars.">
              <input
                className="input"
                name="amount"
                inputMode="decimal"
                placeholder="25.00"
                required
              />
            </Field>
          </div>

          <div className="flex gap-2">
            <SubmitButton className="btn-primary btn-sm" pendingLabel="Adding...">
              {kind === "discount" ? "Add discount" : "Add line item"}
            </SubmitButton>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => setKind(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
