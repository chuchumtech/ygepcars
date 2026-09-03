import type {
  Blackout,
  Destination,
  Profile,
  Reservation,
  Vehicle,
  WaitlistEntryWithRefs,
} from "@/lib/types";

export type AdminReservation = Reservation & {
  vehicle: Pick<Vehicle, "id" | "name" | "color" | "image_url"> | null;
  student: Pick<Profile, "id" | "full_name" | "email" | "phone"> | null;
};

export type CalendarData = {
  reservations: AdminReservation[];
  waitlist: WaitlistEntryWithRefs[];
  blackouts: (Blackout & { vehicle: Pick<Vehicle, "id" | "name"> | null })[];
  vehicles: Vehicle[];
  destinations: Destination[];
  students: Pick<Profile, "id" | "full_name" | "email" | "phone" | "status">[];
};

/** A reservation, blackout or waitlist entry flattened for the grids. */
export type CalEvent = {
  id: string;
  kind: "reservation" | "blackout" | "waitlist";
  /** Null on a waitlist entry that would take whichever car frees up. */
  vehicleId: string | null;
  vehicleIndex: number;
  startsAt: string;
  endsAt: string;
  status: Reservation["status"] | null;
  title: string;
  subtitle: string;
};

export function toEvents(
  data: Pick<CalendarData, "reservations" | "blackouts" | "vehicles"> &
    Partial<Pick<CalendarData, "waitlist">>,
): CalEvent[] {
  const order = new Map(data.vehicles.map((v, index) => [v.id, index]));

  const reservations: CalEvent[] = data.reservations.map((r) => ({
    id: r.id,
    kind: "reservation",
    vehicleId: r.vehicle_id,
    vehicleIndex: order.get(r.vehicle_id) ?? 0,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    status: r.status,
    title: r.student?.full_name || "Unknown student",
    subtitle: r.destination_label || r.purpose || "",
  }));

  const blackouts: CalEvent[] = data.blackouts.map((b) => ({
    id: b.id,
    kind: "blackout",
    vehicleId: b.vehicle_id,
    vehicleIndex: order.get(b.vehicle_id) ?? 0,
    startsAt: b.starts_at,
    endsAt: b.ends_at,
    status: null,
    title: b.reason || "Out of service",
    subtitle: b.vehicle?.name ?? "",
  }));

  // Only the live end of the queue belongs on a calendar: a converted entry is
  // already drawn as the reservation it became, and an expired or cancelled one
  // is history the office does not need laid over its week.
  const waitlist: CalEvent[] = (data.waitlist ?? [])
    .filter((w) => w.status === "waiting" || w.status === "offered")
    .map((w) => ({
      id: w.id,
      kind: "waitlist" as const,
      vehicleId: w.vehicle_id,
      vehicleIndex: w.vehicle_id ? (order.get(w.vehicle_id) ?? 0) : 0,
      startsAt: w.starts_at,
      endsAt: w.ends_at,
      status: null,
      title: w.student?.full_name || "Unknown student",
      subtitle: [
        w.status === "offered" ? "Offered" : `Waiting #${w.position}`,
        w.vehicle?.name ?? "Any car",
        w.destination_label || w.purpose,
      ]
        .filter(Boolean)
        .join(" · "),
    }));

  return [...reservations, ...blackouts, ...waitlist].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );
}
