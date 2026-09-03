"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import {
  decideReservationAction,
  deleteReservationAction,
  updateReservationAction,
} from "@/app/actions/admin-reservations";
import type { ActionResult } from "@/app/actions/shared";
import { Modal } from "@/components/Modal";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert, DetailRow, Field, StatusBadge } from "@/components/ui";
import {
  describeDuration,
  formatDateTime,
  formatRange,
  halfHourOptions,
  hoursBetween,
  instantToLocalParts,
  localToInstant,
} from "@/lib/dates";
import { formatMoney, parseMoneyToCents, quote } from "@/lib/pricing";
import type { Destination, Vehicle } from "@/lib/types";
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
  const [decideState, decideAction] = useActionState<ActionResult, FormData>(
    decideReservationAction,
    {},
  );
  const [editState, editAction] = useActionState<ActionResult, FormData>(
    updateReservationAction,
    {},
  );

  if (!reservation) return null;

  const editing = editingId === reservation.id;

  const start = instantToLocalParts(reservation.starts_at);
  const end = instantToLocalParts(reservation.ends_at);
  const hours = hoursBetween(reservation.starts_at, reservation.ends_at);

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
            <button type="button" className="btn-secondary" onClick={() => setEditingId(null)}>
              Cancel
            </button>
            <SubmitButton form="reservation-edit" pendingLabel="Saving...">
              Save changes
            </SubmitButton>
          </>
        ) : (
          <>
            <form action={deleteReservationAction} className="mr-auto">
              <input type="hidden" name="reservation_id" value={reservation.id} />
              <button
                type="submit"
                className="btn-danger btn-sm"
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
                Delete
              </button>
            </form>
            <button type="button" className="btn-secondary" onClick={() => setEditingId(reservation.id)}>
              Edit details
            </button>
            <button type="button" className="btn-primary" onClick={onClose}>
              Done
            </button>
          </>
        )
      }
    >
      {decideState.error ? <Alert tone="error">{decideState.error}</Alert> : null}
      {decideState.success ? <Alert tone="success">{decideState.success}</Alert> : null}
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
        <ReadView reservation={reservation} hours={hours} decideAction={decideAction} />
      )}

      {!editing ? (
        <p className="mt-4 text-xs text-ink-soft">
          Pickup {formatDateTime(reservation.starts_at)} ({start.date} {start.time}) ·
          Return {formatDateTime(reservation.ends_at)} ({end.date} {end.time})
        </p>
      ) : null}
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

function ReadView({
  reservation,
  hours,
  decideAction,
}: {
  reservation: AdminReservation;
  hours: number;
  decideAction: (formData: FormData) => void;
}) {
  const [declining, setDeclining] = useState(false);
  const [holding, setHolding] = useState(false);
  const [releasing, setReleasing] = useState(false);

  const occupiesCar = ["hold", "approved", "completed"].includes(reservation.status);

  return (
    <div className="space-y-5">
      {reservation.status === "hold" ? (
        <Alert tone="info" title="This car is on hold">
          {reservation.hold_expires_at
            ? `Meant to be revisited by ${formatDateTime(reservation.hold_expires_at)}. It keeps blocking the car until you approve or release it, so a forgotten hold never quietly hands the car to somebody else.`
            : "Nobody else can book this car until you approve or release it."}
        </Alert>
      ) : null}

      {reservation.status === "pending" ? (
        <Alert
          tone={reservation.payment_received_at ? "success" : "warn"}
          title={
            reservation.payment_received_at
              ? "Paid — the car is held"
              : "Unpaid — the car is only held for a while"
          }
        >
          {reservation.payment_received_at
            ? `Payment recorded ${formatDateTime(reservation.payment_received_at)}, so this car stays out of the pool.`
            : `Requested ${formatDateTime(reservation.requested_at)}. The car is blocked for this student for the hold window set in Settings; once that runs out the car returns to the pool while this request stays pending.`}
        </Alert>
      ) : null}

      {reservation.status === "released" && reservation.release_reason ? (
        <Alert tone="info" title="Released">
          {reservation.release_reason}
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {reservation.status !== "hold" && reservation.status !== "completed" ? (
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => {
              setHolding((value) => !value);
              setReleasing(false);
              setDeclining(false);
            }}
          >
            Put on hold
          </button>
        ) : null}

        {occupiesCar ? (
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => {
              setReleasing((value) => !value);
              setHolding(false);
              setDeclining(false);
            }}
          >
            Release the car
          </button>
        ) : null}

        {reservation.status !== "approved" ? (
          <form action={decideAction}>
            <input type="hidden" name="reservation_id" value={reservation.id} />
            <input type="hidden" name="decision" value="approved" />
            <SubmitButton className="btn-primary btn-sm" pendingLabel="Approving...">
              Approve
            </SubmitButton>
          </form>
        ) : null}

        {reservation.status === "approved" ? (
          <form action={decideAction}>
            <input type="hidden" name="reservation_id" value={reservation.id} />
            <input type="hidden" name="decision" value="completed" />
            <SubmitButton className="btn-secondary btn-sm" pendingLabel="Closing...">
              Mark returned
            </SubmitButton>
          </form>
        ) : null}

        {reservation.status !== "declined" ? (
          <button
            type="button"
            className="btn-danger btn-sm"
            onClick={() => setDeclining((value) => !value)}
          >
            Decline
          </button>
        ) : null}

        {["pending", "approved"].includes(reservation.status) ? (
          <form action={decideAction}>
            <input type="hidden" name="reservation_id" value={reservation.id} />
            <input type="hidden" name="decision" value="cancelled" />
            <SubmitButton className="btn-secondary btn-sm" pendingLabel="Cancelling...">
              Cancel
            </SubmitButton>
          </form>
        ) : null}

        <form action={decideAction}>
          <input type="hidden" name="reservation_id" value={reservation.id} />
          <input type="hidden" name="current_status" value={reservation.status} />
          <input
            type="hidden"
            name="decision"
            value={reservation.payment_received_at ? "mark_unpaid" : "mark_paid"}
          />
          <SubmitButton className="btn-secondary btn-sm" pendingLabel="...">
            {reservation.payment_received_at ? "Mark unpaid" : "Mark as paid"}
          </SubmitButton>
        </form>

        {reservation.student ? (
          <Link
            href={`/admin/students/${reservation.student.id}`}
            className="btn-ghost btn-sm ml-auto"
          >
            Open student record
          </Link>
        ) : null}
      </div>

      {holding ? (
        <form action={decideAction} className="card-pad space-y-3 bg-gold-50/60">
          <input type="hidden" name="reservation_id" value={reservation.id} />
          <input type="hidden" name="decision" value="hold" />
          <p className="text-sm text-ink">
            The car is blocked for this student while it is held, exactly as if it
            were booked. Nothing is charged until you approve it.
          </p>
          <Field
            label="Revisit by (optional)"
            hint="Just a reminder for you — a lapsed hold keeps the car blocked until you act on it."
          >
            <input className="input" type="date" name="hold_expires_at" />
          </Field>
          <SubmitButton className="btn-primary btn-sm" pendingLabel="Holding...">
            Hold this car
          </SubmitButton>
        </form>
      ) : null}

      {releasing ? (
        <form action={decideAction} className="card-pad space-y-3 bg-parchment">
          <input type="hidden" name="reservation_id" value={reservation.id} />
          <input type="hidden" name="decision" value="released" />
          <p className="text-sm text-ink">
            Frees the car straight away so somebody else can take this window. The
            record stays on the student&apos;s history, and nothing is charged.
          </p>
          <Field label="Why is it being released? (optional)">
            <input
              className="input"
              name="release_reason"
              placeholder="Student changed plans, giving it to someone on the waitlist"
              autoFocus
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <SubmitButton className="btn-primary btn-sm" pendingLabel="Releasing...">
              Release the car
            </SubmitButton>
            <Link href="/admin/waitlist" className="btn-secondary btn-sm">
              See who is waiting
            </Link>
          </div>
        </form>
      ) : null}

      {declining ? (
        <form action={decideAction} className="card-pad space-y-3 bg-red-50/50">
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

      <div className="rounded-lg border border-gold-200 bg-gold-50 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gold-600">
          Reason for the trip
        </p>
        <p className="mt-0.5 text-sm font-medium text-ink">
          {reservation.purpose || "The student did not give one."}
        </p>
        {reservation.destination_label ? (
          <p className="mt-1 text-sm text-ink-soft">Heading to {reservation.destination_label}</p>
        ) : null}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <h3 className="mb-1 text-sm font-semibold text-ink">Trip</h3>
          <dl>
            <DetailRow label="Car">{reservation.vehicle?.name ?? "--"}</DetailRow>
            <DetailRow label="Out">{formatDateTime(reservation.starts_at)}</DetailRow>
            <DetailRow label="Back">{formatDateTime(reservation.ends_at)}</DetailRow>
            <DetailRow label="Length">{describeDuration(hours)}</DetailRow>
            <DetailRow label="Heading to">{reservation.destination_label || "--"}</DetailRow>
            <DetailRow label="Reason">{reservation.purpose || "--"}</DetailRow>
          </dl>
        </div>

        <div>
          <h3 className="mb-1 text-sm font-semibold text-ink">Charges</h3>
          <dl>
            <DetailRow label={`Time (${reservation.billable_hours} hrs)`}>
              {formatMoney(reservation.time_charge_cents)}
            </DetailRow>
            <DetailRow label="Tolls">{formatMoney(reservation.toll_cents)}</DetailRow>
            {reservation.adjustment_cents !== 0 ? (
              <DetailRow label={reservation.adjustment_reason || "Adjustment"}>
                {formatMoney(reservation.adjustment_cents)}
              </DetailRow>
            ) : null}
            <DetailRow label="Total">
              <span className="text-base font-bold">
                {formatMoney(reservation.total_cents)}
              </span>
            </DetailRow>
            <DetailRow label="Rate used">
              {formatMoney(reservation.hourly_rate_cents)}/hr
              {reservation.daily_cap_cents
                ? `, ${formatMoney(reservation.daily_cap_cents)} cap`
                : ""}
            </DetailRow>
          </dl>
        </div>
      </div>

      <div>
        <h3 className="mb-1 text-sm font-semibold text-ink">Student</h3>
        <dl>
          <DetailRow label="Name">{reservation.student?.full_name ?? "--"}</DetailRow>
          <DetailRow label="Phone">
            {reservation.student?.phone ? (
              <a href={`tel:${reservation.student.phone}`} className="link">
                {reservation.student.phone}
              </a>
            ) : (
              "--"
            )}
          </DetailRow>
          <DetailRow label="Email">
            {reservation.student?.email ? (
              <a href={`mailto:${reservation.student.email}`} className="link">
                {reservation.student.email}
              </a>
            ) : (
              "--"
            )}
          </DetailRow>
          <DetailRow label="Requested">{formatDateTime(reservation.requested_at)}</DetailRow>
        </dl>
      </div>

      {reservation.student_notes ? (
        <div>
          <h3 className="mb-1 text-sm font-semibold text-ink">Note from the student</h3>
          <p className="rounded-lg bg-parchment px-3 py-2 text-sm text-ink">
            {reservation.student_notes}
          </p>
        </div>
      ) : null}

      {reservation.admin_notes ? (
        <div>
          <h3 className="mb-1 text-sm font-semibold text-ink">Office notes</h3>
          <p className="rounded-lg bg-gold-50 px-3 py-2 text-sm text-ink">
            {reservation.admin_notes}
          </p>
        </div>
      ) : null}

      {reservation.decline_reason ? (
        <Alert tone="error" title="Declined">
          {reservation.decline_reason}
        </Alert>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

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
    adjustment: money(reservation.adjustment_cents),
  });

  const vehicle = vehicles.find((v) => v.id === form.vehicleId);

  // Mirrors what the server will recompute, so the office sees the new total
  // before saving rather than after.
  const preview = useMemo(() => {
    const startsAt = localToInstant(form.startDate, form.startTime);
    const endsAt = localToInstant(form.endDate, form.endTime);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      return null;
    }
    return quote({
      startsAt,
      endsAt,
      hourlyRateCents: parseMoneyToCents(form.hourlyRate) ?? 0,
      dailyCapCents: form.dailyCap === "" ? null : parseMoneyToCents(form.dailyCap),
      minimumHours: Number(vehicle?.minimum_hours) || 1,
      tollCents: parseMoneyToCents(form.toll) ?? 0,
      adjustmentCents: parseMoneyToCents(form.adjustment) ?? 0,
    });
  }, [form, vehicle?.minimum_hours]);

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

        <Field label="Picks up">
          <div className="flex gap-2">
            <input
              type="date"
              className="input"
              name="start_date"
              value={form.startDate}
              onChange={(e) => set({ startDate: e.target.value })}
              required
            />
            <select
              className="input w-32 shrink-0"
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
          </div>
        </Field>

        <Field label="Returns">
          <div className="flex gap-2">
            <input
              type="date"
              className="input"
              name="end_date"
              value={form.endDate}
              onChange={(e) => set({ endDate: e.target.value })}
              required
            />
            <select
              className="input w-32 shrink-0"
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
          </div>
        </Field>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-ink">Destination and tolls</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Preset destination" hint="Changing this does not overwrite the toll below." className="lg:col-span-2">
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
        <h3 className="text-sm font-semibold text-ink">Pricing</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
          <Field label="Adjustment" hint="Negative for a discount, e.g. -10.">
            <input
              className="input"
              name="adjustment"
              inputMode="decimal"
              value={form.adjustment}
              onChange={(e) => set({ adjustment: e.target.value })}
            />
          </Field>
          <Field label="Adjustment reason">
            <input
              className="input"
              name="adjustment_reason"
              defaultValue={reservation.adjustment_reason}
              placeholder="Returned late, cleaning fee, discount"
            />
          </Field>
        </div>

        {preview ? (
          <dl className="rounded-lg bg-parchment px-4 py-3 text-sm">
            <div className="flex justify-between py-0.5">
              <dt className="text-ink-soft">
                Time ({preview.billableHours} hrs
                {preview.capApplied ? ", cap applied" : ""})
              </dt>
              <dd className="tabular-nums">{formatMoney(preview.timeChargeCents)}</dd>
            </div>
            <div className="flex justify-between py-0.5">
              <dt className="text-ink-soft">Tolls</dt>
              <dd className="tabular-nums">{formatMoney(preview.tollCents)}</dd>
            </div>
            {preview.adjustmentCents !== 0 ? (
              <div className="flex justify-between py-0.5">
                <dt className="text-ink-soft">Adjustment</dt>
                <dd className="tabular-nums">{formatMoney(preview.adjustmentCents)}</dd>
              </div>
            ) : null}
            <div className="mt-1 flex justify-between border-t border-navy-200 pt-1.5">
              <dt className="font-semibold text-ink">New total</dt>
              <dd className="font-bold tabular-nums text-ink">
                {formatMoney(preview.totalCents)}
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
