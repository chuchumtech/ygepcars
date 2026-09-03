import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireActiveStudent } from "@/lib/auth";
import { parseSearchWindow } from "@/lib/search-params";
import { Alert } from "@/components/ui";
import { BookingForm } from "./BookingForm";
import { describeDuration, formatRange, hoursBetween } from "@/lib/dates";
import type { Destination, Vehicle } from "@/lib/types";

export const metadata: Metadata = { title: "Request a reservation" };

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const viewer = await requireActiveStudent();
  const parsed = parseSearchWindow(params);

  if ("error" in parsed) {
    return (
      <Alert tone="warn">
        {parsed.error}{" "}
        <Link href="/" className="link">
          Start a new search
        </Link>
      </Alert>
    );
  }

  const { window: win } = parsed;
  const vehicleId = params.vehicle ?? "";
  const supabase = await createClient();

  const [{ data: vehicleRow }, { data: destinationRows }, { data: availability }] =
    await Promise.all([
      supabase.from("cars_vehicles").select("*").eq("id", vehicleId).maybeSingle(),
      supabase
        .from("cars_destinations")
        .select("*")
        .eq("is_active", true)
        .order("sort_order"),
      supabase.rpc("cars_availability", {
        p_start: win.startsAt.toISOString(),
        p_end: win.endsAt.toISOString(),
      }),
    ]);

  const vehicle = vehicleRow as Vehicle | null;
  if (!vehicle) redirect("/");

  const state = ((availability ?? []) as { vehicle_id: string; is_available: boolean }[]).find(
    (row) => row.vehicle_id === vehicle.id,
  );

  if (state && !state.is_available) {
    return (
      <div className="space-y-4">
        <Alert tone="error" title="That car is no longer free for those times">
          Somebody else got there first.
        </Alert>
        <Link href="/" className="btn-primary">
          Search again
        </Link>
      </div>
    );
  }

  const destinations = (destinationRows ?? []) as Destination[];
  const hours = hoursBetween(win.startsAt, win.endsAt);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <Link href="/" className="text-sm text-muted hover:text-navy-700">
          &larr; Back to search
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-500">
          Request a reservation
        </h1>
        <p className="mt-1 text-sm text-muted">
          Nothing is charged here. The office reviews your request and confirms it
          with you.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <BookingForm
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
        />

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="card overflow-hidden">
            {vehicle.image_url ? (
              <div className="relative aspect-[16/10] bg-navy-100">
                <Image
                  src={vehicle.image_url}
                  alt={vehicle.name}
                  fill
                  sizes="20rem"
                  className="object-cover"
                />
              </div>
            ) : null}
            <div className="p-4">
              <h2 className="text-base font-bold text-slate-500">{vehicle.name}</h2>
              <p className="mt-0.5 text-sm text-muted">
                {[vehicle.color, vehicle.seats ? `${vehicle.seats} seats` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="mt-3 border-t border-[var(--color-line)] pt-3 text-sm">
                <p className="font-medium text-navy-800">
                  {formatRange(win.startsAt, win.endsAt)}
                </p>
                <p className="mt-0.5 text-muted">{describeDuration(hours)}</p>
              </div>
            </div>
          </div>

          <div className="card-pad text-sm">
            <p className="font-semibold text-navy-800">Requesting as</p>
            <p className="mt-1 text-muted">{viewer.profile.full_name}</p>
            <p className="text-muted">{viewer.profile.email}</p>
            <p className="text-muted">{viewer.profile.phone}</p>
            <Link href="/account" className="link mt-2 inline-block text-xs">
              Update my details
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
