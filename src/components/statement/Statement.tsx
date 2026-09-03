import Image from "next/image";
import { formatDate, formatRange } from "@/lib/dates";
import { formatMoney } from "@/lib/pricing";
import { describeLateness, fuelLabel } from "@/lib/returns";
import { INCIDENT_KINDS } from "@/lib/types";
import type { Incident, Payment, Profile, Reservation, StudentBalance, Vehicle } from "@/lib/types";

export type StatementLine = {
  date: string;
  kind: "rental" | "incident" | "payment";
  title: string;
  detail: string;
  /** Positive is owed, negative is paid. */
  amountCents: number;
};

type RentalRow = Reservation & { vehicle: Pick<Vehicle, "id" | "name"> | null };

/**
 * Turns rentals, incidents and payments into one dated ledger with a running
 * balance, so a student can see not just what they owe but what it is for.
 */
export function buildStatement(input: {
  reservations: RentalRow[];
  incidents: Incident[];
  payments: Payment[];
}): { lines: (StatementLine & { runningCents: number })[]; totalCents: number } {
  const lines: StatementLine[] = [];

  for (const r of input.reservations) {
    if (!["approved", "completed"].includes(r.status)) continue;

    const parts = [`Time ${formatMoney(r.time_charge_cents)}`];
    if (r.toll_cents) parts.push(`tolls ${formatMoney(r.toll_cents)}`);
    if (r.late_fee_cents) {
      parts.push(`late ${formatMoney(r.late_fee_cents)} (${describeLateness(r.late_minutes)})`);
    }
    if (r.fuel_fee_cents) {
      parts.push(
        `fuel ${formatMoney(r.fuel_fee_cents)} (back at ${fuelLabel(r.fuel_in)}, out at ${fuelLabel(r.fuel_out)})`,
      );
    }
    if (r.adjustment_cents) {
      parts.push(`${r.adjustment_reason || "adjustment"} ${formatMoney(r.adjustment_cents)}`);
    }

    lines.push({
      date: r.starts_at,
      kind: "rental",
      title: `${r.vehicle?.name ?? "Car"} — ${formatRange(r.starts_at, r.ends_at)}`,
      detail: parts.join(" · "),
      amountCents: r.total_cents,
    });
  }

  for (const i of input.incidents) {
    if (i.charge_cents === 0) continue;
    lines.push({
      date: i.occurred_on,
      kind: "incident",
      title: INCIDENT_KINDS.find((k) => k.value === i.kind)?.label ?? i.kind,
      detail: i.description,
      amountCents: i.charge_cents,
    });
  }

  for (const p of input.payments) {
    lines.push({
      date: p.paid_on,
      kind: "payment",
      title: `Payment — ${p.method}`,
      detail: [p.reference, p.note].filter(Boolean).join(" · "),
      amountCents: -p.amount_cents,
    });
  }

  lines.sort((a, b) => a.date.localeCompare(b.date));

  let running = 0;
  const withRunning = lines.map((line) => {
    running += line.amountCents;
    return { ...line, runningCents: running };
  });

  return { lines: withRunning, totalCents: running };
}

export function Statement({
  profile,
  balance,
  reservations,
  incidents,
  payments,
  orgName,
  forPrint = false,
}: {
  profile: Pick<Profile, "id" | "full_name" | "email" | "phone" | "payment_method">;
  balance: StudentBalance | null;
  reservations: RentalRow[];
  incidents: Incident[];
  payments: Payment[];
  orgName: string;
  forPrint?: boolean;
}) {
  const { lines, totalCents } = buildStatement({ reservations, incidents, payments });
  const owed = balance?.balance_cents ?? totalCents;

  return (
    <article className={forPrint ? "print-sheet" : ""}>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-line/70 pb-4">
        <div className="flex items-center gap-3">
          {forPrint ? (
            <Image src="/logo.png" alt="" width={509} height={466} className="h-12 w-auto" />
          ) : null}
          <div>
            <h2 className="text-lg font-bold text-ink">{profile.full_name}</h2>
            <p className="text-sm text-ink-soft">
              {profile.email}
              {profile.phone ? ` · ${profile.phone}` : ""}
            </p>
            <p className="text-xs text-ink-soft">
              Pays by {profile.payment_method === "zelle" ? "Zelle" : "cash"}
            </p>
          </div>
        </div>
        <div className="text-right">
          {forPrint ? <p className="text-sm font-semibold text-ink">{orgName}</p> : null}
          <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
            {owed < 0 ? "In credit" : "Balance"}
          </p>
          <p
            className={`text-2xl font-extrabold tabular-nums ${
              owed > 0 ? "text-bad" : "text-good"
            }`}
          >
            {formatMoney(Math.abs(owed))}
          </p>
          <p className="text-xs text-ink-soft">As of {formatDate(new Date())}</p>
        </div>
      </header>

      {lines.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-soft">
          Nothing on this account yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b border-line/70 text-left text-[11px] uppercase tracking-wider text-ink-soft">
                <th className="py-2 pr-3 font-bold">Date</th>
                <th className="py-2 pr-3 font-bold">What</th>
                <th className="py-2 pr-3 text-right font-bold">Charge</th>
                <th className="py-2 pr-3 text-right font-bold">Paid</th>
                <th className="py-2 text-right font-bold">Balance</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={`${line.date}-${index}`} className="border-b border-line/70 align-top">
                  <td className="py-2.5 pr-3 whitespace-nowrap text-ink-soft">
                    {formatDate(line.date)}
                  </td>
                  <td className="py-2.5 pr-3">
                    <p className="font-medium text-ink">{line.title}</p>
                    {line.detail ? (
                      <p className="text-xs text-ink-soft">{line.detail}</p>
                    ) : null}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">
                    {line.amountCents > 0 ? formatMoney(line.amountCents) : ""}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-good">
                    {line.amountCents < 0 ? formatMoney(-line.amountCents) : ""}
                  </td>
                  <td className="py-2.5 text-right font-semibold tabular-nums">
                    {formatMoney(line.runningCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <footer className="mt-6 border-t border-line/70 pt-3 text-xs text-ink-soft">
        <p>
          Charges cover time, tolls and anything added at return. Nothing is taken
          online — settle up with the office.
        </p>
      </footer>
    </article>
  );
}
