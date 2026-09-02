"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { addDaysLocal, halfHourOptions, todayLocal } from "@/lib/dates";

export type SearchValues = {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
};

export function searchHref(values: SearchValues): string {
  const params = new URLSearchParams({
    start_date: values.startDate,
    start_time: values.startTime,
    end_date: values.endDate,
    end_time: values.endTime,
  });
  return `/search?${params.toString()}`;
}

export function defaultSearchValues(): SearchValues {
  const today = todayLocal();
  return {
    startDate: today,
    startTime: "09:00",
    endDate: today,
    endTime: "17:00",
  };
}

export function SearchForm({
  initial,
  compact = false,
}: {
  initial?: Partial<SearchValues>;
  compact?: boolean;
}) {
  const router = useRouter();
  const times = useMemo(() => halfHourOptions(), []);
  const fallback = useMemo(() => defaultSearchValues(), []);

  const [values, setValues] = useState<SearchValues>({
    startDate: initial?.startDate || fallback.startDate,
    startTime: initial?.startTime || fallback.startTime,
    endDate: initial?.endDate || fallback.endDate,
    endTime: initial?.endTime || fallback.endTime,
  });
  const [error, setError] = useState<string | null>(null);

  function update(patch: Partial<SearchValues>) {
    setValues((current) => {
      const next = { ...current, ...patch };
      // Keep the return date from silently sitting before the pickup date.
      if (next.endDate < next.startDate) next.endDate = next.startDate;
      return next;
    });
    setError(null);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const start = `${values.startDate} ${values.startTime}`;
    const end = `${values.endDate} ${values.endTime}`;
    if (end <= start) {
      setError("The return has to be after the pickup.");
      return;
    }
    router.push(searchHref(values));
  }

  const min = todayLocal();
  const max = addDaysLocal(min, 365);

  return (
    <form onSubmit={submit} className={compact ? "" : "card-pad shadow-sm"}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]">
        <fieldset className="min-w-0">
          <legend className="label">Pick up</legend>
          <div className="flex gap-2">
            <input
              type="date"
              className="input"
              value={values.startDate}
              min={min}
              max={max}
              onChange={(e) => update({ startDate: e.target.value })}
              required
              aria-label="Pickup date"
            />
            <select
              className="input w-[8.5rem] shrink-0"
              value={values.startTime}
              onChange={(e) => update({ startTime: e.target.value })}
              aria-label="Pickup time"
            >
              {times.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </fieldset>

        <fieldset className="min-w-0">
          <legend className="label">Return</legend>
          <div className="flex gap-2">
            <input
              type="date"
              className="input"
              value={values.endDate}
              min={values.startDate}
              max={max}
              onChange={(e) => update({ endDate: e.target.value })}
              required
              aria-label="Return date"
            />
            <select
              className="input w-[8.5rem] shrink-0"
              value={values.endTime}
              onChange={(e) => update({ endTime: e.target.value })}
              aria-label="Return time"
            >
              {times.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </fieldset>

        <div className="flex items-end">
          <button type="submit" className="btn-primary h-[46px] w-full lg:w-auto lg:px-7">
            Search
          </button>
        </div>
      </div>

      {error ? <p className="mt-3 text-sm font-medium text-red-700">{error}</p> : null}
    </form>
  );
}
