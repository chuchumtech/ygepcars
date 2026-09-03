import Image from "next/image";
import { formatDate, formatRange } from "@/lib/dates";
import { formatMoney } from "@/lib/pricing";
import { describeLateness, fuelLabel } from "@/lib/returns";
import { INCIDENT_KINDS, paymentMethodLabel } from "@/lib/types";
import type {
  AccountCharge,
  Incident,
  Payment,
  Profile,
  Reservation,
  ReservationItem,
  StudentBalance,
  Vehicle,
} from "@/lib/types";

/** One printed row. Positive is owed, negative is money in or a credit. */
export type StatementLine = {
  date: string;
  /** Set on the first row of a rental, which the others sit under. */
  heading?: string;
  reference?: string;
  description: string;
  amountCents: number;
};

type RentalRow = Reservation & {
  vehicle: Pick<Vehicle, "id" | "name"> | null;
  items?: ReservationItem[];
};

type Group = { date: string; lines: StatementLine[] };

/**
 * Turns everything on an account into the rows of a statement.
 *
 * A rental is not one opaque number: it opens as a dated heading and then
 * itemises what made it up -- the time, the tolls, whatever the office added
 * by hand and called something, the fees from the return. That is the whole
 * point of the line items carrying a description.
 */
export function buildStatement(input: {
  reservations: RentalRow[];
  incidents: Incident[];
  charges: AccountCharge[];
  payments: Payment[];
}): {
  lines: (StatementLine & { first: boolean; runningCents: number })[];
  chargedCents: number;
  paidCents: number;
  balanceCents: number;
} {
  const groups: Group[] = [];

  for (const r of input.reservations) {
    if (!["approved", "completed"].includes(r.status)) continue;

    const lines: StatementLine[] = [
      {
        date: r.starts_at,
        heading: `${r.vehicle?.name ?? "Car"} · ${formatRange(r.starts_at, r.ends_at)}`,
        reference: r.reference,
        description: `Time — ${r.billable_hours} hrs at ${formatMoney(r.hourly_rate_cents)}/hr${
          r.daily_cap_cents ? ` (${formatMoney(r.daily_cap_cents)} daily cap)` : ""
        }`,
        amountCents: r.time_charge_cents,
      },
    ];

    if (r.toll_cents) {
      lines.push({
        date: r.starts_at,
        description: r.destination_label ? `Tolls — ${r.destination_label}` : "Tolls",
        amountCents: r.toll_cents,
      });
    }

    // The office's own wording, which is the reason these exist.
    for (const item of r.items ?? []) {
      lines.push({
        date: r.starts_at,
        description: item.description || (item.kind === "discount" ? "Discount" : "Charge"),
        amountCents: item.signed_cents,
      });
    }

    // A reservation from before line items existed still carries its own
    // adjustment; show it rather than letting the total not add up.
    const itemised = (r.items ?? []).reduce((sum, i) => sum + i.signed_cents, 0);
    if (r.adjustment_cents !== itemised) {
      lines.push({
        date: r.starts_at,
        description: r.adjustment_reason || "Adjustment",
        amountCents: r.adjustment_cents - itemised,
      });
    }

    if (r.late_fee_cents) {
      lines.push({
        date: r.returned_at ?? r.ends_at,
        description: `Returned late — ${describeLateness(r.late_minutes)}`,
        amountCents: r.late_fee_cents,
      });
    }
    if (r.fuel_fee_cents) {
      lines.push({
        date: r.returned_at ?? r.ends_at,
        description: `Fuel not replaced — out at ${fuelLabel(r.fuel_out)}, back at ${fuelLabel(r.fuel_in)}`,
        amountCents: r.fuel_fee_cents,
      });
    }

    groups.push({ date: r.starts_at, lines });
  }

  for (const i of input.incidents) {
    if (i.charge_cents === 0) continue;
    const kind = INCIDENT_KINDS.find((k) => k.value === i.kind)?.label ?? i.kind;
    groups.push({
      date: i.occurred_on,
      lines: [
        {
          date: i.occurred_on,
          description: i.description ? `${kind} — ${i.description}` : kind,
          amountCents: i.charge_cents,
        },
      ],
    });
  }

  for (const c of input.charges) {
    groups.push({
      date: c.charged_on,
      lines: [
        {
          date: c.charged_on,
          description: c.description || (c.amount_cents < 0 ? "Credit" : "Charge"),
          amountCents: c.amount_cents,
        },
      ],
    });
  }

  for (const p of input.payments) {
    const detail = [paymentMethodLabel(p.method), p.reference].filter(Boolean).join(" · ");
    groups.push({
      date: p.paid_on,
      lines: [
        {
          date: p.paid_on,
          description: `Payment received — ${detail}`,
          amountCents: -p.amount_cents,
        },
      ],
    });
  }

  // Oldest first, the way a statement reads, with each rental's own rows kept
  // together underneath its heading.
  groups.sort((a, b) => a.date.localeCompare(b.date));

  let running = 0;
  let charged = 0;
  let paid = 0;

  const lines = groups
    // `first` is what earns a date and a rule above it. It is not the same as
    // having a heading: a payment or an account charge is its own dated entry
    // with no heading, and without this it was drawn as though it belonged to
    // the rental above it.
    .flatMap((group) => group.lines.map((line, index) => ({ ...line, first: index === 0 })))
    .map((line) => {
      running += line.amountCents;
      if (line.amountCents < 0) paid += -line.amountCents;
      else charged += line.amountCents;
      return { ...line, runningCents: running };
    });

  return {
    lines,
    chargedCents: charged,
    paidCents: paid,
    balanceCents: running,
  };
}

export function Statement({
  profile,
  balance,
  reservations,
  incidents,
  charges,
  payments,
  orgName,
  forPrint = false,
}: {
  profile: Pick<Profile, "id" | "full_name" | "email" | "phone" | "payment_method">;
  balance: StudentBalance | null;
  reservations: RentalRow[];
  incidents: Incident[];
  charges: AccountCharge[];
  payments: Payment[];
  orgName: string;
  forPrint?: boolean;
}) {
  const statement = buildStatement({ reservations, incidents, charges, payments });

  // The view is the authority when it is there: it counts the whole account,
  // including anything a filtered query on this page left out.
  const owed = balance?.balance_cents ?? statement.balanceCents;
  const inCredit = owed < 0;

  return (
    <article className={forPrint ? "print-sheet" : ""}>
      <header className="flex flex-wrap items-start justify-between gap-6 pb-5">
        <div className="flex items-start gap-3">
          <Image
            src="/logo.png"
            alt=""
            width={509}
            height={466}
            className="h-14 w-auto"
          />
          <div>
            <p className="text-base font-bold leading-tight text-ink">{orgName}</p>
            <p className="text-sm text-ink-soft">Car rental</p>
          </div>
        </div>

        <div className="text-right">
          <p className="text-2xl font-extrabold uppercase tracking-tight text-ink">
            Statement
          </p>
          <p className="text-sm text-ink-soft">{formatDate(new Date())}</p>
        </div>
      </header>

      <div className="grid gap-5 border-y border-line/70 py-4 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-ink-soft">
            Account
          </p>
          <p className="font-bold text-ink">{profile.full_name}</p>
          {profile.email ? <p className="text-sm text-ink-soft">{profile.email}</p> : null}
          {profile.phone ? <p className="text-sm text-ink-soft">{profile.phone}</p> : null}
          <p className="mt-1 text-sm text-ink-soft">
            Pays by {profile.payment_method === "cash" ? "cash" : "Zelle"}
          </p>
        </div>

        <dl className="sm:justify-self-end sm:text-right">
          <div className="flex justify-between gap-8 py-0.5 text-sm">
            <dt className="text-ink-soft">Charges</dt>
            <dd className="tabular-nums text-ink">{formatMoney(statement.chargedCents)}</dd>
          </div>
          <div className="flex justify-between gap-8 py-0.5 text-sm">
            <dt className="text-ink-soft">Payments and credits</dt>
            <dd className="tabular-nums text-good">−{formatMoney(statement.paidCents)}</dd>
          </div>
          <div className="mt-1 flex justify-between gap-8 border-t border-line pt-1.5">
            <dt className="font-bold text-ink">
              {inCredit ? "In credit" : owed === 0 ? "Balance" : "Balance due"}
            </dt>
            <dd
              className={`text-lg font-extrabold tabular-nums ${
                owed > 0 ? "text-bad" : "text-good"
              }`}
            >
              {formatMoney(Math.abs(owed))}
            </dd>
          </div>
        </dl>
      </div>

      {statement.lines.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-soft">
          Nothing on this account yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[38rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink/20 text-left text-[11px] uppercase tracking-wider text-ink-soft">
                <th className="w-24 py-2 pr-3 font-bold">Date</th>
                <th className="py-2 pr-3 font-bold">Description</th>
                <th className="w-24 py-2 pr-3 text-right font-bold">Charge</th>
                <th className="w-24 py-2 pr-3 text-right font-bold">Credit</th>
                <th className="w-28 py-2 text-right font-bold">Balance</th>
              </tr>
            </thead>
            <tbody>
              {statement.lines.map((line, index) => (
                <tr
                  key={`${line.date}-${index}`}
                  className={
                    line.first
                      ? "border-t border-line/70 align-top [&>td]:pt-3"
                      : "align-top"
                  }
                >
                  <td className="whitespace-nowrap py-1 pr-3 text-ink-soft">
                    {line.first ? formatDate(line.date) : ""}
                    {line.reference ? (
                      <span className="block text-xs">{line.reference}</span>
                    ) : null}
                  </td>
                  <td className="py-1 pr-3">
                    {line.heading ? (
                      <p className="font-bold text-ink">{line.heading}</p>
                    ) : null}
                    <p className={line.heading ? "text-ink-soft" : "text-ink"}>
                      {line.description}
                    </p>
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">
                    {line.amountCents > 0 ? formatMoney(line.amountCents) : ""}
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums text-good">
                    {line.amountCents < 0 ? formatMoney(-line.amountCents) : ""}
                  </td>
                  <td className="py-1 text-right font-semibold tabular-nums">
                    {formatMoney(line.runningCents)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-ink/30">
                <td colSpan={4} className="py-3 pr-3 text-right font-bold text-ink">
                  {inCredit ? "In credit" : "Balance due"}
                </td>
                <td
                  className={`py-3 text-right text-base font-extrabold tabular-nums ${
                    owed > 0 ? "text-bad" : "text-good"
                  }`}
                >
                  {formatMoney(Math.abs(owed))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <footer className="mt-6 border-t border-line/70 pt-3 text-xs leading-relaxed text-ink-soft">
        {inCredit ? (
          <p>
            You are paid ahead by {formatMoney(-owed)}. It comes off your next rental —
            nothing to do.
          </p>
        ) : owed > 0 ? (
          <p>
            Nothing is charged online. Settle up with the office
            {profile.payment_method === "cash" ? " in cash" : " by Zelle"}, or however
            suits.
          </p>
        ) : (
          <p>Nothing outstanding. Thank you.</p>
        )}
        <p className="mt-1">
          Charges cover time and tolls, anything added at the return, and anything the
          office has put on the account. Questions about a line go to the office.
        </p>
      </footer>
    </article>
  );
}
