import type { Blackout, Destination, Profile, Reservation, Vehicle } from "@/lib/types";

export type AdminReservation = Reservation & {
  vehicle: Pick<Vehicle, "id" | "name" | "color" | "image_url"> | null;
  student: Pick<Profile, "id" | "full_name" | "email" | "phone"> | null;
};

export type CalendarData = {
  reservations: AdminReservation[];
  blackouts: (Blackout & { vehicle: Pick<Vehicle, "id" | "name"> | null })[];
  vehicles: Vehicle[];
  destinations: Destination[];
  students: Pick<Profile, "id" | "full_name" | "email" | "phone" | "status">[];
};

/** A reservation or blackout flattened into something the grids can draw. */
export type CalEvent = {
  id: string;
  kind: "reservation" | "blackout";
  vehicleId: string;
  vehicleIndex: number;
  startsAt: string;
  endsAt: string;
  status: Reservation["status"] | null;
  title: string;
  subtitle: string;
};

export function toEvents(
  data: Pick<CalendarData, "reservations" | "blackouts" | "vehicles">,
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

  return [...reservations, ...blackouts].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );
}
