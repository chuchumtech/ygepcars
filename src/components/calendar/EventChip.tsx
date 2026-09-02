"use client";

import { formatTime } from "@/lib/dates";
import { carColor } from "@/lib/calendar";
import type { CalEvent } from "./types";

/**
 * Cars are told apart by colour, status by weight: a pending request is drawn
 * as an outline so the office can spot "needs a decision" at a glance, an
 * approved one is solid, and anything closed is faded.
 */
export function eventStyles(event: CalEvent) {
  const color = carColor(event.vehicleIndex);

  if (event.kind === "blackout") {
    return {
      className:
        "border border-dashed border-navy-400 bg-[repeating-linear-gradient(45deg,#eef1f7_0_6px,#dfe4ee_6px_12px)] text-navy-700",
      dot: "bg-navy-400",
    };
  }

  switch (event.status) {
    case "pending":
      return {
        className: `border-2 border-dashed ${color.border} ${color.soft} ${color.text}`,
        dot: color.dot,
      };
    case "approved":
      return {
        className: `border ${color.border} ${color.soft} ${color.text} shadow-xs`,
        dot: color.dot,
      };
    case "completed":
      return {
        className: `border border-navy-200 bg-navy-50 text-navy-700`,
        dot: color.dot,
      };
    default:
      return {
        className: "border border-navy-200 bg-white text-muted line-through decoration-1",
        dot: "bg-navy-300",
      };
  }
}

export function EventChip({
  event,
  onSelect,
  showTime = true,
}: {
  event: CalEvent;
  onSelect: (event: CalEvent) => void;
  showTime?: boolean;
}) {
  const styles = eventStyles(event);

  return (
    <button
      type="button"
      onClick={() => onSelect(event)}
      title={`${event.title} · ${event.subtitle}`}
      className={`flex w-full items-center gap-1.5 truncate rounded px-1.5 py-1 text-left text-[11px] font-medium transition hover:brightness-95 ${styles.className}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${styles.dot}`} aria-hidden />
      {showTime ? (
        <span className="shrink-0 tabular-nums opacity-70">
          {formatTime(event.startsAt)}
        </span>
      ) : null}
      <span className="truncate">{event.title}</span>
    </button>
  );
}
