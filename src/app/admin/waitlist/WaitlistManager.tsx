"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  convertWaitlistAction,
  deleteWaitlistAction,
  setWaitlistStatusAction,
} from "@/app/actions/waitlist";
import type { ActionResult } from "@/app/actions/shared";
import { Modal } from "@/components/Modal";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert, EmptyState, Field } from "@/components/ui";
import { formatDate, formatRange } from "@/lib/dates";
import { carColor } from "@/lib/calendar";
import type { Destination, Vehicle, WaitlistEntryWithRefs } from "@/lib/types";

const STATUS_STYLE: Record<string, string> = {
  waiting: "bg-amber-100 text-amber-800",
  offered: "bg-sky-100 text-sky-800",
  converted: "bg-emerald-100 text-emerald-800",
  expired: "bg-navy-100 text-muted",
  cancelled: "bg-navy-100 text-muted",
};

export function WaitlistManager({
  open,
  closed,
  vehicles,
  destinations,
}: {
  open: WaitlistEntryWithRefs[];
  closed: WaitlistEntryWithRefs[];
  vehicles: Vehicle[];
  destinations: Destination[];
}) {
  const [selected, setSelected] = useState<WaitlistEntryWithRefs | null>(null);

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
          Open ({open.length})
        </h2>
        {open.length === 0 ? (
          <EmptyState
            title="Nobody is waiting"
            description="When a student's window is already taken they can put their name down here."
          />
        ) : (
          <ol className="card divide-y divide-[var(--color-line)]">
            {open.map((entry, index) => (
              <li key={entry.id}>
                <WaitlistRow
                  entry={entry}
                  position={index + 1}
                  vehicles={vehicles}
                  onOpen={() => setSelected(entry)}
                />
              </li>
            ))}
          </ol>
        )}
      </section>

      {closed.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
            Closed
          </h2>
          <ul className="card divide-y divide-[var(--color-line)]">
            {closed.slice(0, 25).map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <span className="min-w-0">
                  <span className="font-medium text-navy-800">
                    {entry.student?.full_name ?? "Student"}
                  </span>
                  <span className="text-muted">
                    {" "}
                    · {formatRange(entry.starts_at, entry.ends_at)}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className={`chip ${STATUS_STYLE[entry.status]}`}>{entry.status}</span>
                  <form action={deleteWaitlistAction}>
                    <input type="hidden" name="waitlist_id" value={entry.id} />
                    <button type="submit" className="text-xs text-muted hover:text-red-700">
                      Remove
                    </button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ConvertDialog
        entry={selected}
        vehicles={vehicles}
        destinations={destinations}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function WaitlistRow({
  entry,
  position,
  vehicles,
  onOpen,
}: {
  entry: WaitlistEntryWithRefs;
  position: number;
  vehicles: Vehicle[];
  onOpen: () => void;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(
    setWaitlistStatusAction,
    {},
  );
  const vehicleIndex = vehicles.findIndex((v) => v.id === entry.vehicle_id);

  return (
    <div className="flex flex-wrap items-start gap-4 p-4">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy-100 text-xs font-bold text-navy-700">
        {position}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {entry.student ? (
            <Link
              href={`/admin/students/${entry.student.id}`}
              className="font-semibold text-navy-800 hover:underline"
            >
              {entry.student.full_name}
            </Link>
          ) : (
            <span className="font-semibold text-navy-800">Student</span>
          )}
          <span className={`chip ${STATUS_STYLE[entry.status]}`}>{entry.status}</span>
          {entry.flexible ? (
            <span className="chip bg-navy-100 text-navy-700">Times flexible</span>
          ) : null}
          {entry.vehicle_id === null ? (
            <span className="chip bg-navy-100 text-navy-700">Any car</span>
          ) : null}
        </div>

        <p className="mt-1 flex items-center gap-2 text-sm text-navy-800">
          {entry.vehicle_id ? (
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${carColor(Math.max(0, vehicleIndex)).dot}`}
              aria-hidden
            />
          ) : null}
          {entry.vehicle?.name ?? "Whichever frees up"}
        </p>

        <p className="text-sm text-muted">{formatRange(entry.starts_at, entry.ends_at)}</p>
        <p className="text-xs text-muted">
          {entry.destination_label || "No destination"} · {entry.purpose || "no reason given"} ·
          asked {formatDate(entry.created_at)}
        </p>

        {entry.student_notes ? (
          <p className="mt-2 rounded-lg bg-navy-50 px-3 py-2 text-xs text-navy-800">
            {entry.student_notes}
          </p>
        ) : null}

        {entry.student?.phone ? (
          <a href={`tel:${entry.student.phone}`} className="link mt-1 inline-block text-xs">
            {entry.student.phone}
          </a>
        ) : null}

        {state.error ? (
          <p className="mt-1 text-xs font-medium text-red-700">{state.error}</p>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-wrap gap-2">
        <button type="button" className="btn-primary btn-sm" onClick={onOpen}>
          Book them in
        </button>

        {entry.status !== "offered" ? (
          <form action={action}>
            <input type="hidden" name="waitlist_id" value={entry.id} />
            <input type="hidden" name="status" value="offered" />
            <SubmitButton className="btn-secondary btn-sm" pendingLabel="...">
              Mark offered
            </SubmitButton>
          </form>
        ) : null}

        <form action={action}>
          <input type="hidden" name="waitlist_id" value={entry.id} />
          <input type="hidden" name="status" value="expired" />
          <SubmitButton className="btn-ghost btn-sm" pendingLabel="...">
            Close out
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ConvertDialog({
  entry,
  vehicles,
  destinations,
  onClose,
}: {
  entry: WaitlistEntryWithRefs | null;
  vehicles: Vehicle[];
  destinations: Destination[];
  onClose: () => void;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(
    convertWaitlistAction,
    {},
  );

  if (!entry) return null;

  const destination = destinations.find((d) => d.id === entry.destination_id);

  return (
    <Modal
      open={Boolean(entry)}
      onClose={onClose}
      width="md"
      title={`Book in ${entry.student?.full_name ?? "this student"}`}
      subtitle={formatRange(entry.starts_at, entry.ends_at)}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
          <SubmitButton form="convert-waitlist" pendingLabel="Booking...">
            Create approved reservation
          </SubmitButton>
        </>
      }
    >
      <form id="convert-waitlist" action={action} className="space-y-4">
        <input type="hidden" name="waitlist_id" value={entry.id} />

        {state.error ? <Alert tone="error">{state.error}</Alert> : null}
        {state.success ? <Alert tone="success">{state.success}</Alert> : null}

        <Alert tone="info">
          Creates an approved reservation for exactly this window, priced from the
          car&apos;s current rates. If the window is not genuinely free, the database
          will refuse it and nothing changes.
        </Alert>

        <Field label="Which car are they getting?">
          <select
            className="input"
            name="vehicle_id"
            defaultValue={entry.vehicle_id ?? vehicles[0]?.id ?? ""}
            required
          >
            {vehicles
              .filter((vehicle) => vehicle.is_active)
              .map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.name}
                </option>
              ))}
          </select>
        </Field>

        <dl className="rounded-lg bg-navy-50 px-4 py-3 text-sm">
          <div className="flex justify-between py-0.5">
            <dt className="text-muted">Heading to</dt>
            <dd>{entry.destination_label || "not set"}</dd>
          </div>
          <div className="flex justify-between py-0.5">
            <dt className="text-muted">Tolls will be</dt>
            <dd>{destination ? `$${(destination.toll_cents / 100).toFixed(2)}` : "$0.00"}</dd>
          </div>
          <div className="flex justify-between py-0.5">
            <dt className="text-muted">Reason</dt>
            <dd>{entry.purpose || "not given"}</dd>
          </div>
        </dl>
      </form>
    </Modal>
  );
}
