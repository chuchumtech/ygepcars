import { localToInstant } from "@/lib/dates";

export type SearchWindow = {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  startsAt: Date;
  endsAt: Date;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/**
 * Reads the four date/time query params into a window, or explains what is
 * wrong. Returning the reason rather than throwing lets the search page show a
 * sentence instead of an error screen.
 */
export function parseSearchWindow(params: {
  start_date?: string;
  start_time?: string;
  end_date?: string;
  end_time?: string;
}): { window: SearchWindow } | { error: string } {
  const { start_date, start_time, end_date, end_time } = params;

  if (!start_date || !start_time || !end_date || !end_time) {
    return { error: "Choose a pickup and a return time to see what is available." };
  }
  if (
    !DATE_RE.test(start_date) ||
    !DATE_RE.test(end_date) ||
    !TIME_RE.test(start_time) ||
    !TIME_RE.test(end_time)
  ) {
    return { error: "Those dates did not come through correctly. Please pick them again." };
  }

  const startsAt = localToInstant(start_date, start_time);
  const endsAt = localToInstant(end_date, end_time);

  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return { error: "Those dates did not come through correctly. Please pick them again." };
  }
  if (endsAt <= startsAt) {
    return { error: "The return time has to be after the pickup time." };
  }
  if (endsAt.getTime() - startsAt.getTime() > 60 * 24 * 3_600_000) {
    return { error: "That is longer than the office rents a car for. Please shorten the trip." };
  }

  return {
    window: { startDate: start_date, startTime: start_time, endDate: end_date, endTime: end_time, startsAt, endsAt },
  };
}
