import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth";
import { SearchForm } from "@/components/SearchForm";
import { WaitlistButton } from "@/components/WaitlistButton";
import { Alert, EmptyState } from "@/components/ui";
import { parseSearchWindow } from "@/lib/search-params";
import { describeDuration, formatRange, hoursBetween } from "@/lib/dates";
import { formatMoney, quoteForVehicle } from "@/lib/pricing";
import type { AvailabilityRow, Destination, Vehicle } from "@/lib/types";

export const metadata: Metadata = { title: "Available cars" };

const UNAVAILABLE_REASON: Record<string, string> = {
  booked: "Already booked for part of this window",
  requested: "Another student has a request in for this window",
  maintenance: "Out of service for maintenance",
  out_of_service: "Not currently available",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const parsed = parseSearchWindow(params);

  if ("error" in parsed) {
    return (
      <div className="space-y-6">
        <SearchForm />
        <Alert tone="warn">{parsed.error}</Alert>
      </div>
    );
  }

  const { window: win } = parsed;
  const [supabase, viewer] = await Promise.all([createClient(), getViewer()]);

  const [
    { data: vehicleRows },
    { data: availabilityRows },
    { data: destinationRows },
    { data: waitingTotal },
  ] = await Promise.all([
    supabase.from("cars_vehicles").select("*").order("sort_order"),
    supabase.rpc("cars_availability", {
      p_start: win.startsAt.toISOString(),
      p_end: win.endsAt.toISOString(),
    }),
    supabase
      .from("cars_destinations")
      .select("*")
      .eq("is_active", true)
      .order("sort_order"),
    supabase.rpc("cars_waitlist_count", {
      p_start: win.startsAt.toISOString(),
      p_end: win.endsAt.toISOString(),
      p_vehicle: null,
    }),
  ]);

  const destinations = (destinationRows ?? []) as Destination[];
  const waitingCount = typeof waitingTotal === "number" ? waitingTotal : 0;

  const vehicles = (vehicleRows ?? []) as Vehicle[];
  const availability = new Map(
    ((availabilityRows ?? []) as AvailabilityRow[]).map((row) => [row.vehicle_id, row]),
  );

  const hours = hoursBetween(win.startsAt, win.endsAt);
  const canBook = viewer?.profile?.status === "active";

  const results = vehicles
    .map((vehicle) => ({
      vehicle,
      state: availability.get(vehicle.id),
      estimate: quoteForVehicle(vehicle, win.startsAt, win.endsAt, 0),
    }))
    .sort((a, b) => {
      const aFree = a.state?.is_available ? 0 : 1;
      const bFree = b.state?.is_available ? 0 : 1;
      return aFree - bFree || a.vehicle.sort_order - b.vehicle.sort_order;
    });

  const freeCount = results.filter((r) => r.state?.is_available).length;

  return (
    <div className="space-y-6">
      <SearchForm
        initial={{
          startDate: win.startDate,
          startTime: win.startTime,
          endDate: win.endDate,
          endTime: win.endTime,
        }}
      />

      <div>
        <h1 className="text-xl font-bold text-ink">
          {results.length === 0
            ? "No cars in the system yet"
            : freeCount === 0
              ? "Nothing free for that window"
              : `${freeCount} car${freeCount === 1 ? "" : "s"} available`}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          {formatRange(win.startsAt, win.endsAt)} · {describeDuration(hours)}
        </p>
      </div>

      {results.length === 0 ? (
        <EmptyState
          title="No cars are set up yet"
          description="The office has not added any vehicles to the system."
        />
      ) : null}

      <div className="grid gap-4">
        {results.map(({ vehicle, state, estimate }) => {
          const available = state?.is_available ?? false;
          const bookHref = `/book?vehicle=${vehicle.id}&start_date=${win.startDate}&start_time=${win.startTime}&end_date=${win.endDate}&end_time=${win.endTime}`;

          return (
            <article
              key={vehicle.id}
              className={`card overflow-hidden sm:flex ${available ? "" : "opacity-75"}`}
            >
              {vehicle.image_url ? (
                <div className="relative aspect-[16/10] shrink-0 bg-parchment-deep sm:aspect-auto sm:w-64">
                  <Image
                    src={vehicle.image_url}
                    alt={vehicle.name}
                    fill
                    sizes="(max-width: 640px) 100vw, 16rem"
                    className={`object-cover ${available ? "" : "grayscale"}`}
                  />
                </div>
              ) : null}

              <div className="flex flex-1 flex-col gap-4 p-5 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-bold text-ink">{vehicle.name}</h2>
                    {available ? (
                      <span className="chip bg-emerald-100 text-emerald-800">Available</span>
                    ) : (
                      <span className="chip bg-red-100 text-red-700">Not available</span>
                    )}
                  </div>

                  <p className="mt-1 text-sm text-ink-soft">
                    {[vehicle.color, vehicle.seats ? `${vehicle.seats} seats` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>

                  {!available ? (
                    <p className="mt-2 text-sm text-red-700">
                      {UNAVAILABLE_REASON[state?.reason ?? ""] ?? "Not available."}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-ink-soft">
                      {formatMoney(vehicle.hourly_rate_cents)}/hour ·{" "}
                      {estimate.billableHours} billable hour
                      {estimate.billableHours === 1 ? "" : "s"}
                      {estimate.capApplied ? " (daily cap applied)" : ""}
                    </p>
                  )}
                </div>

                <div className="shrink-0 sm:text-right">
                  {available ? (
                    <>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                        Before tolls
                      </p>
                      <p className="text-2xl font-bold tabular-nums text-ink">
                        {formatMoney(estimate.timeChargeCents)}
                      </p>
                      <div className="mt-3">
                        {canBook ? (
                          <Link href={bookHref} className="btn-primary w-full sm:w-auto">
                            Continue
                          </Link>
                        ) : viewer ? (
                          <Link href="/pending" className="btn-secondary w-full sm:w-auto">
                            Account pending
                          </Link>
                        ) : (
                          <Link
                            href={`/login?next=${encodeURIComponent(bookHref)}`}
                            className="btn-primary w-full sm:w-auto"
                          >
                            Sign in to request
                          </Link>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="space-y-2">
                      {canBook ? (
                        <WaitlistButton
                          vehicle={vehicle}
                          destinations={destinations}
                          window={{
                            startDate: win.startDate,
                            startTime: win.startTime,
                            endDate: win.endDate,
                            endTime: win.endTime,
                          }}
                          startsAtIso={win.startsAt.toISOString()}
                          endsAtIso={win.endsAt.toISOString()}
                          waitingCount={waitingCount}
                        />
                      ) : waitingCount > 0 ? (
                        <p className="text-xs text-ink-soft">
                          {waitingCount}{" "}
                          {waitingCount === 1 ? "student is" : "students are"} waiting
                          on this window.
                        </p>
                      ) : null}
                      <Link href="/" className="btn-ghost btn-sm w-full sm:w-auto">
                        Try other times
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
