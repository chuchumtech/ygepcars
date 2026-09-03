"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import {
  checkInReservationAction,
  checkOutReservationAction,
  decideReservationAction,
  deleteReservationAction,
  updateReservationAction,
} from "@/app/actions/admin-reservations";
import type { ActionResult } from "@/app/actions/shared";
import { ActionMenu, ActionMenuGroup, ActionMenuItem } from "@/components/ActionMenu";
import { LineItems } from "@/components/billing/LineItems";
import { PaymentForm } from "@/components/billing/PaymentForm";
import { DateField, DateRangeField } from "@/components/DateField";
import { Modal } from "@/components/Modal";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert, Collapsible, DetailRow, Field, StatusBadge } from "@/components/ui";
import {
  describeDuration,
  formatDate,
  formatDateTime,
  formatRange,
  halfHourOptions,
  hoursBetween,
  instantToLocalParts,
  localToInstant,
} from "@/lib/dates";
import { formatMoney, parseMoneyToCents, quote } from "@/lib/pricing";
import { FUEL_OPTIONS, describeLateness, fuelLabel } from "@/lib/returns";
import { paymentMethodLabel, type Destination, type Vehicle } from "@/lib/types";
import type { AdminReservation } from "./types";

const STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "hold", label: "On hold" },
  { value: "approved", label: "Approved" },
  { value: "completed", label: "Completed" },
  { value: "declined", label: "Declined" },
  { value: "cancelled", label: "Cancelled" },
  { value: "released", label: "Released" },
];

function money(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2);
}

/** Which inline form, if any, is open under the action bar. */
type Panel = "payment" | "checkin" | "hold" | "release" | "decline" | null;

export function ReservationDialog({
  reservation,
  vehicles,
  destinations,
  onClose,
}: {
  reservation: AdminReservation | null;
  vehicles: Vehicle[];
  destinations: Destination[];
  onClose: () => void;
}) {
  // Holds the id being edited rather than a bare boolean, so opening a
  // different reservation always starts on the read view.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, editAction] = useActionState<ActionResult, FormData>(
    updateReservationAction,
    {},
  );

  if (!reservation) return null;

  const editing = editingId === reservation.id;

  return (
    <Modal
      open={Boolean(reservation)}
      onClose={onClose}
      width="xl"
      title={
        <span className="flex items-center gap-2">
          {reservation.student?.full_name ?? "Reservation"}
          <StatusBadge status={reservation.status} />
        </span>
      }
      subtitle={
        <span>
          {reservation.reference} · {reservation.vehicle?.name ?? "Car"} ·{" "}
          {formatRange(reservation.starts_at, reservation.ends_at)}
        </span>
      }
      footer={
        editing ? (
          <>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setEditingId(null)}
            >
              Cancel
            </button>
            <SubmitButton form="reservation-edit" pendingLabel="Saving...">
              Save changes
            </SubmitButton>
          </>
        ) : (
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        )
      }
    >
      {editState.error ? <Alert tone="error">{editState.error}</Alert> : null}
      {editState.success ? <Alert tone="success">{editState.success}</Alert> : null}

      {editing ? (
        <EditForm
          id="reservation-edit"
          action={editAction}
          reservation={reservation}
          vehicles={vehicles}
          destinations={destinations}
        />
      ) : (
        <ReadView
          reservation={reservation}
          onEdit={() => setEditingId(reservation.id)}
          onClose={onClose}
        />
      )}
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* The read view                                                              */
/* -------------------------------------------------------------------------- */

/**
 * What the office needs the moment they open a reservation, and nothing else.
 *
 * The old version laid out a dozen buttons and every field the row has, so the
 * two things they do every time -- decide it, and take the money -- were lost
 * among ten they do once a month. Now there is one contextual primary action,
 * Add payment beside it, and everything else behind the menu; the detail is
 * three collapsed sections that open when somebody actually wants them.
 */
function ReadView({
  reservation,
  onEdit,
  onClose,
}: {
  reservation: AdminReservation;
  onEdit: () => void;
  onClose: () => void;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const [holdUntil, setHoldUntil] = useState("");
  const [decideState, decideAction] = useActionState<ActionResult, FormData>(
    decideReservationAction,
    {},
  );
  const [checkInState, checkInAction] = useActionState<ActionResult, FormData>(
    checkInReservationAction,
    {},
  );

  const hours = hoursBetween(reservation.starts_at, reservation.ends_at);
  const items = reservation.items ?? [];
  const payments = reservation.payments ?? [];
  const paidCents = payments.reduce((sum, p) => sum + p.amount_cents, 0);
  const owingCents = reservation.total_cents - paidCents;

  const status = reservation.status;
  const occupiesCar = ["hold", "approved", "completed"].includes(status);
  const settled = owingCents <= 0 && reservation.total_cents > 0;
  // Kept in step with PrimaryAction so Approve is not offered twice.
  const approveIsPrimary = ["pending", "hold", "released"].includes(status);

  function open(next: Panel) {
    setPanel((current) => (current === next ? null : next));
  }

  return (
    <div className="space-y-5">
      {decideState.error ? <Alert tone="error">{decideState.error}</Alert> : null}
      {decideState.success ? <Alert tone="success">{decideState.success}</Alert> : null}

      {status === "hold" ? (
        <Alert tone="info" title="This car is on hold">
          {reservation.hold_expires_at
            ? `Meant to be revisited by ${formatDateTime(reservation.hold_expires_at)}. It keeps blocking the car until you approve or release it.`
            : "Nobody else can book this car until you approve or release it."}
        </Alert>
      ) : null}

      {status === "released" && reservation.release_reason ? (
        <Alert tone="info" title="Released">
          {reservation.release_reason}
        </Alert>
      ) : null}

      {reservation.decline_reason ? (
        <Alert tone="error" title="Declined">
          {reservation.decline_reason}
        </Alert>
      ) : null}

      {/* Money, first, because it is the question. */}
      <div className="grid grid-cols-3 divide-x divide-line/70 overflow-hidden rounded-xl border border-line/70 bg-surface">
        <Amount label="Total" cents={reservation.total_cents} />
        <Amount label="Paid" cents={paidCents} tone={paidCents > 0 ? "good" : "plain"} />
        <Amount
          label={owingCents < 0 ? "Overpaid" : "Owing"}
          cents={Math.abs(owingCents)}
          tone={owingCents > 0 ? "bad" : "good"}
          note={settled && owingCents === 0 ? "Settled" : undefined}
        />
      </div>

      {/* Why they want the car: the whole reason the office opened this. */}
      <div className="rounded-xl border border-gold-200 bg-gold-50 px-4 py-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-gold-600">
          Reason for the trip
        </p>
        <p className="mt-0.5 text-sm font-medium text-ink">
          {reservation.purpose || "The student did not give one."}
        </p>
        {reservation.destination_label ? (
          <p className="mt-1 text-sm text-ink-soft">
            Heading to {reservation.destination_label}
          </p>
        ) : null}
      </div>

      <dl className="grid gap-x-8 sm:grid-cols-2">
        <DetailRow label="Car">{reservation.vehicle?.name ?? "—"}</DetailRow>
        <DetailRow label="Length">{describeDuration(hours)}</DetailRow>
        <DetailRow label="Out">{formatDateTime(reservation.starts_at)}</DetailRow>
        <DetailRow label="Back">{formatDateTime(reservation.ends_at)}</DetailRow>
        <DetailRow label="Phone">
          {reservation.student?.phone ? (
            <a href={`tel:${reservation.student.phone}`} className="link">
              {reservation.student.phone}
            </a>
          ) : (
            "—"
          )}
        </DetailRow>
        <DetailRow label="Pays by">
          {reservation.student?.payment_method === "cash" ? "Cash" : "Zelle"}
        </DetailRow>
      </dl>

      {/* Two actions out front, the rest in the menu. */}
      <div className="flex flex-wrap items-center gap-2 border-y border-line/70 py-3">
        <PrimaryAction
          reservation={reservation}
          decideAction={decideAction}
          onCheckIn={() => open("checkin")}
        />

        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={() => open("payment")}
        >
          {panel === "payment" ? "Close payment" : "Add payment"}
        </button>

        <ActionMenu label="More">
          <ActionMenuGroup label="Decide" />
          {status !== "approved" && !approveIsPrimary ? (
            <ActionMenuItem>
              <form action={decideAction}>
                <input type="hidden" name="reservation_id" value={reservation.id} />
                <input type="hidden" name="decision" value="approved" />
                <button type="submit">Approve</button>
              </form>
            </ActionMenuItem>
          ) : null}
          {status !== "hold" ? (
            <ActionMenuItem>
              <button type="button" onClick={() => open("hold")}>
                Put on hold
              </button>
            </ActionMenuItem>
          ) : null}
          {occupiesCar ? (
            <ActionMenuItem>
              <button type="button" onClick={() => open("release")}>
                Release the car
              </button>
            </ActionMenuItem>
          ) : null}
          {status !== "pending" ? (
            <ActionMenuItem>
              <form action={decideAction}>
                <input type="hidden" name="reservation_id" value={reservation.id} />
                <input type="hidden" name="decision" value="pending" />
                <button type="submit">Back to pending</button>
              </form>
            </ActionMenuItem>
          ) : null}

          <ActionMenuGroup label="The car" />
          {status === "approved" && !reservation.picked_up_at ? (
            <ActionMenuItem>
              <form action={checkOutReservationAction}>
                <input type="hidden" name="reservation_id" value={reservation.id} />
                <button type="submit">Car went out</button>
              </form>
            </ActionMenuItem>
          ) : null}
          {reservation.picked_up_at && !reservation.returned_at ? (
            <ActionMenuItem>
              <button type="button" onClick={() => open("checkin")}>
                Check the car back in
              </button>
            </ActionMenuItem>
          ) : null}
          <ActionMenuItem>
            <button type="button" onClick={onEdit}>
              Edit the details
            </button>
          </ActionMenuItem>

          <ActionMenuGroup label="Elsewhere" />
          {reservation.student ? (
            <ActionMenuItem>
              <Link
                href={`/admin/students/${reservation.student.id}`}
                className="block px-3.5 py-2 text-sm font-semibold text-ink transition hover:bg-parchment-deep"
              >
                Open student record
              </Link>
            </ActionMenuItem>
          ) : null}
          {reservation.student ? (
            <ActionMenuItem>
              <Link
                href={`/admin/students/${reservation.student.id}/statement`}
                className="block px-3.5 py-2 text-sm font-semibold text-ink transition hover:bg-parchment-deep"
              >
                Statement
              </Link>
            </ActionMenuItem>
          ) : null}

          <ActionMenuGroup label="Careful" />
          {status !== "declined" ? (
            <ActionMenuItem tone="danger">
              <button type="button" onClick={() => open("decline")}>
                Decline
              </button>
            </ActionMenuItem>
          ) : null}
          {["pending", "approved", "hold"].includes(status) ? (
            <ActionMenuItem tone="danger">
              <form action={decideAction}>
                <input type="hidden" name="reservation_id" value={reservation.id} />
                <input type="hidden" name="decision" value="cancelled" />
                <button type="submit">Cancel the reservation</button>
              </form>
            </ActionMenuItem>
          ) : null}
          <ActionMenuItem tone="danger">
            <form action={deleteReservationAction}>
              <input type="hidden" name="reservation_id" value={reservation.id} />
              <button
                type="submit"
                onClick={(event) => {
                  if (
                    !confirm(
                      "Delete this reservation for good? The student's history will no longer show it.",
                    )
                  ) {
                    event.preventDefault();
                  } else {
                    onClose();
                  }
                }}
              >
                Delete for good
              </button>
            </form>
          </ActionMenuItem>
        </ActionMenu>
      </div>

      {/* Whichever form the office opened. */}
      {panel === "payment" && reservation.student ? (
        <div className="rounded-xl border border-line/70 bg-parchment/50 p-4">
          <p className="mb-3 text-sm font-bold text-ink">Record a payment</p>
          <PaymentForm
            studentId={reservation.student.id}
            prefer={reservation.student.payment_method}
            reservations={[]}
            lockedReservationId={reservation.id}
            suggestCents={owingCents > 0 ? owingCents : undefined}
            onDone={() => setPanel(null)}
          />
          <p className="mt-3 text-xs text-ink-soft">
            Recording it against this rental is what keeps the car out of the pool
            under the payment rule.
          </p>
        </div>
      ) : null}

      {panel === "hold" ? (
        <form
          action={decideAction}
          className="space-y-3 rounded-xl border border-gold-200 bg-gold-50/70 p-4"
        >
          <input type="hidden" name="reservation_id" value={reservation.id} />
          <input type="hidden" name="decision" value="hold" />
          <p className="text-sm text-ink">
            The car is blocked for this student while it is held, exactly as if it
            were booked. Nothing is charged until you approve it.
          </p>
          <Field
            label="Revisit by (optional)"
            hint="A reminder for you — a lapsed hold keeps the car blocked until you act on it."
          >
            <DateField
              id={`hold-until-${reservation.id}`}
              label="Revisit by"
              name="hold_expires_at"
              value={holdUntil}
              onChange={setHoldUntil}
            />
          </Field>
          <SubmitButton className="btn-primary btn-sm" pendingLabel="Holding...">
            Hold this car
          </SubmitButton>
        </form>
      ) : null}

      {panel === "release" ? (
        <form
          action={decideAction}
          className="space-y-3 rounded-xl border border-line/70 bg-parchment p-4"
        >
          <input type="hidden" name="reservation_id" value={reservation.id} />
          <input type="hidden" name="decision" value="released" />
          <p className="text-sm text-ink">
            The car goes straight back into the pool. The reservation stays on
            record as released.
          </p>
          <Field label="Why is it being released? (optional)">
            <input
              className="input"
              name="release_reason"
              placeholder="Student never paid"
            />
          </Field>
          <SubmitButton className="btn-primary btn-sm" pendingLabel="Releasing...">
            Release the car
          </SubmitButton>
        </form>
      ) : null}

      {panel === "decline" ? (
        <form
          action={decideAction}
          className="space-y-3 rounded-xl border border-red-200 bg-red-50/60 p-4"
        >
          <input type="hidden" name="reservation_id" value={reservation.id} />
          <input type="hidden" name="decision" value="declined" />
          <Field label="Why is this being declined?" hint="The student sees this.">
            <input
              className="input"
              name="decline_reason"
              placeholder="Car is being serviced that weekend"
              required
              autoFocus
            />
          </Field>
          <SubmitButton className="btn-danger btn-sm" pendingLabel="Declining...">
            Confirm decline
          </SubmitButton>
        </form>
      ) : null}

      {panel === "checkin" ? (
        <form
          action={checkInAction}
          className="space-y-4 rounded-xl border border-line/70 bg-brand-light/40 p-4"
        >
          <input type="hidden" name="reservation_id" value={reservation.id} />

          {checkInState.error ? <Alert tone="error">{checkInState.error}</Alert> : null}
          {checkInState.success ? (
            <Alert tone="success">{checkInState.success}</Alert>
          ) : null}

          <p className="text-sm text-ink-soft">
            It went out at {fuelLabel(reservation.fuel_out)}, so that is the level to
            bring it back to. Late and fuel fees are worked out from the rules and
            can be overridden.
          </p>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Came back at" hint="Leave as now if it just arrived.">
              <input className="input" type="datetime-local" name="returned_at" />
            </Field>
            <Field label="Fuel gauge now">
              <select className="input" name="fuel_in" defaultValue="">
                <option value="">Did not check</option>
                {FUEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Late fee" hint="Blank to use the rule.">
              <input className="input" name="late_fee" inputMode="decimal" />
            </Field>
            <Field label="Fuel fee" hint="Blank to use the rule.">
              <input className="input" name="fuel_fee" inputMode="decimal" />
            </Field>
          </div>

          <Field label="Anything to note about the return?">
            <input className="input" name="return_notes" maxLength={400} />
          </Field>

          <SubmitButton className="btn-primary btn-sm" pendingLabel="Checking in...">
            Check it in
          </SubmitButton>
        </form>
      ) : null}

      {/* Everything else, put away. */}
      <div className="space-y-2">
        <Collapsible
          title="Charges"
          hint={`${formatMoney(reservation.total_cents)}${items.length ? ` · ${items.length} extra` : ""}`}
          defaultOpen={items.length > 0}
        >
          <div className="space-y-4">
            <dl className="rounded-xl bg-parchment px-4 py-3 text-sm">
              <Row
                label={`Time (${reservation.billable_hours} hrs at ${formatMoney(reservation.hourly_rate_cents)}/hr${reservation.daily_cap_cents ? `, ${formatMoney(reservation.daily_cap_cents)} cap` : ""})`}
                cents={reservation.time_charge_cents}
              />
              <Row label="Tolls" cents={reservation.toll_cents} />
              {items.map((item) => (
                <Row
                  key={item.id}
                  label={item.description}
                  cents={item.signed_cents}
                />
              ))}
              {reservation.late_fee_cents > 0 ? (
                <Row
                  label={`Late fee (${describeLateness(reservation.late_minutes)})`}
                  cents={reservation.late_fee_cents}
                />
              ) : null}
              {reservation.fuel_fee_cents > 0 ? (
                <Row label="Fuel not replaced" cents={reservation.fuel_fee_cents} />
              ) : null}
              <div className="mt-1 flex justify-between border-t border-line pt-1.5">
                <dt className="font-bold text-ink">Total</dt>
                <dd className="font-bold tabular-nums text-ink">
                  {formatMoney(reservation.total_cents)}
                </dd>
              </div>
            </dl>

            <LineItems reservationId={reservation.id} items={items} />
          </div>
        </Collapsible>

        <Collapsible
          title="Payments against this rental"
          hint={payments.length === 0 ? "None yet" : formatMoney(paidCents)}
        >
          {payments.length === 0 ? (
            <p className="text-sm text-ink-soft">
              Nothing recorded against this rental. Money on the account without a
              rental named still counts towards what they owe.
            </p>
          ) : (
            <ul className="divide-y divide-line/70">
              {payments.map((payment) => (
                <li key={payment.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="text-ink-soft">{formatDate(payment.paid_on)}</span>
                  <span className="flex-1 text-ink">
                    {paymentMethodLabel(payment.method)}
                    {payment.reference ? ` · ${payment.reference}` : ""}
                  </span>
                  <span className="font-bold tabular-nums text-good">
                    {formatMoney(payment.amount_cents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Collapsible>

        {reservation.picked_up_at || reservation.returned_at ? (
          <Collapsible
            title="The car going out and coming back"
            hint={reservation.returned_at ? "Returned" : "Still out"}
          >
            <dl>
              <DetailRow label="Went out">
                {reservation.picked_up_at
                  ? formatDateTime(reservation.picked_up_at)
                  : "Not yet"}
              </DetailRow>
              <DetailRow label="Came back">
                {reservation.returned_at
                  ? `${formatDateTime(reservation.returned_at)}${reservation.late_minutes > 0 ? ` · ${describeLateness(reservation.late_minutes)}` : ""}`
                  : "Not yet"}
              </DetailRow>
              <DetailRow label="Fuel out / in">
                {fuelLabel(reservation.fuel_out)} → {fuelLabel(reservation.fuel_in)}
              </DetailRow>
              {reservation.return_notes ? (
                <DetailRow label="Noted">{reservation.return_notes}</DetailRow>
              ) : null}
            </dl>
          </Collapsible>
        ) : null}

        <Collapsible
          title="Notes and history"
          hint={reservation.student_notes || reservation.admin_notes ? "Has notes" : undefined}
        >
          <div className="space-y-4">
            {reservation.student_notes ? (
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-wider text-ink-soft">
                  From the student
                </p>
                <p className="rounded-lg bg-parchment px-3 py-2 text-sm text-ink">
                  {reservation.student_notes}
                </p>
              </div>
            ) : null}
            {reservation.admin_notes ? (
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-wider text-ink-soft">
                  Office notes
                </p>
                <p className="rounded-lg bg-gold-50 px-3 py-2 text-sm text-ink">
                  {reservation.admin_notes}
                </p>
              </div>
            ) : null}
            <dl>
              <DetailRow label="Email">
                {reservation.student?.email ? (
                  <a href={`mailto:${reservation.student.email}`} className="link">
                    {reservation.student.email}
                  </a>
                ) : (
                  "—"
                )}
              </DetailRow>
              <DetailRow label="Requested">
                {formatDateTime(reservation.requested_at)}
              </DetailRow>
              {reservation.decided_at ? (
                <DetailRow label="Decided">
                  {formatDateTime(reservation.decided_at)}
                </DetailRow>
              ) : null}
              <DetailRow label="Reference">{reservation.reference}</DetailRow>
            </dl>
          </div>
        </Collapsible>
      </div>
    </div>
  );
}

/** The one thing the office is most likely to do next, given where it is. */
function PrimaryAction({
  reservation,
  decideAction,
  onCheckIn,
}: {
  reservation: AdminReservation;
  decideAction: (formData: FormData) => void;
  onCheckIn: () => void;
}) {
  const status = reservation.status;

  if (["pending", "hold", "released"].includes(status)) {
    return (
      <form action={decideAction}>
        <input type="hidden" name="reservation_id" value={reservation.id} />
        <input type="hidden" name="decision" value="approved" />
        <SubmitButton className="btn-primary btn-sm" pendingLabel="Approving...">
          Approve
        </SubmitButton>
      </form>
    );
  }

  if (status === "approved" && !reservation.picked_up_at) {
    return (
      <form action={checkOutReservationAction}>
        <input type="hidden" name="reservation_id" value={reservation.id} />
        <SubmitButton className="btn-primary btn-sm" pendingLabel="...">
          Car went out
        </SubmitButton>
      </form>
    );
  }

  if (status === "approved") {
    return (
      <button type="button" className="btn-primary btn-sm" onClick={onCheckIn}>
        Check the car back in
      </button>
    );
  }

  return null;
}

function Amount({
  label,
  cents,
  tone = "plain",
  note,
}: {
  label: string;
  cents: number;
  tone?: "plain" | "good" | "bad";
  note?: string;
}) {
  return (
    <div className="px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
        {label}
      </p>
      <p
        className={`text-xl font-extrabold tabular-nums ${
          tone === "bad" ? "text-bad" : tone === "good" ? "text-good" : "text-ink"
        }`}
      >
        {formatMoney(cents)}
      </p>
      {note ? <p className="text-xs font-semibold text-good">{note}</p> : null}
    </div>
  );
}

function Row({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="flex justify-between gap-4 py-0.5">
      <dt className="min-w-0 text-ink-soft">{label}</dt>
      <dd className={`shrink-0 tabular-nums ${cents < 0 ? "text-good" : ""}`}>
        {cents < 0 ? `−${formatMoney(-cents)}` : formatMoney(cents)}
      </dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The edit form                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Times, car, destination and rate. Extras and discounts are not here: they
 * are line items with their own descriptions, added from the Charges section,
 * and the database rolls them into the total.
 */
function EditForm({
  id,
  action,
  reservation,
  vehicles,
  destinations,
}: {
  id: string;
  action: (formData: FormData) => void;
  reservation: AdminReservation;
  vehicles: Vehicle[];
  destinations: Destination[];
}) {
  const times = useMemo(() => halfHourOptions(), []);
  const start = instantToLocalParts(reservation.starts_at);
  const end = instantToLocalParts(reservation.ends_at);

  const [form, setForm] = useState({
    startDate: start.date,
    startTime: start.time,
    endDate: end.date,
    endTime: end.time,
    vehicleId: reservation.vehicle_id,
    destinationId: reservation.destination_id ?? "",
    hourlyRate: money(reservation.hourly_rate_cents),
    dailyCap: money(reservation.daily_cap_cents),
    toll: money(reservation.toll_cents),
  });

  const vehicle = vehicles.find((v) => v.id === form.vehicleId);

  // Mirrors what the server will recompute, so the office sees the new total
  // before saving rather than after. The line items are carried across
  // untouched, which is why they are added in rather than re-entered.
  const preview = useMemo(() => {
    const startsAt = localToInstant(form.startDate, form.startTime);
    const endsAt = localToInstant(form.endDate, form.endTime);
    if (
      Number.isNaN(startsAt.getTime()) ||
      Number.isNaN(endsAt.getTime()) ||
      endsAt <= startsAt
    ) {
      return null;
    }
    return quote({
      startsAt,
      endsAt,
      hourlyRateCents: parseMoneyToCents(form.hourlyRate) ?? 0,
      dailyCapCents: form.dailyCap === "" ? null : parseMoneyToCents(form.dailyCap),
      minimumHours: Number(vehicle?.minimum_hours) || 1,
      tollCents: parseMoneyToCents(form.toll) ?? 0,
      adjustmentCents: reservation.adjustment_cents,
    });
  }, [form, vehicle?.minimum_hours, reservation.adjustment_cents]);

  function set(patch: Partial<typeof form>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  return (
    <form id={id} action={action} className="space-y-5">
      <input type="hidden" name="reservation_id" value={reservation.id} />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Car">
          <select
            className="input"
            name="vehicle_id"
            value={form.vehicleId}
            onChange={(e) => set({ vehicleId: e.target.value })}
          >
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Status">
          <select className="input" name="status" defaultValue={reservation.status}>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Dates">
          <DateRangeField
            id={`edit-dates-${reservation.id}`}
            startDate={form.startDate}
            endDate={form.endDate}
            startName="start_date"
            endName="end_date"
            startLabel="Picks up"
            endLabel="Returns"
            onChange={(next) => set(next)}
          />
        </Field>

        <Field label="Pick up time">
          <select
            className="input"
            name="start_time"
            value={form.startTime}
            onChange={(e) => set({ startTime: e.target.value })}
          >
            {times.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Return time">
          <select
            className="input"
            name="end_time"
            value={form.endTime}
            onChange={(e) => set({ endTime: e.target.value })}
          >
            {times.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-bold text-ink">Destination and tolls</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            label="Preset destination"
            hint="Changing this does not overwrite the toll below."
            className="lg:col-span-2"
          >
            <select
              className="input"
              name="destination_id"
              value={form.destinationId}
              onChange={(e) => {
                const next = destinations.find((d) => d.id === e.target.value);
                set({
                  destinationId: e.target.value,
                  toll: next ? money(next.toll_cents) : form.toll,
                });
              }}
            >
              <option value="">— none —</option>
              {destinations.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({formatMoney(d.toll_cents)})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Toll charge" hint="Override the preset for this trip.">
            <input
              className="input"
              name="toll"
              inputMode="decimal"
              value={form.toll}
              onChange={(e) => set({ toll: e.target.value })}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Destination as shown to the student">
            <input
              className="input"
              name="destination_label"
              defaultValue={reservation.destination_label}
            />
          </Field>

          <Field label="Reason for the trip">
            <input className="input" name="purpose" defaultValue={reservation.purpose} />
          </Field>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-bold text-ink">Rate</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Hourly rate">
            <input
              className="input"
              name="hourly_rate"
              inputMode="decimal"
              value={form.hourlyRate}
              onChange={(e) => set({ hourlyRate: e.target.value })}
            />
          </Field>
          <Field label="Daily cap" hint="Leave blank for straight hourly.">
            <input
              className="input"
              name="daily_cap"
              inputMode="decimal"
              value={form.dailyCap}
              onChange={(e) => set({ dailyCap: e.target.value })}
            />
          </Field>
        </div>

        {preview ? (
          <dl className="rounded-xl bg-parchment px-4 py-3 text-sm">
            <Row
              label={`Time (${preview.billableHours} hrs${preview.capApplied ? ", cap applied" : ""})`}
              cents={preview.timeChargeCents}
            />
            <Row label="Tolls" cents={preview.tollCents} />
            {reservation.adjustment_cents !== 0 ? (
              <Row label="Line items (unchanged)" cents={reservation.adjustment_cents} />
            ) : null}
            {reservation.late_fee_cents + reservation.fuel_fee_cents > 0 ? (
              <Row
                label="Return fees (unchanged)"
                cents={reservation.late_fee_cents + reservation.fuel_fee_cents}
              />
            ) : null}
            <div className="mt-1 flex justify-between border-t border-line pt-1.5">
              <dt className="font-bold text-ink">New total</dt>
              <dd className="font-bold tabular-nums text-ink">
                {formatMoney(
                  preview.totalCents +
                    reservation.late_fee_cents +
                    reservation.fuel_fee_cents,
                )}
              </dd>
            </div>
          </dl>
        ) : (
          <Alert tone="warn">Check the pickup and return times.</Alert>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="Office notes" hint="Only the office sees this.">
          <textarea
            className="input min-h-20 resize-y"
            name="admin_notes"
            defaultValue={reservation.admin_notes}
            rows={2}
          />
        </Field>
        <Field label="Decline reason" hint="Shown to the student if the status is Declined.">
          <input
            className="input"
            name="decline_reason"
            defaultValue={reservation.decline_reason}
          />
        </Field>
      </section>
    </form>
  );
}
