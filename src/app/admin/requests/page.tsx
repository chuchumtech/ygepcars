import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { RESERVATION_SELECT } from "@/lib/admin-queries";
import { ReservationTable } from "@/components/calendar/ReservationTable";
import { EmptyState, PageHeader, ProfileBadge } from "@/components/ui";
import { ApproveAccountForm } from "./ApproveAccountForm";
import { formatDate } from "@/lib/dates";
import type { AdminReservation } from "@/components/calendar/types";
import type { Destination, Profile, Vehicle } from "@/lib/types";

export const metadata: Metadata = { title: "Requests" };

export default async function RequestsPage() {
  const supabase = await createClient();

  const [requests, accounts, vehicles, destinations] = await Promise.all([
    supabase
      .from("cars_reservations")
      .select(RESERVATION_SELECT)
      .eq("status", "pending")
      .order("starts_at"),
    supabase
      .from("cars_profiles")
      .select("*")
      .eq("status", "pending")
      .order("created_at"),
    supabase.from("cars_vehicles").select("*").order("sort_order"),
    supabase.from("cars_destinations").select("*").order("sort_order"),
  ]);

  const pendingReservations = (requests.data ?? []) as AdminReservation[];
  const pendingAccounts = (accounts.data ?? []) as Profile[];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Requests"
        description="New reservation requests and new student accounts, both waiting on you."
      />

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted">
          Reservation requests
          {pendingReservations.length > 0 ? (
            <span className="chip bg-amber-100 text-amber-800">
              {pendingReservations.length}
            </span>
          ) : null}
        </h2>

        {pendingReservations.length === 0 ? (
          <EmptyState
            title="No requests waiting"
            description="Every reservation request has been decided."
          />
        ) : (
          <ReservationTable
            reservations={pendingReservations}
            vehicles={(vehicles.data ?? []) as Vehicle[]}
            destinations={(destinations.data ?? []) as Destination[]}
          />
        )}
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted">
          New accounts
          {pendingAccounts.length > 0 ? (
            <span className="chip bg-amber-100 text-amber-800">
              {pendingAccounts.length}
            </span>
          ) : null}
        </h2>

        {pendingAccounts.length === 0 ? (
          <EmptyState
            title="No accounts waiting"
            description="Everyone who has registered has been dealt with."
          />
        ) : (
          <div className="card divide-y divide-[var(--color-line)]">
            {pendingAccounts.map((account) => (
              <div
                key={account.id}
                className="flex flex-wrap items-center justify-between gap-4 p-4"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-navy-800">{account.full_name}</p>
                    <ProfileBadge status={account.status} />
                  </div>
                  <p className="mt-0.5 text-sm text-muted">
                    {account.email} · {account.phone || "no phone"}
                  </p>
                  <p className="text-xs text-muted">
                    Registered {formatDate(account.created_at)}
                  </p>
                </div>
                <ApproveAccountForm studentId={account.id} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
