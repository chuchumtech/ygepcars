import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { RESERVATION_SELECT } from "@/lib/admin-queries";
import { ReservationTable } from "@/components/calendar/ReservationTable";
import { PageHeader, ProfileBadge, StatTile } from "@/components/ui";
import { StudentControls } from "./StudentControls";
import { PaymentsPanel } from "./PaymentsPanel";
import { formatMoney } from "@/lib/pricing";
import { formatDate } from "@/lib/dates";
import type { AdminReservation } from "@/components/calendar/types";
import type { Destination, Payment, Profile, StudentBalance, Vehicle } from "@/lib/types";

export const metadata: Metadata = { title: "Student" };

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: profileRow } = await supabase
    .from("cars_profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const profile = profileRow as Profile | null;
  if (!profile) notFound();

  const [reservationsResult, paymentsResult, balanceResult, vehicles, destinations] =
    await Promise.all([
      supabase
        .from("cars_reservations")
        .select(RESERVATION_SELECT)
        .eq("user_id", id)
        .order("starts_at", { ascending: false }),
      supabase
        .from("cars_payments")
        .select("*")
        .eq("user_id", id)
        .order("paid_on", { ascending: false }),
      supabase
        .from("cars_student_balances")
        .select("*")
        .eq("user_id", id)
        .maybeSingle(),
      supabase.from("cars_vehicles").select("*").order("sort_order"),
      supabase.from("cars_destinations").select("*").order("sort_order"),
    ]);

  const reservations = (reservationsResult.data ?? []) as AdminReservation[];
  const payments = (paymentsResult.data ?? []) as Payment[];
  const balance = (balanceResult.data ?? null) as StudentBalance | null;

  // Server Component: this renders once per request, so reading the clock here
  // is exactly what we want.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const pending = reservations.filter((r) => r.status === "pending");
  const upcoming = reservations.filter(
    (r) => r.status === "approved" && new Date(r.ends_at).getTime() >= now,
  );
  const history = reservations.filter(
    (r) => !pending.includes(r) && !upcoming.includes(r),
  );

  const owed = balance?.balance_cents ?? 0;

  return (
    <div className="space-y-7">
      <div>
        <Link href="/admin/students" className="text-sm text-ink-soft hover:text-ink">
          &larr; All students
        </Link>
        <PageHeader
          title={profile.full_name || "(no name)"}
          description={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <ProfileBadge status={profile.status} />
              {profile.role === "admin" ? (
                <span className="chip bg-gold-100 text-gold-600">Office admin</span>
              ) : null}
              <span>{profile.email}</span>
              {profile.phone ? (
                <a href={`tel:${profile.phone}`} className="link">
                  {profile.phone}
                </a>
              ) : null}
              <span>Joined {formatDate(profile.created_at)}</span>
            </span>
          }
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Rentals" value={String(balance?.reservation_count ?? 0)} />
        <StatTile label="Charged" value={formatMoney(balance?.charged_cents ?? 0)} />
        <StatTile label="Paid" value={formatMoney(balance?.paid_cents ?? 0)} tone="good" />
        <StatTile
          label={owed < 0 ? "Credit" : "Balance owed"}
          value={formatMoney(Math.abs(owed))}
          tone={owed > 0 ? "bad" : owed < 0 ? "good" : "default"}
        />
      </div>

      <StudentControls profile={profile} />

      {pending.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-soft">
            Pending requests
          </h2>
          <ReservationTable
            reservations={pending}
            vehicles={(vehicles.data ?? []) as Vehicle[]}
            destinations={(destinations.data ?? []) as Destination[]}
            showStudent={false}
          />
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-soft">
          Upcoming
        </h2>
        <ReservationTable
          reservations={upcoming}
          vehicles={(vehicles.data ?? []) as Vehicle[]}
          destinations={(destinations.data ?? []) as Destination[]}
          emptyMessage="Nothing booked coming up."
          showStudent={false}
        />
      </section>

      <PaymentsPanel
        studentId={profile.id}
        payments={payments}
        reservations={reservations}
        balanceCents={owed}
      />

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-soft">
          Rental history
        </h2>
        <ReservationTable
          reservations={history}
          vehicles={(vehicles.data ?? []) as Vehicle[]}
          destinations={(destinations.data ?? []) as Destination[]}
          emptyMessage="No past rentals yet."
          showStudent={false}
        />
      </section>
    </div>
  );
}
