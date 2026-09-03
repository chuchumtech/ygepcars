import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireActiveStudent } from "@/lib/auth";
import { cancelReservationAction } from "@/app/actions/reservations";
import { leaveWaitlistAction } from "@/app/actions/waitlist";
import { Alert, DetailRow, EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { describeDuration, formatDateTime, formatRange, hoursBetween } from "@/lib/dates";
import { formatMoney } from "@/lib/pricing";
import type { Reservation, Vehicle, WaitlistEntryWithRefs } from "@/lib/types";

export const metadata: Metadata = { title: "My reservations" };

type Row = Reservation & { vehicle: Pick<Vehicle, "id" | "name" | "image_url" | "color"> | null };

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ requested?: string; waitlisted?: string }>;
}) {
  const [params, viewer, supabase] = await Promise.all([
    searchParams,
    requireActiveStudent(),
    createClient(),
  ]);

  const [{ data }, { data: waitlistRows }] = await Promise.all([
    supabase
      .from("cars_reservations")
      .select("*, vehicle:cars_vehicles(id, name, image_url, color)")
      .eq("user_id", viewer.userId)
      .order("starts_at", { ascending: false }),
    supabase
      .from("cars_waitlist")
      .select("*, vehicle:cars_vehicles(id, name, color)")
      .eq("user_id", viewer.userId)
      .in("status", ["waiting", "offered"])
      .order("starts_at"),
  ]);

  const all = (data ?? []) as Row[];
  const waitlist = (waitlistRows ?? []) as WaitlistEntryWithRefs[];
  // Server Component: this renders once per request, so reading the clock here
  // is exactly what we want.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  const upcoming = all.filter(
    (r) => ["pending", "approved"].includes(r.status) && new Date(r.ends_at).getTime() >= now,
  );
  const past = all.filter((r) => !upcoming.includes(r));

  return (
    <div className="space-y-8">
      <PageHeader
        title="My reservations"
        description="Everything you have requested, and what the office decided."
        actions={
          <Link href="/" className="btn-primary">
            Book another car
          </Link>
        }
      />

      {params.requested ? (
        <Alert tone="success" title="Request sent">
          The office has it. You will hear back once it is approved — check here for
          the status.
        </Alert>
      ) : null}

      {params.waitlisted ? (
        <Alert tone="success" title="You are on the waitlist">
          If that window frees up, the office will be in touch. This is not a
          booking yet.
        </Alert>
      ) : null}

      {waitlist.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
            On the waitlist
          </h2>
          <div className="card divide-y divide-[var(--color-line)]">
            {waitlist.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-navy-800">
                    {entry.vehicle?.name ?? "Whichever car frees up"}
                  </p>
                  <p className="text-sm text-muted">
                    {formatRange(entry.starts_at, entry.ends_at)}
                  </p>
                  <p className="text-xs text-muted">
                    {entry.destination_label || "Destination not set"}
                    {entry.flexible ? " · nearby times work" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="chip bg-amber-100 text-amber-800">
                    {entry.status === "offered" ? "Offered to you" : "Waiting"}
                  </span>
                  <form action={leaveWaitlistAction}>
                    <input type="hidden" name="waitlist_id" value={entry.id} />
                    <button type="submit" className="btn-ghost btn-sm">
                      Take me off
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
          Upcoming
        </h2>
        {upcoming.length === 0 ? (
          <EmptyState
            title="Nothing coming up"
            description="Search for a car and send the office a request."
            action={
              <Link href="/" className="btn-primary">
                Find a car
              </Link>
            }
          />
        ) : (
          <div className="space-y-4">
            {upcoming.map((r) => (
              <ReservationCard key={r.id} reservation={r} cancellable />
            ))}
          </div>
        )}
      </section>

      {past.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
            Past and closed
          </h2>
          <div className="space-y-4">
            {past.map((r) => (
              <ReservationCard key={r.id} reservation={r} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ReservationCard({
  reservation: r,
  cancellable = false,
}: {
  reservation: Row;
  cancellable?: boolean;
}) {
  const hours = hoursBetween(r.starts_at, r.ends_at);

  return (
    <article className="card overflow-hidden md:flex">
      {r.vehicle?.image_url ? (
        <div className="relative aspect-[16/9] shrink-0 bg-navy-100 md:aspect-auto md:w-48">
          <Image
            src={r.vehicle.image_url}
            alt=""
            fill
            sizes="12rem"
            className="object-cover"
          />
        </div>
      ) : null}

      <div className="flex-1 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-slate-500">
                {r.vehicle?.name ?? "Car"}
              </h3>
              <StatusBadge status={r.status} />
              <span className="text-xs text-muted">{r.reference}</span>
            </div>
            <p className="mt-1 text-sm text-muted">
              {formatRange(r.starts_at, r.ends_at)} · {describeDuration(hours)}
            </p>
          </div>

          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              {r.status === "completed" ? "Total" : "Estimate"}
            </p>
            <p className="text-xl font-bold tabular-nums text-navy-800">
              {formatMoney(r.total_cents)}
            </p>
          </div>
        </div>

        {r.status === "declined" && r.decline_reason ? (
          <div className="mt-3">
            <Alert tone="error" title="The office declined this request">
              {r.decline_reason}
            </Alert>
          </div>
        ) : null}

        <dl className="mt-3">
          <DetailRow label="Heading to">{r.destination_label || "--"}</DetailRow>
          <DetailRow label="Reason">{r.purpose || "--"}</DetailRow>
          <DetailRow label="Time">{formatMoney(r.time_charge_cents)}</DetailRow>
          <DetailRow label="Tolls">{formatMoney(r.toll_cents)}</DetailRow>
          {r.adjustment_cents !== 0 ? (
            <DetailRow label={r.adjustment_reason || "Adjustment"}>
              {formatMoney(r.adjustment_cents)}
            </DetailRow>
          ) : null}
          <DetailRow label="Requested">{formatDateTime(r.requested_at)}</DetailRow>
        </dl>

        {cancellable ? (
          <form action={cancelReservationAction} className="mt-4">
            <input type="hidden" name="reservation_id" value={r.id} />
            <button type="submit" className="btn-danger btn-sm">
              {r.status === "pending" ? "Withdraw request" : "Cancel reservation"}
            </button>
          </form>
        ) : null}
      </div>
    </article>
  );
}
