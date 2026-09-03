import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireActiveStudent } from "@/lib/auth";
import { Alert, EmptyState, StatTile } from "@/components/ui";
import { formatMoney } from "@/lib/pricing";
import { formatRange } from "@/lib/dates";
import { loadBookingRules, hoursLabel } from "@/lib/settings";
import { fuelLabel } from "@/lib/returns";
import type { Reservation, StudentBalance, Vehicle } from "@/lib/types";

export const metadata: Metadata = { title: "My account" };

type Next = Reservation & {
  vehicle: Pick<Vehicle, "id" | "name" | "fuel_level"> | null;
};

export default async function AccountOverviewPage() {
  const [viewer, supabase, rules] = await Promise.all([
    requireActiveStudent(),
    createClient(),
    loadBookingRules(),
  ]);

  const [balanceResult, upcoming, pendingCount] = await Promise.all([
    supabase
      .from("cars_student_balances")
      .select("*")
      .eq("user_id", viewer.userId)
      .maybeSingle(),
    supabase
      .from("cars_reservations")
      .select("*, vehicle:cars_vehicles(id, name, fuel_level)")
      .eq("user_id", viewer.userId)
      .in("status", ["approved", "hold"])
      .gte("ends_at", new Date().toISOString())
      .order("starts_at")
      .limit(1),
    supabase
      .from("cars_reservations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", viewer.userId)
      .eq("status", "pending"),
  ]);

  const balance = (balanceResult.data ?? null) as StudentBalance | null;
  const next = ((upcoming.data ?? []) as Next[])[0] ?? null;
  const owed = balance?.balance_cents ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label={owed < 0 ? "In credit" : "You owe"}
          value={formatMoney(Math.abs(owed))}
          tone={owed > 0 ? "bad" : owed < 0 ? "good" : "good"}
          hint={
            owed > 0
              ? "Settle up with the office"
              : owed < 0
                ? "Comes off your next rental"
                : "All settled"
          }
          href="/account/statement"
        />
        <StatTile
          label="Rentals"
          value={String(balance?.reservation_count ?? 0)}
          href="/account/reservations"
        />
        <StatTile
          label="Waiting on the office"
          value={String(pendingCount.count ?? 0)}
          tone={pendingCount.count ? "warn" : "default"}
          href="/account/reservations"
        />
      </div>

      {next ? (
        <section className="card-pad">
          <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
            Your next car
          </p>
          <h2 className="mt-1 text-lg font-bold text-ink">{next.vehicle?.name}</h2>
          <p className="mt-0.5 text-sm text-ink-soft">
            {formatRange(next.starts_at, next.ends_at)}
          </p>
          <p className="mt-3 text-sm text-ink-soft">
            Heading to {next.destination_label || "somewhere you have not told us"}.
            Bring it back with at least{" "}
            <strong className="text-ink">
              {fuelLabel(next.fuel_out ?? next.vehicle?.fuel_level ?? 8)}
            </strong>{" "}
            of a tank.
          </p>
          <Link href="/account/reservations" className="btn-secondary btn-sm mt-4">
            See the details
          </Link>
        </section>
      ) : (
        <EmptyState
          title="No car booked"
          description="Search for the times you need and send the office a request."
          action={
            <Link href="/" className="btn-primary">
              Find a car
            </Link>
          }
        />
      )}

      {owed > 0 ? (
        <Alert tone="warn" title="You have a balance">
          {formatMoney(owed)} outstanding. Settle up with the office — your{" "}
          <Link href="/account/statement" className="link">
            statement
          </Link>{" "}
          shows what it is for.
        </Alert>
      ) : null}

      <p className="text-xs text-ink-soft">
        Reminder: rentals run at least {hoursLabel(rules.minRentalHours)}, book at least{" "}
        {hoursLabel(rules.minAdvanceHours)} ahead, and a car is only held for{" "}
        {hoursLabel(rules.paymentHoldHours)} unpaid.
      </p>
    </div>
  );
}
