"use client";

import Image from "next/image";
import { useActionState, useMemo, useState } from "react";
import { saveVehicleAction, toggleVehicleAction } from "@/app/actions/admin-fleet";
import {
  createBlackoutAction,
  deleteBlackoutAction,
} from "@/app/actions/admin-reservations";
import type { ActionResult } from "@/app/actions/shared";
import { Modal } from "@/components/Modal";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert, Field } from "@/components/ui";
import { formatDateTime, halfHourOptions, todayLocal } from "@/lib/dates";
import { formatMoney } from "@/lib/pricing";
import { carColor } from "@/lib/calendar";
import type { Blackout, Vehicle } from "@/lib/types";

type BlackoutRow = Blackout & { vehicle: { name: string } | null };

export function CarsManager({
  vehicles,
  blackouts,
}: {
  vehicles: Vehicle[];
  blackouts: BlackoutRow[];
}) {
  const [editing, setEditing] = useState<Vehicle | "new" | null>(null);
  const [blocking, setBlocking] = useState(false);

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
            The fleet
          </h2>
          <button type="button" className="btn-primary btn-sm" onClick={() => setEditing("new")}>
            Add a car
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {vehicles.map((vehicle, index) => (
            <article key={vehicle.id} className="card overflow-hidden">
              <div className="flex gap-4 p-4">
                {vehicle.image_url ? (
                  <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-parchment-deep">
                    <Image
                      src={vehicle.image_url}
                      alt=""
                      fill
                      sizes="7rem"
                      className={`object-cover ${vehicle.is_active ? "" : "grayscale"}`}
                    />
                  </div>
                ) : null}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${carColor(index).dot}`}
                      aria-hidden
                    />
                    <h3 className="truncate font-bold text-ink">{vehicle.name}</h3>
                    {!vehicle.is_active ? (
                      <span className="chip bg-parchment-deep text-ink-soft">Hidden</span>
                    ) : null}
                  </div>

                  <p className="mt-0.5 truncate text-sm text-ink-soft">
                    {[vehicle.color, vehicle.license_plate, vehicle.seats ? `${vehicle.seats} seats` : null]
                      .filter(Boolean)
                      .join(" · ") || "No details yet"}
                  </p>

                  <p className="mt-2 text-sm">
                    <span className="font-bold text-ink">
                      {formatMoney(vehicle.hourly_rate_cents)}
                    </span>
                    <span className="text-ink-soft">/hr</span>
                    {vehicle.daily_cap_cents ? (
                      <span className="text-ink-soft">
                        {" "}
                        · {formatMoney(vehicle.daily_cap_cents)} daily cap
                      </span>
                    ) : (
                      <span className="text-ink-soft"> · no daily cap</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex gap-2 border-t border-line/70 bg-parchment/50 px-4 py-2.5">
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => setEditing(vehicle)}
                >
                  Edit
                </button>
                <form action={toggleVehicleAction}>
                  <input type="hidden" name="vehicle_id" value={vehicle.id} />
                  <input
                    type="hidden"
                    name="next_state"
                    value={vehicle.is_active ? "false" : "true"}
                  />
                  <button type="submit" className="btn-ghost btn-sm">
                    {vehicle.is_active ? "Hide from students" : "Show to students"}
                  </button>
                </form>
              </div>
            </article>
          ))}

          {vehicles.length === 0 ? (
            <p className="card-pad text-sm text-ink-soft">
              No cars yet. Add the first one so students can book.
            </p>
          ) : null}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
            Out of service
          </h2>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => setBlocking(true)}
          >
            Block off a car
          </button>
        </div>

        {blackouts.length === 0 ? (
          <p className="card-pad text-sm text-ink-soft">
            Nothing blocked off. Use this for oil changes, inspections, or when
            staff need a car.
          </p>
        ) : (
          <div className="card divide-y divide-line/70">
            {blackouts.map((blackout) => (
              <div
                key={blackout.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-ink">
                    {blackout.vehicle?.name ?? "Car"} — {blackout.reason || "Out of service"}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {formatDateTime(blackout.starts_at)} to {formatDateTime(blackout.ends_at)}
                  </p>
                </div>
                <form action={deleteBlackoutAction}>
                  <input type="hidden" name="blackout_id" value={blackout.id} />
                  <button type="submit" className="btn-ghost btn-sm">
                    Remove
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>

      <VehicleDialog
        vehicle={editing === "new" ? null : editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
      />

      <BlackoutDialog
        open={blocking}
        vehicles={vehicles}
        onClose={() => setBlocking(false)}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function VehicleDialog({
  vehicle,
  open,
  onClose,
}: {
  vehicle: Vehicle | null;
  open: boolean;
  onClose: () => void;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(saveVehicleAction, {});

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={vehicle ? `Edit ${vehicle.name}` : "Add a car"}
      subtitle="Rates here become the default quote students see."
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
          <SubmitButton form="vehicle-form" pendingLabel="Saving...">
            Save car
          </SubmitButton>
        </>
      }
    >
      <form id="vehicle-form" action={action} className="space-y-4">
        <input type="hidden" name="vehicle_id" value={vehicle?.id ?? ""} />

        {state.error ? <Alert tone="error">{state.error}</Alert> : null}
        {state.success ? <Alert tone="success">{state.success}</Alert> : null}

        <Field label="Name as students see it">
          <input
            className="input"
            name="name"
            defaultValue={vehicle?.name ?? ""}
            placeholder="2023 Subaru Legacy"
            required
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Year">
            <input className="input" name="year" inputMode="numeric" defaultValue={vehicle?.year ?? ""} />
          </Field>
          <Field label="Make">
            <input className="input" name="make" defaultValue={vehicle?.make ?? ""} />
          </Field>
          <Field label="Model">
            <input className="input" name="model" defaultValue={vehicle?.model ?? ""} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Colour">
            <input className="input" name="color" defaultValue={vehicle?.color ?? ""} />
          </Field>
          <Field label="Plate">
            <input
              className="input"
              name="license_plate"
              defaultValue={vehicle?.license_plate ?? ""}
            />
          </Field>
          <Field label="Seats">
            <input
              className="input"
              name="seats"
              inputMode="numeric"
              defaultValue={vehicle?.seats ?? ""}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Hourly rate" hint="Dollars, e.g. 15">
            <input
              className="input"
              name="hourly_rate"
              inputMode="decimal"
              defaultValue={vehicle ? (vehicle.hourly_rate_cents / 100).toFixed(2) : "15.00"}
              required
            />
          </Field>
          <Field label="Daily cap" hint="Blank = straight hourly.">
            <input
              className="input"
              name="daily_cap"
              inputMode="decimal"
              defaultValue={
                vehicle?.daily_cap_cents ? (vehicle.daily_cap_cents / 100).toFixed(2) : ""
              }
            />
          </Field>
          <Field label="Minimum hours">
            <input
              className="input"
              name="minimum_hours"
              inputMode="decimal"
              defaultValue={vehicle?.minimum_hours ?? 1}
            />
          </Field>
        </div>

        <Field label="Photo path" hint="A file under /public, e.g. /cars/subaru_legacy_blue.jpg">
          <input className="input" name="image_url" defaultValue={vehicle?.image_url ?? ""} />
        </Field>

        <Field label="Notes" hint="Only the office sees this.">
          <textarea
            className="input min-h-20 resize-y"
            name="notes"
            rows={2}
            defaultValue={vehicle?.notes ?? ""}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Sort order" hint="Lower numbers show first.">
            <input
              className="input"
              name="sort_order"
              inputMode="numeric"
              defaultValue={vehicle?.sort_order ?? 0}
            />
          </Field>
          <label className="flex items-end gap-2 pb-2.5 text-sm">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={vehicle?.is_active ?? true}
              className="h-4 w-4 accent-slate-500"
            />
            Students can book this car
          </label>
        </div>
      </form>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

function BlackoutDialog({
  open,
  vehicles,
  onClose,
}: {
  open: boolean;
  vehicles: Vehicle[];
  onClose: () => void;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(createBlackoutAction, {});
  const times = useMemo(() => halfHourOptions(), []);
  const today = todayLocal();

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="md"
      title="Block off a car"
      subtitle="Nobody can book it while it is blocked."
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
          <SubmitButton form="blackout-form" pendingLabel="Saving...">
            Block it off
          </SubmitButton>
        </>
      }
    >
      <form id="blackout-form" action={action} className="space-y-4">
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}
        {state.success ? <Alert tone="success">{state.success}</Alert> : null}

        <Field label="Car">
          <select className="input" name="vehicle_id" required defaultValue="">
            <option value="" disabled>
              Choose a car
            </option>
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="From">
          <div className="flex gap-2">
            <input type="date" className="input" name="start_date" defaultValue={today} required />
            <select className="input w-32 shrink-0" name="start_time" defaultValue="08:00">
              {times.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </Field>

        <Field label="Until">
          <div className="flex gap-2">
            <input type="date" className="input" name="end_date" defaultValue={today} required />
            <select className="input w-32 shrink-0" name="end_time" defaultValue="17:00">
              {times.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </Field>

        <Field label="Reason">
          <input className="input" name="reason" placeholder="Oil change, inspection, staff use" />
        </Field>
      </form>
    </Modal>
  );
}
