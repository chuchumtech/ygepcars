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
  { value: "approved", label: "Approved" },
  { value: "completed", label: "Completed" },
  { value: "declined", label: "Declined" },
  { value: "cancelled", label: "Cancelled" },
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
        <p className="mt-4 text-xs text-muted">
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
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

        {reservation.student ? (
          <Link
            href={`/admin/students/${reservation.student.id}`}
            className="btn-ghost btn-sm ml-auto"
          >
            Open student record
          </Link>
        ) : null}
      </div>

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

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <h3 className="mb-1 text-sm font-semibold text-slate-500">Trip</h3>
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
          <h3 className="mb-1 text-sm font-semibold text-slate-500">Charges</h3>
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
        <h3 className="mb-1 text-sm font-semibold text-slate-500">Student</h3>
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
          <h3 className="mb-1 text-sm font-semibold text-slate-500">Note from the student</h3>
          <p className="rounded-lg bg-navy-50 px-3 py-2 text-sm text-navy-800">
            {reservation.student_notes}
          </p>
        </div>
      ) : null}

      {reservation.admin_notes ? (
        <div>
          <h3 className="mb-1 text-sm font-semibold text-slate-500">Office notes</h3>
          <p className="rounded-lg bg-gold-50 px-3 py-2 text-sm text-navy-800">
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

      <section className="grid gap-4 sm:grid-cols-2">
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
        <h3 className="text-sm font-semibold text-slate-500">Destination and tolls</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Preset destination" hint="Changing this does not overwrite the toll below.">
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
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-500">Pricing</h3>
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
          <dl className="rounded-lg bg-navy-50 px-4 py-3 text-sm">
            <div className="flex justify-between py-0.5">
              <dt className="text-muted">
                Time ({preview.billableHours} hrs
                {preview.capApplied ? ", cap applied" : ""})
              </dt>
              <dd className="tabular-nums">{formatMoney(preview.timeChargeCents)}</dd>
            </div>
            <div className="flex justify-between py-0.5">
              <dt className="text-muted">Tolls</dt>
              <dd className="tabular-nums">{formatMoney(preview.tollCents)}</dd>
            </div>
            {preview.adjustmentCents !== 0 ? (
              <div className="flex justify-between py-0.5">
                <dt className="text-muted">Adjustment</dt>
                <dd className="tabular-nums">{formatMoney(preview.adjustmentCents)}</dd>
              </div>
            ) : null}
            <div className="mt-1 flex justify-between border-t border-navy-200 pt-1.5">
              <dt className="font-semibold text-navy-800">New total</dt>
              <dd className="font-bold tabular-nums text-navy-800">
                {formatMoney(preview.totalCents)}
              </dd>
            </div>
          </dl>
        ) : (
          <Alert tone="warn">Check the pickup and return times.</Alert>
        )}
      </section>

      <section className="space-y-4">
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
