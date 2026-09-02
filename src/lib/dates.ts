/**
 * The yeshiva runs out of one location in one timezone, so the whole app talks
 * in that timezone. Everything is stored in Postgres as timestamptz (UTC); these
 * helpers are the only place wall-clock time and instants get converted.
 */
export const ORG_TIMEZONE = "America/New_York";

/** Offset, in milliseconds, of `timeZone` from UTC at the given instant. */
function offsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const field: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") field[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(
    field.year,
    field.month - 1,
    field.day,
    field.hour === 24 ? 0 : field.hour,
    field.minute,
    field.second,
  );
  return asUtc - instant.getTime();
}

/**
 * Turn a local wall-clock string ("2026-09-05" + "14:30") into the instant it
 * refers to in the org timezone. Runs the offset lookup twice so the hour either
 * side of a daylight-saving change resolves correctly.
 */
export function localToInstant(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mm);

  let instant = new Date(naive);
  for (let pass = 0; pass < 2; pass += 1) {
    instant = new Date(naive - offsetMs(instant, ORG_TIMEZONE));
  }
  return instant;
}

/** Inverse of localToInstant: the wall-clock date and time in the org timezone. */
export function instantToLocalParts(instant: Date | string): {
  date: string;
  time: string;
} {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ORG_TIMEZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(d);

  const field: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") field[part.type] = part.value;
  }
  const hour = field.hour === "24" ? "00" : field.hour;
  return {
    date: `${field.year}-${field.month}-${field.day}`,
    time: `${hour}:${field.minute}`,
  };
}

function fmt(options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", { timeZone: ORG_TIMEZONE, ...options });
}

export function formatDateTime(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return fmt({
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export function formatDate(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return fmt({ month: "short", day: "numeric", year: "numeric" }).format(d);
}

export function formatDayLong(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return fmt({ weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(d);
}

export function formatTime(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return fmt({ hour: "numeric", minute: "2-digit" }).format(d);
}

/** "Fri, Sep 5, 2:00 PM to 8:30 PM" or with both dates when they differ. */
export function formatRange(start: Date | string, end: Date | string): string {
  const s = typeof start === "string" ? new Date(start) : start;
  const e = typeof end === "string" ? new Date(end) : end;
  const sameDay =
    instantToLocalParts(s).date === instantToLocalParts(e).date;
  return sameDay
    ? `${formatDateTime(s)} to ${formatTime(e)}`
    : `${formatDateTime(s)} to ${formatDateTime(e)}`;
}

/** Today in the org timezone, as YYYY-MM-DD. */
export function todayLocal(): string {
  return instantToLocalParts(new Date()).date;
}

export function addDaysLocal(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return shifted.toISOString().slice(0, 10);
}

/** Half-hour options for the time dropdowns, e.g. { value: "14:30", label: "2:30 PM" }. */
export function halfHourOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += 30) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    const display = new Date(Date.UTC(2000, 0, 1, h, m));
    const label = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      hour: "numeric",
      minute: "2-digit",
    }).format(display);
    options.push({ value, label });
  }
  return options;
}

export function hoursBetween(start: Date | string, end: Date | string): number {
  const s = typeof start === "string" ? new Date(start) : start;
  const e = typeof end === "string" ? new Date(end) : end;
  return (e.getTime() - s.getTime()) / 3_600_000;
}

/** "6h 30m", "2 days 4h" -- for humans reading a reservation length. */
export function describeDuration(hours: number): string {
  if (hours < 24) {
    const whole = Math.floor(hours);
    const mins = Math.round((hours - whole) * 60);
    return mins ? `${whole}h ${mins}m` : `${whole}h`;
  }
  const days = Math.floor(hours / 24);
  const rest = Math.round(hours - days * 24);
  const dayLabel = days === 1 ? "day" : "days";
  return rest ? `${days} ${dayLabel} ${rest}h` : `${days} ${dayLabel}`;
}
