"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { addDaysLocal, halfHourOptions, todayLocal } from "@/lib/dates";
import { DateRangeField } from "@/components/DateField";

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
    <form onSubmit={submit} className={compact ? "" : "card-pad"}>
      <div className="space-y-4">
        <div>
          <p className="label">Dates</p>
          <DateRangeField
            id="trip-dates"
            startDate={values.startDate}
            endDate={values.endDate}
            min={min}
            max={max}
            onChange={(next) => update(next)}
          />
        </div>

        <div className="grid gap-y-4 gap-x-8 sm:grid-cols-2">
          <div className="min-w-0">
            <label className="label" htmlFor="pickup-time">
              Pick up time
            </label>
            <select
              id="pickup-time"
              className="input"
              value={values.startTime}
              onChange={(e) => update({ startTime: e.target.value })}
            >
              {times.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-0">
            <label className="label" htmlFor="return-time">
              Return time
            </label>
            <select
              id="return-time"
              className="input"
              value={values.endTime}
              onChange={(e) => update({ endTime: e.target.value })}
            >
              {times.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <button type="submit" className="btn-primary mt-5 h-12 w-full text-base">
        Search
      </button>

      {error ? <p className="mt-3 text-sm font-semibold text-bad">{error}</p> : null}
    </form>
  );
}
