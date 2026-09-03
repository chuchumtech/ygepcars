"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  CALENDAR_VIEWS,
  carColor,
  dateRangeList,
  shiftDays,
  stepAnchor,
  viewBounds,
  type CalendarView,
} from "@/lib/calendar";
import { formatDate, formatDayLong, todayLocal } from "@/lib/dates";
import { MonthGrid } from "./MonthGrid";
import { TimeGrid, type TimeColumn } from "./TimeGrid";
import { AgendaList } from "./AgendaList";
import { ReservationDialog } from "./ReservationDialog";
import {
  NewReservationDialog,
  addHours,
  type NewReservationSeed,
} from "@/components/reservations/NewReservationDialog";
import { toEvents, type CalendarData, type CalEvent } from "./types";

const SHOW_FILTERS = [
  { value: "open", label: "Open" },
  { value: "all", label: "Everything" },
  { value: "pending", label: "Pending requests" },
  { value: "hold", label: "On hold" },
  { value: "approved", label: "Approved" },
  { value: "waitlist", label: "Waitlist only" },
  { value: "blackout", label: "Blocked off" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "declined", label: "Declined" },
];

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarBoard({
  view,
  anchor,
  data,
}: {
  view: CalendarView;
  anchor: string;
  data: CalendarData;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newSeed, setNewSeed] = useState<NewReservationSeed | null>(null);
  const [carFilter, setCarFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [query, setQuery] = useState("");

  const allEvents = useMemo(() => toEvents(data), [data]);

  const events = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return allEvents.filter((event) => {
      // A waitlist entry with no car named would take whichever frees up, so
      // narrowing to one car should not hide it.
      if (carFilter !== "all" && event.vehicleId && event.vehicleId !== carFilter) {
        return false;
      }

      switch (statusFilter) {
        case "all":
          break;
        case "open":
          // A hold blocks the car just as a booking does, so it belongs in the
          // default view even though nobody has confirmed it.
          if (
            event.kind === "reservation" &&
            !["pending", "approved", "hold"].includes(event.status ?? "")
          ) {
            return false;
          }
          break;
        case "waitlist":
          if (event.kind !== "waitlist") return false;
          break;
        case "blackout":
          if (event.kind !== "blackout") return false;
          break;
        default:
          if (event.kind !== "reservation" || event.status !== statusFilter) return false;
      }

      if (needle) {
        const haystack = `${event.title} ${event.subtitle}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [allEvents, carFilter, statusFilter, query]);

  const selected = data.reservations.find((r) => r.id === selectedId) ?? null;

  function navigate(next: { view?: CalendarView; date?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.view) params.set("view", next.view);
    if (next.date) params.set("date", next.date);
    router.push(`/admin?${params.toString()}`, { scroll: false });
  }

  /**
   * Clicking free space on the calendar is how the office books a car for
   * somebody standing at the desk: the day, the hour and -- in the day view,
   * where the columns are cars -- the car all come with the click, so all that
   * is left to type is who it is for.
   */
  function newOnDay(date: string) {
    setNewSeed({ startDate: date, endDate: date, startTime: "09:00", endTime: "17:00" });
  }

  function newAt(date: string, hour: number, vehicleId?: string) {
    const startTime = `${String(hour).padStart(2, "0")}:00`;
    setNewSeed({
      startDate: date,
      endDate: date,
      startTime,
      endTime: addHours(startTime, 4),
      vehicleId,
    });
  }

  function openEvent(event: CalEvent) {
    if (event.kind === "reservation") setSelectedId(event.id);
    // The queue is reordered and offered from its own screen, so send the
    // office there rather than half-reproducing it in a dialog.
    if (event.kind === "waitlist") router.push("/admin/waitlist");
  }

  const bounds = viewBounds(view, anchor);

  const heading =
    view === "month"
      ? new Intl.DateTimeFormat("en-US", {
          timeZone: "UTC",
          month: "long",
          year: "numeric",
        }).format(new Date(`${anchor}T12:00:00Z`))
      : view === "day"
        ? formatDayLong(`${anchor}T12:00:00Z`)
        : view === "week"
          ? `${formatDate(`${bounds.from}T12:00:00Z`)} – ${formatDate(`${bounds.to}T12:00:00Z`)}`
          : `From ${formatDate(`${anchor}T12:00:00Z`)}`;

  const weekColumns: TimeColumn[] = dateRangeList(bounds.from, bounds.to).map((date) => ({
    key: date,
    date,
    heading: WEEKDAY_SHORT[new Date(`${date}T12:00:00Z`).getUTCDay()],
    subheading: formatDate(`${date}T12:00:00Z`).replace(/, \d{4}$/, ""),
  }));

  // In the day view each car gets its own column, which is how the office
  // actually reads it: "who has the Corolla today?"
  const dayColumns: TimeColumn[] = data.vehicles
    .filter((vehicle) => carFilter === "all" || vehicle.id === carFilter)
    .map((vehicle) => ({
      key: vehicle.id,
      date: anchor,
      vehicleId: vehicle.id,
      heading: vehicle.name,
      subheading: vehicle.color || undefined,
      highlight: false,
    }));

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => navigate({ date: stepAnchor(view, anchor, -1) })}
            aria-label="Previous"
          >
            &larr;
          </button>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => navigate({ date: todayLocal() })}
          >
            Today
          </button>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => navigate({ date: stepAnchor(view, anchor, 1) })}
            aria-label="Next"
          >
            &rarr;
          </button>
        </div>

        <h2 className="ml-1 text-lg font-bold text-ink">{heading}</h2>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input
            type="search"
            className="input h-9 w-44 py-1.5 text-sm"
            placeholder="Find a student..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter by student or destination"
          />

          <select
            className="input h-9 w-auto py-1.5 text-sm"
            value={carFilter}
            onChange={(e) => setCarFilter(e.target.value)}
            aria-label="Filter by car"
          >
            <option value="all">All cars</option>
            {data.vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.name}
              </option>
            ))}
          </select>

          <select
            className="input h-9 w-auto py-1.5 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter what the calendar shows"
          >
            {SHOW_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <div className="flex rounded-lg border border-line/70 bg-white p-0.5">
            {CALENDAR_VIEWS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => navigate({ view: option.value })}
                className={`rounded-md px-2.5 py-1.5 text-[13px] font-semibold transition ${
                  view === option.value
                    ? "bg-slate-500 text-white"
                    : "text-ink hover:bg-parchment"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="no-print flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft">
        {data.vehicles.map((vehicle, index) => (
          <span key={vehicle.id} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${carColor(index).dot}`} aria-hidden />
            {vehicle.name}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded border-2 border-dashed border-navy-400" aria-hidden />
          Pending request
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded border border-navy-400 bg-parchment-deep" aria-hidden />
          Approved
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-4 rounded border border-dashed border-slate-400 bg-slate-100"
            aria-hidden
          />
          Waitlist
        </span>
        <span className="ml-auto">{events.length} shown</span>
      </div>

      {view === "month" || view === "week" || view === "day" ? (
        <p className="no-print -mt-1 text-xs text-ink-soft">
          {view === "month"
            ? "Click an empty day to book a car on it."
            : view === "day"
              ? "Click a free hour in a car's column to book that car."
              : "Click a free hour to book a car then."}
        </p>
      ) : null}

      {view === "month" ? (
        <MonthGrid
          anchor={anchor}
          events={events}
          onSelectEvent={openEvent}
          onSelectDay={(date) => navigate({ view: "day", date })}
          onNewOnDay={newOnDay}
        />
      ) : null}

      {view === "week" ? (
        <TimeGrid
          columns={weekColumns}
          events={events}
          onSelectEvent={openEvent}
          onNewAt={newAt}
        />
      ) : null}

      {view === "day" ? (
        dayColumns.length > 0 ? (
          <TimeGrid
            columns={dayColumns}
            events={events}
            onSelectEvent={openEvent}
            onNewAt={newAt}
          />
        ) : (
          <p className="card-pad text-sm text-ink-soft">No cars to show.</p>
        )
      ) : null}

      {view === "list" ? (
        <AgendaList anchor={anchor} events={events} onSelectEvent={openEvent} />
      ) : null}

      {view === "day" ? (
        <p className="no-print text-xs text-ink-soft">
          Showing {formatDayLong(`${anchor}T12:00:00Z`)}. Use{" "}
          <button
            type="button"
            className="link"
            onClick={() => navigate({ date: shiftDays(anchor, 1) })}
          >
            tomorrow
          </button>{" "}
          to look ahead.
        </p>
      ) : null}

      <ReservationDialog
        reservation={selected}
        vehicles={data.vehicles}
        destinations={data.destinations}
        onClose={() => setSelectedId(null)}
      />

      {newSeed ? (
        <NewReservationDialog
          open
          onClose={() => setNewSeed(null)}
          seed={newSeed}
          vehicles={data.vehicles}
          destinations={data.destinations}
          students={data.students}
        />
      ) : null}
    </div>
  );
}
