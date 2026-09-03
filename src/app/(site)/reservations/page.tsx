import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireActiveStudent } from "@/lib/auth";
import { cancelReservationAction } from "@/app/actions/reservations";
import { leaveWaitlistAction } from "@/app/actions/waitlist";
import { Alert, DetailRow, EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { PaymentHoldNotice } from "@/components/BookingRulesNote";
import { loadBookingRules, hoursLabel, type BookingRules } from "@/lib/settings";
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
  const [params, viewer, supabase, rules] = await Promise.all([
    searchParams,
    requireActiveStudent(),
    createClient(),
    loadBookingRules(),
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
        <Alert tone="success" title="Request sent — the car is being held for you">
          <p>
            The office has your request and will get back to you.
          </p>
          <p className="mt-1.5">
            <PaymentHoldNotice rules={rules} />
          </p>
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
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-soft">
            On the waitlist
          </h2>
          <div className="card divide-y divide-line/70">
            {waitlist.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-ink">
                    {entry.vehicle?.name ?? "Whichever car frees up"}
                  </p>
                  <p className="text-sm text-ink-soft">
                    {formatRange(entry.starts_at, entry.ends_at)}
                  </p>
                  <p className="text-xs text-ink-soft">
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
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-soft">
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
              <ReservationCard key={r.id} reservation={r} rules={rules} cancellable />
            ))}
          </div>
        )}
      </section>

      {past.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-soft">
            Past and closed
          </h2>
          <div className="space-y-4">
            {past.map((r) => (
              <ReservationCard key={r.id} reservation={r} rules={rules} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ReservationCard({
  reservation: r,
  rules,
  cancellable = false,
}: {
  reservation: Row;
  rules: BookingRules;
  cancellable?: boolean;
}) {
  const hours = hoursBetween(r.starts_at, r.ends_at);

  // Server Component: rendered per request, so reading the clock here is fine.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const holdEndsAt =
    new Date(r.requested_at).getTime() + rules.paymentHoldHours * 3_600_000;
  const paid = r.payment_received_at !== null;
  const holdLapsed = r.status === "pending" && !paid && now > holdEndsAt;
  const holdActive = r.status === "pending" && !paid && now <= holdEndsAt;

  return (
    <article className="card overflow-hidden md:flex">
      {r.vehicle?.image_url ? (
        <div className="relative aspect-[16/9] shrink-0 bg-parchment-deep md:aspect-auto md:w-48">
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
              <h3 className="text-base font-bold text-ink">
                {r.vehicle?.name ?? "Car"}
              </h3>
              <StatusBadge status={r.status} />
              <span className="text-xs text-ink-soft">{r.reference}</span>
            </div>
            <p className="mt-1 text-sm text-ink-soft">
              {formatRange(r.starts_at, r.ends_at)} · {describeDuration(hours)}
            </p>
          </div>

          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
              {r.status === "completed" ? "Total" : "Estimate"}
            </p>
            <p className="text-xl font-bold tabular-nums text-ink">
              {formatMoney(r.total_cents)}
            </p>
          </div>
        </div>

        {holdActive ? (
          <div className="mt-3">
            <Alert tone="warn" title="The car is being held for you">
              Held until {formatDateTime(new Date(holdEndsAt))} —{" "}
              {hoursLabel(rules.paymentHoldHours)} from when you asked. If the office
              has not been paid by then the car goes back into the pool, though your
              request stays open.
            </Alert>
          </div>
        ) : null}

        {holdLapsed ? (
          <div className="mt-3">
            <Alert tone="warn" title="The car is no longer being held">
              The {hoursLabel(rules.paymentHoldHours)} hold ran out, so the car is back
              in the pool and somebody else could book it. Your request is still open —
              pay the office and, as long as nobody has taken the car, it is still
              yours.
            </Alert>
          </div>
        ) : null}

        {paid && r.status === "pending" ? (
          <div className="mt-3">
            <Alert tone="success" title="Payment received">
              The car is held for you while the office finishes approving this.
            </Alert>
          </div>
        ) : null}

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
