import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireActiveStudent } from "@/lib/auth";
import { parseSearchWindow } from "@/lib/search-params";
import { Alert } from "@/components/ui";
import { BookingRulesNote } from "@/components/BookingRulesNote";
import { BookingForm } from "./BookingForm";
import { checkBookingRules, loadBookingRules } from "@/lib/settings";
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
  const rules = await loadBookingRules();
  const ruleProblems = checkBookingRules(win.startsAt, win.endsAt, rules, new Date());

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <Link href="/" className="text-sm text-ink-soft hover:text-ink">
          &larr; Back to search
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink">
          Request a reservation
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          Nothing is charged here. The office reviews your request and confirms it
          with you.
        </p>
      </div>

      {ruleProblems.length > 0 ? (
        <div className="mb-6">
          <Alert tone="warn" title="That window does not fit the rules">
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {ruleProblems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
            <p className="mt-2">
              <Link href="/" className="link">
                Pick different times
              </Link>
            </p>
          </Alert>
        </div>
      ) : null}

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
          rules={rules}
          blocked={ruleProblems.length > 0}
        />

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="card overflow-hidden">
            {vehicle.image_url ? (
              <div className="relative aspect-[16/10] bg-parchment-deep">
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
              <h2 className="text-base font-bold text-ink">{vehicle.name}</h2>
              <p className="mt-0.5 text-sm text-ink-soft">
                {[vehicle.color, vehicle.seats ? `${vehicle.seats} seats` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="mt-3 border-t border-line/70 pt-3 text-sm">
                <p className="font-medium text-ink">
                  {formatRange(win.startsAt, win.endsAt)}
                </p>
                <p className="mt-0.5 text-ink-soft">{describeDuration(hours)}</p>
              </div>
            </div>
          </div>

          <div className="card-pad text-sm">
            <p className="font-semibold text-ink">Requesting as</p>
            <p className="mt-1 text-ink-soft">{viewer.profile.full_name}</p>
            <p className="text-ink-soft">{viewer.profile.email}</p>
            <p className="text-ink-soft">{viewer.profile.phone}</p>
            <Link href="/account" className="link mt-2 inline-block text-xs">
              Update my details
            </Link>
          </div>

          <div className="card-pad">
            <p className="text-sm font-semibold text-ink">The rules</p>
            <BookingRulesNote rules={rules} className="mt-2 text-xs" />
          </div>
        </aside>
      </div>
    </div>
  );
}
