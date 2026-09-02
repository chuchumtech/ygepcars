import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { RESERVATION_SELECT } from "@/lib/admin-queries";
import { ReservationTable } from "@/components/calendar/ReservationTable";
import { PageHeader } from "@/components/ui";
import type { AdminReservation } from "@/components/calendar/types";
import type { Destination, Vehicle } from "@/lib/types";

export const metadata: Metadata = { title: "All reservations" };

const RANGES = [
  { value: "upcoming", label: "Upcoming" },
  { value: "live", label: "Out now" },
  { value: "past", label: "Past" },
  { value: "all", label: "Everything" },
];

const STATUSES = [
  { value: "any", label: "Any status" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "completed", label: "Completed" },
  { value: "declined", label: "Declined" },
  { value: "cancelled", label: "Cancelled" },
];

export default async function AllReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; status?: string; car?: string }>;
}) {
  const params = await searchParams;
  const range = RANGES.some((r) => r.value === params.range) ? params.range! : "upcoming";
  const status = STATUSES.some((s) => s.value === params.status) ? params.status! : "any";
  const car = params.car ?? "all";

  const supabase = await createClient();
  const now = new Date().toISOString();

  let query = supabase.from("cars_reservations").select(RESERVATION_SELECT);

  if (range === "upcoming") query = query.gte("ends_at", now).order("starts_at");
  else if (range === "live")
    query = query.lte("starts_at", now).gte("ends_at", now).order("starts_at");
  else if (range === "past")
    query = query.lt("ends_at", now).order("starts_at", { ascending: false });
  else query = query.order("starts_at", { ascending: false });

  if (status !== "any") query = query.eq("status", status);
  if (car !== "all") query = query.eq("vehicle_id", car);

  const [reservations, vehicles, destinations] = await Promise.all([
    query.limit(400),
    supabase.from("cars_vehicles").select("*").order("sort_order"),
    supabase.from("cars_destinations").select("*").order("sort_order"),
  ]);

  const vehicleList = (vehicles.data ?? []) as Vehicle[];

  function href(patch: Record<string, string>) {
    const next = new URLSearchParams({ range, status, car, ...patch });
    return `/admin/reservations?${next.toString()}`;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="All reservations"
        description="Search the whole history. Click any row to open or change it."
      />

      <div className="flex flex-wrap gap-4">
        <FilterGroup
          label="Show"
          options={RANGES}
          current={range}
          hrefFor={(value) => href({ range: value })}
        />
        <FilterGroup
          label="Status"
          options={STATUSES}
          current={status}
          hrefFor={(value) => href({ status: value })}
        />
        <FilterGroup
          label="Car"
          options={[
            { value: "all", label: "All cars" },
            ...vehicleList.map((v) => ({ value: v.id, label: v.name })),
          ]}
          current={car}
          hrefFor={(value) => href({ car: value })}
        />
      </div>

      <ReservationTable
        reservations={(reservations.data ?? []) as AdminReservation[]}
        vehicles={vehicleList}
        destinations={(destinations.data ?? []) as Destination[]}
        emptyMessage="No reservations match those filters."
      />
    </div>
  );
}

function FilterGroup({
  label,
  options,
  current,
  hrefFor,
}: {
  label: string;
  options: { value: string; label: string }[];
  current: string;
  hrefFor: (value: string) => string;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </p>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => (
          <Link
            key={option.value}
            href={hrefFor(option.value)}
            scroll={false}
            className={`chip border transition ${
              current === option.value
                ? "border-navy-700 bg-navy-700 text-white"
                : "border-[var(--color-line)] bg-white text-navy-700 hover:bg-navy-50"
            }`}
          >
            {option.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
