"use client";

import { useActionState, useState } from "react";
import {
  retireDestinationAction,
  saveDestinationAction,
} from "@/app/actions/admin-fleet";
import type { ActionResult } from "@/app/actions/shared";
import { Modal } from "@/components/Modal";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert, Field } from "@/components/ui";
import { formatMoney } from "@/lib/pricing";
import type { Destination } from "@/lib/types";

export function DestinationsManager({
  destinations,
  usage,
}: {
  destinations: Destination[];
  usage: Record<string, number>;
}) {
  const [editing, setEditing] = useState<Destination | "new" | null>(null);

  const active = destinations.filter((d) => d.is_active);
  const retired = destinations.filter((d) => !d.is_active);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button type="button" className="btn-primary btn-sm" onClick={() => setEditing("new")}>
          Add a destination
        </button>
      </div>

      <DestinationTable
        title="In use"
        rows={active}
        usage={usage}
        onEdit={setEditing}
        emptyMessage="No destinations yet. Students cannot request a car until there is at least one."
      />

      {retired.length > 0 ? (
        <DestinationTable
          title="Retired"
          rows={retired}
          usage={usage}
          onEdit={setEditing}
          emptyMessage=""
        />
      ) : null}

      <DestinationDialog
        destination={editing === "new" ? null : editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

function DestinationTable({
  title,
  rows,
  usage,
  onEdit,
  emptyMessage,
}: {
  title: string;
  rows: Destination[];
  usage: Record<string, number>;
  onEdit: (destination: Destination) => void;
  emptyMessage: string;
}) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-soft">
        {title}
      </h2>

      {rows.length === 0 ? (
        <p className="card-pad text-sm text-ink-soft">{emptyMessage}</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[38rem]">
            <thead className="border-b border-line/70 bg-parchment">
              <tr>
                <th className="th">Destination</th>
                <th className="th text-right">Flat toll</th>
                <th className="th text-right">Times used</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70">
              {rows.map((destination) => (
                <tr key={destination.id} className="transition hover:bg-parchment">
                  <td className="td">
                    <p className="font-medium text-ink">{destination.name}</p>
                    {destination.description ? (
                      <p className="text-xs text-ink-soft">{destination.description}</p>
                    ) : null}
                  </td>
                  <td className="td text-right text-base font-bold tabular-nums text-gold-500">
                    {formatMoney(destination.toll_cents)}
                  </td>
                  <td className="td text-right tabular-nums text-ink-soft">
                    {usage[destination.id] ?? 0}
                  </td>
                  <td className="td">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() => onEdit(destination)}
                      >
                        Edit
                      </button>
                      <form action={retireDestinationAction}>
                        <input type="hidden" name="destination_id" value={destination.id} />
                        <input
                          type="hidden"
                          name="next_state"
                          value={destination.is_active ? "false" : "true"}
                        />
                        <button type="submit" className="btn-ghost btn-sm">
                          {destination.is_active ? "Retire" : "Bring back"}
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
    </section>
  );
}

function DestinationDialog({
  destination,
  open,
  onClose,
}: {
  destination: Destination | null;
  open: boolean;
  onClose: () => void;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(
    saveDestinationAction,
    {},
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="md"
      title={destination ? `Edit ${destination.name}` : "Add a destination"}
      subtitle="Changing a toll only affects new requests; existing reservations keep the price they were quoted."
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
          <SubmitButton form="destination-form" pendingLabel="Saving...">
            Save destination
          </SubmitButton>
        </>
      }
    >
      <form id="destination-form" action={action} className="space-y-4">
        <input type="hidden" name="destination_id" value={destination?.id ?? ""} />

        {state.error ? <Alert tone="error">{state.error}</Alert> : null}
        {state.success ? <Alert tone="success">{state.success}</Alert> : null}

        <Field label="Name">
          <input
            className="input"
            name="name"
            defaultValue={destination?.name ?? ""}
            placeholder="Lakewood, NJ"
            required
          />
        </Field>

        <Field label="Flat toll charge" hint="Dollars for the whole round trip. Use 0 for none.">
          <input
            className="input"
            name="toll"
            inputMode="decimal"
            defaultValue={destination ? (destination.toll_cents / 100).toFixed(2) : "0.00"}
            required
          />
        </Field>

        <Field label="Note for students" hint="Shown under the name when they pick it.">
          <input
            className="input"
            name="description"
            defaultValue={destination?.description ?? ""}
            placeholder="NJ Turnpike, round trip"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Sort order" hint="Lower numbers show first.">
            <input
              className="input"
              name="sort_order"
              inputMode="numeric"
              defaultValue={destination?.sort_order ?? 0}
            />
          </Field>
          <label className="flex items-end gap-2 pb-2.5 text-sm">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={destination?.is_active ?? true}
              className="h-4 w-4 accent-slate-500"
            />
            Offer this to students
          </label>
        </div>
      </form>
    </Modal>
  );
}
