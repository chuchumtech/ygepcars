"use client";

import { useState } from "react";
import {
  toggleOffShabbosAction,
  updateOffShabbosLabelAction,
} from "@/app/actions/shabbosim";
import { SubmitButton } from "@/components/SubmitButton";
import { formatDate } from "@/lib/dates";
import { todayLocal } from "@/lib/dates";
import type { ShabbosRow } from "./page";

const PRESETS = ["Bein hazmanim", "Yeshiva closed", "Shabbos at home", "Off"];

/** Which days this off Shabbos actually covers, in words. */
function coverage(row: ShabbosRow): string {
  if (row.includesFriday && row.includesSunday) return "Friday to Sunday";
  if (row.includesFriday) return "From Friday";
  if (row.includesSunday) return "Through Sunday";
  return "Shabbos only";
}

/**
 * The whole point is that the office never types a date. Every Shabbos for the
 * next few months is listed with its parsha already worked out; marking one off
 * is a single click on the row.
 */
export function ShabbosimManager({ rows }: { rows: ShabbosRow[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const today = todayLocal();

  const past = rows.filter((r) => r.date < today);
  const upcoming = rows.filter((r) => r.date >= today);
  const offCount = rows.filter((r) => r.offLabel).length;

  return (
    <div className="space-y-6">
      <p className="text-sm text-ink-soft">
        {offCount === 0
          ? "Nothing marked off yet."
          : `${offCount} marked off in this window.`}
      </p>

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-ink-soft">
          Coming up
        </h2>
        <ul className="card divide-y divide-line/70">
          {upcoming.map((row) => (
            <li key={row.date}>
              <ShabbosRowItem
                row={row}
                editing={editing === row.date}
                onEdit={() => setEditing(editing === row.date ? null : row.date)}
              />
            </li>
          ))}
        </ul>
      </section>

      {past.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-ink-soft">
            Just gone
          </h2>
          <ul className="card divide-y divide-line/70 opacity-70">
            {past.map((row) => (
              <li key={row.date}>
                <ShabbosRowItem
                  row={row}
                  editing={editing === row.date}
                  onEdit={() => setEditing(editing === row.date ? null : row.date)}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function ShabbosRowItem({
  row,
  editing,
  onEdit,
}: {
  row: ShabbosRow;
  editing: boolean;
  onEdit: () => void;
}) {
  const isOff = row.offLabel !== null;

  return (
    <div className={`p-4 ${isOff ? "bg-brand-light/40" : ""}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-bold text-ink">{formatDate(`${row.date}T12:00:00Z`)}</span>
            {row.hebrew ? (
              <span className="text-sm text-ink-soft" dir="rtl">
                {row.hebrew}
              </span>
            ) : null}
            {isOff ? (
              <>
                <span className="chip bg-brand text-white">{row.offLabel}</span>
                <span className="text-xs font-semibold text-ink-soft">
                  {coverage(row)}
                </span>
              </>
            ) : null}
          </div>

          <p className="mt-0.5 text-sm text-ink-soft">
            {row.parsha ? (
              <>
                Parshas{" "}
                <strong className="font-semibold text-ink" dir="rtl">
                  {row.parsha}
                </strong>
              </>
            ) : row.holiday ? (
              <strong className="font-semibold text-gold" dir="rtl">
                {row.holiday}
              </strong>
            ) : (
              "—"
            )}
            {row.note ? ` · ${row.note}` : ""}
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          {isOff ? (
            <button type="button" className="btn-secondary btn-sm" onClick={onEdit}>
              {editing ? "Close" : "Edit"}
            </button>
          ) : null}

          <form action={toggleOffShabbosAction}>
            <input type="hidden" name="shabbos_on" value={row.date} />
            <input type="hidden" name="next_state" value={isOff ? "on" : "off"} />
            <input type="hidden" name="label" value="Off" />
            <SubmitButton
              className={isOff ? "btn-ghost btn-sm" : "btn-secondary btn-sm"}
              pendingLabel="..."
            >
              {isOff ? "Not off after all" : "Mark off"}
            </SubmitButton>
          </form>
        </div>
      </div>

      {editing ? (
        <form
          action={updateOffShabbosLabelAction}
          className="mt-3 grid gap-3 border-t border-line/70 pt-3 sm:grid-cols-[12rem_1fr_auto_auto] sm:items-end"
        >
          <input type="hidden" name="shabbos_on" value={row.date} />

          <label className="block">
            <span className="label">What kind</span>
            <input
              className="input"
              name="label"
              defaultValue={row.offLabel ?? "Off"}
              list={`presets-${row.date}`}
            />
            <datalist id={`presets-${row.date}`}>
              {PRESETS.map((preset) => (
                <option key={preset} value={preset} />
              ))}
            </datalist>
          </label>

          <label className="block">
            <span className="label">Note (optional)</span>
            <input className="input" name="note" defaultValue={row.note} />
          </label>

          <fieldset className="min-w-0">
            <legend className="label">Also off</legend>
            <div className="flex h-11 items-center gap-4">
              <label className="flex items-center gap-2 text-sm font-semibold text-ink">
                <input
                  type="checkbox"
                  name="includes_friday"
                  defaultChecked={row.includesFriday}
                  className="h-4 w-4 accent-brand"
                />
                Friday
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-ink">
                <input
                  type="checkbox"
                  name="includes_sunday"
                  defaultChecked={row.includesSunday}
                  className="h-4 w-4 accent-brand"
                />
                Sunday
              </label>
            </div>
          </fieldset>

          <SubmitButton className="btn-primary btn-sm" pendingLabel="Saving...">
            Save
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
