import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, ProfileBadge, StatTile } from "@/components/ui";
import { InviteStudentButton } from "./InviteStudentButton";
import { formatMoney } from "@/lib/pricing";
import { formatDate } from "@/lib/dates";
import type { Profile, StudentBalance } from "@/lib/types";

export const metadata: Metadata = { title: "Students" };

const FILTERS = [
  { value: "all", label: "Everyone" },
  { value: "active", label: "Active" },
  { value: "pending", label: "Awaiting approval" },
  { value: "locked", label: "Locked out" },
  { value: "owing", label: "Owes money" },
];

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const params = await searchParams;
  const filter = FILTERS.some((f) => f.value === params.filter) ? params.filter! : "all";
  const search = (params.q ?? "").trim();

  const supabase = await createClient();

  const [profiles, balances] = await Promise.all([
    supabase.from("cars_profiles").select("*").order("full_name"),
    supabase.from("cars_student_balances").select("*"),
  ]);

  const balanceById = new Map(
    ((balances.data ?? []) as StudentBalance[]).map((row) => [row.user_id, row]),
  );

  let people = (profiles.data ?? []) as Profile[];

  if (filter === "owing") {
    people = people.filter((person) => (balanceById.get(person.id)?.balance_cents ?? 0) > 0);
  } else if (filter !== "all") {
    people = people.filter((person) => person.status === filter);
  }

  if (search) {
    const needle = search.toLowerCase();
    people = people.filter((person) =>
      `${person.full_name} ${person.email} ${person.phone}`.toLowerCase().includes(needle),
    );
  }

  const totals = {
    active: ((profiles.data ?? []) as Profile[]).filter((p) => p.status === "active").length,
    owed: [...balanceById.values()]
      .filter((row) => row.balance_cents > 0)
      .reduce((sum, row) => sum + row.balance_cents, 0),
    paid: [...balanceById.values()].reduce((sum, row) => sum + row.paid_cents, 0),
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Students"
        description="Everyone with an account, what they have rented, and where they stand."
        actions={<InviteStudentButton />}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Active accounts" value={String(totals.active)} />
        <StatTile
          label="Outstanding"
          value={formatMoney(totals.owed)}
          tone={totals.owed > 0 ? "bad" : "good"}
        />
        <StatTile label="Collected all-time" value={formatMoney(totals.paid)} tone="good" />
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
            Show
          </p>
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((option) => (
              <Link
                key={option.value}
                href={`/admin/students?filter=${option.value}${search ? `&q=${encodeURIComponent(search)}` : ""}`}
                scroll={false}
                className={`chip border transition ${
                  filter === option.value
                    ? "border-slate-500 bg-slate-500 text-white"
                    : "border-[var(--color-line)] bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {option.label}
              </Link>
            ))}
          </div>
        </div>

        <form className="ml-auto flex gap-2" action="/admin/students">
          <input type="hidden" name="filter" value={filter} />
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Name, email or phone"
            className="input h-10 w-56 py-2 text-sm"
            aria-label="Search students"
          />
          <button type="submit" className="btn-secondary btn-sm">
            Search
          </button>
        </form>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[44rem]">
          <thead className="border-b border-[var(--color-line)] bg-navy-50">
            <tr>
              <th className="th">Student</th>
              <th className="th">Status</th>
              <th className="th text-right">Rentals</th>
              <th className="th text-right">Charged</th>
              <th className="th text-right">Paid</th>
              <th className="th text-right">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-line)]">
            {people.map((person) => {
              const balance = balanceById.get(person.id);
              const owed = balance?.balance_cents ?? 0;

              return (
                <tr key={person.id} className="transition hover:bg-navy-50">
                  <td className="td">
                    <Link
                      href={`/admin/students/${person.id}`}
                      className="font-semibold text-navy-800 hover:underline"
                    >
                      {person.full_name || "(no name)"}
                    </Link>
                    <p className="text-xs text-muted">
                      {person.email}
                      {person.role === "admin" ? " · office admin" : ""}
                    </p>
                    <p className="text-xs text-muted">
                      Joined {formatDate(person.created_at)}
                    </p>
                  </td>
                  <td className="td">
                    <ProfileBadge status={person.status} />
                  </td>
                  <td className="td text-right tabular-nums">
                    {balance?.reservation_count ?? 0}
                  </td>
                  <td className="td text-right tabular-nums">
                    {formatMoney(balance?.charged_cents ?? 0)}
                  </td>
                  <td className="td text-right tabular-nums">
                    {formatMoney(balance?.paid_cents ?? 0)}
                  </td>
                  <td
                    className={`td text-right font-semibold tabular-nums ${
                      owed > 0 ? "text-red-700" : owed < 0 ? "text-emerald-700" : ""
                    }`}
                  >
                    {formatMoney(owed)}
                  </td>
                </tr>
              );
            })}
            {people.length === 0 ? (
              <tr>
                <td className="td text-muted" colSpan={6}>
                  Nobody matches that.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
