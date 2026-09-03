"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  deleteIncidentAction,
  resolveIncidentAction,
  saveIncidentAction,
} from "@/app/actions/incidents";
import type { ActionResult } from "@/app/actions/shared";
import { Modal } from "@/components/Modal";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert, EmptyState, Field } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/pricing";
import {
  INCIDENT_KINDS,
  type IncidentWithRefs,
  type Profile,
  type Vehicle,
} from "@/lib/types";

export function IncidentsManager({
  incidents,
  vehicles,
  students,
}: {
  incidents: IncidentWithRefs[];
  vehicles: Vehicle[];
  students: Pick<Profile, "id" | "full_name" | "email">[];
}) {
  const [editing, setEditing] = useState<IncidentWithRefs | "new" | null>(null);

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button type="button" className="btn-primary btn-sm" onClick={() => setEditing("new")}>
          Log an incident
        </button>
      </div>

      {incidents.length === 0 ? (
        <EmptyState
          title="Nothing logged"
          description="Damage, a ticket or a car left dirty gets recorded here, with an optional charge to the student."
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[52rem]">
            <thead className="border-b border-line/70 bg-parchment">
              <tr>
                <th className="th">When</th>
                <th className="th">Car</th>
                <th className="th">What happened</th>
                <th className="th">Charged to</th>
                <th className="th text-right">Charge</th>
                <th className="th">Status</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70">
              {incidents.map((incident) => (
                <tr key={incident.id} className="transition hover:bg-parchment">
                  <td className="td whitespace-nowrap">{formatDate(incident.occurred_on)}</td>
                  <td className="td">{incident.vehicle?.name ?? "--"}</td>
                  <td className="td max-w-80">
                    <p className="font-semibold capitalize text-ink">
                      {INCIDENT_KINDS.find((k) => k.value === incident.kind)?.label ??
                        incident.kind}
                    </p>
                    {incident.description ? (
                      <p className="truncate text-xs text-ink-soft">{incident.description}</p>
                    ) : null}
                  </td>
                  <td className="td">
                    {incident.student ? (
                      <Link
                        href={`/admin/students/${incident.student.id}`}
                        className="font-medium text-ink hover:underline"
                      >
                        {incident.student.full_name}
                      </Link>
                    ) : (
                      <span className="text-ink-soft">Nobody</span>
                    )}
                  </td>
                  <td className="td text-right font-semibold tabular-nums">
                    {incident.charge_cents > 0 ? formatMoney(incident.charge_cents) : "--"}
                  </td>
                  <td className="td">
                    <span
                      className={`chip ${
                        incident.status === "open"
                          ? "bg-warn-light text-warn"
                          : "bg-good-light text-good"
                      }`}
                    >
                      {incident.status}
                    </span>
                  </td>
                  <td className="td">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() => setEditing(incident)}
                      >
                        Edit
                      </button>
                      <form action={resolveIncidentAction}>
                        <input type="hidden" name="incident_id" value={incident.id} />
                        <input
                          type="hidden"
                          name="next_status"
                          value={incident.status === "open" ? "resolved" : "open"}
                        />
                        <button type="submit" className="btn-ghost btn-sm">
                          {incident.status === "open" ? "Resolve" : "Reopen"}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <IncidentDialog
        incident={editing === "new" ? null : editing}
        open={editing !== null}
        vehicles={vehicles}
        students={students}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

function IncidentDialog({
  incident,
  open,
  vehicles,
  students,
  onClose,
}: {
  incident: IncidentWithRefs | null;
  open: boolean;
  vehicles: Vehicle[];
  students: Pick<Profile, "id" | "full_name" | "email">[];
  onClose: () => void;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(saveIncidentAction, {});

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="lg"
      title={incident ? "Edit incident" : "Log an incident"}
      subtitle="A charge here appears on the student's statement alongside their rentals."
      footer={
        <>
          {incident ? (
            <form action={deleteIncidentAction} className="mr-auto">
              <input type="hidden" name="incident_id" value={incident.id} />
              <button
                type="submit"
                className="btn-danger btn-sm"
                onClick={(event) => {
                  if (!confirm("Delete this incident for good?")) event.preventDefault();
                  else onClose();
                }}
              >
                Delete
              </button>
            </form>
          ) : null}
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
          <SubmitButton form="incident-form" pendingLabel="Saving...">
            Save incident
          </SubmitButton>
        </>
      }
    >
      <form id="incident-form" action={action} className="space-y-4">
        <input type="hidden" name="incident_id" value={incident?.id ?? ""} />
        <input
          type="hidden"
          name="reservation_id"
          value={incident?.reservation_id ?? ""}
        />

        {state.error ? <Alert tone="error">{state.error}</Alert> : null}
        {state.success ? <Alert tone="success">{state.success}</Alert> : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Car">
            <select
              className="input"
              name="vehicle_id"
              defaultValue={incident?.vehicle_id ?? vehicles[0]?.id ?? ""}
              required
            >
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="What happened">
            <select className="input" name="kind" defaultValue={incident?.kind ?? "damage"}>
              {INCIDENT_KINDS.map((kind) => (
                <option key={kind.value} value={kind.value}>
                  {kind.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="When">
            <input
              className="input"
              type="date"
              name="occurred_on"
              defaultValue={
                incident?.occurred_on ?? new Date().toISOString().slice(0, 10)
              }
            />
          </Field>

          <Field label="Who was driving" hint="Leave blank if nobody is at fault.">
            <select className="input" name="user_id" defaultValue={incident?.user_id ?? ""}>
              <option value="">— nobody —</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.full_name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Charge" hint="Leave at 0 for no charge.">
            <input
              className="input"
              name="charge"
              inputMode="decimal"
              defaultValue={incident ? (incident.charge_cents / 100).toFixed(2) : "0.00"}
            />
          </Field>

          <Field label="Status">
            <select className="input" name="status" defaultValue={incident?.status ?? "open"}>
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
            </select>
          </Field>
        </div>

        <Field label="What happened, in words">
          <textarea
            className="input min-h-24 resize-y"
            name="description"
            rows={3}
            defaultValue={incident?.description ?? ""}
            placeholder="Scrape on the rear passenger door, noticed at check-in."
          />
        </Field>

        <Field label="How it was resolved" hint="Fill in when you close it out.">
          <input className="input" name="resolution" defaultValue={incident?.resolution ?? ""} />
        </Field>

      </form>
    </Modal>
  );
}
