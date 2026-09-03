"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { shiftDays } from "@/lib/calendar";
import { todayLocal } from "@/lib/dates";

const PRESETS = [
  { label: "Today", from: 0, to: 0 },
  { label: "Tomorrow", from: 1, to: 1 },
  { label: "Next 7 days", from: 0, to: 6 },
  { label: "Next 30 days", from: 0, to: 29 },
];

export function PrintControls({
  from,
  to,
  status,
}: {
  from: string;
  to: string;
  status: string;
}) {
  const router = useRouter();
  const [range, setRange] = useState({ from, to, status });

  function apply(next: { from: string; to: string; status: string }) {
    setRange(next);
    const params = new URLSearchParams(next);
    router.push(`/admin/print?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="no-print mb-6 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="print-from">
            From
          </label>
          <input
            id="print-from"
            type="date"
            className="input"
            value={range.from}
            onChange={(e) =>
              apply({
                ...range,
                from: e.target.value,
                to: range.to < e.target.value ? e.target.value : range.to,
              })
            }
          />
        </div>

        <div>
          <label className="label" htmlFor="print-to">
            To
          </label>
          <input
            id="print-to"
            type="date"
            className="input"
            value={range.to}
            min={range.from}
            onChange={(e) => apply({ ...range, to: e.target.value })}
          />
        </div>

        <div>
          <label className="label" htmlFor="print-status">
            Include
          </label>
          <select
            id="print-status"
            className="input"
            value={range.status}
            onChange={(e) => apply({ ...range, status: e.target.value })}
          >
            <option value="confirmed">Confirmed rentals only</option>
            <option value="all">Everything, including pending</option>
          </select>
        </div>

        <button type="button" className="btn-primary" onClick={() => window.print()}>
          Print
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
        {PRESETS.map((preset) => {
          const today = todayLocal();
          const next = {
            ...range,
            from: shiftDays(today, preset.from),
            to: shiftDays(today, preset.to),
          };
          const active = next.from === range.from && next.to === range.to;
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => apply(next)}
              className={`chip border transition ${
                active
                  ? "border-slate-500 bg-slate-500 text-white"
                  : "border-[var(--color-line)] bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
