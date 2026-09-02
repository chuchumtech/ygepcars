import type { Vehicle } from "@/lib/types";

/** Time is billed in half-hour blocks, rounded up. */
const BILLING_INCREMENT_HOURS = 0.5;

export type QuoteInput = {
  startsAt: Date;
  endsAt: Date;
  hourlyRateCents: number;
  dailyCapCents: number | null;
  minimumHours: number;
  tollCents: number;
  adjustmentCents?: number;
};

export type Quote = {
  rawHours: number;
  billableHours: number;
  fullDays: number;
  remainderHours: number;
  timeChargeCents: number;
  tollCents: number;
  adjustmentCents: number;
  totalCents: number;
  /** True when the daily cap saved the student money on at least one day. */
  capApplied: boolean;
};

function roundUpTo(value: number, increment: number): number {
  return Math.ceil(value / increment - 1e-9) * increment;
}

/**
 * Hourly rate, with an optional per-24h cap so a multi-day trip does not bill
 * 48 straight hours. Tolls are a flat per-destination fee on top.
 */
export function quote(input: QuoteInput): Quote {
  const rawHours = Math.max(
    0,
    (input.endsAt.getTime() - input.startsAt.getTime()) / 3_600_000,
  );
  const billableHours = Math.max(
    input.minimumHours,
    roundUpTo(rawHours, BILLING_INCREMENT_HOURS),
  );

  const fullDays = Math.floor(billableHours / 24);
  const remainderHours = billableHours - fullDays * 24;

  let timeChargeCents: number;
  let capApplied = false;

  if (input.dailyCapCents !== null && input.dailyCapCents !== undefined) {
    const remainderCharge = Math.round(remainderHours * input.hourlyRateCents);
    const cappedRemainder = Math.min(remainderCharge, input.dailyCapCents);
    if (fullDays > 0 || cappedRemainder < remainderCharge) capApplied = true;
    timeChargeCents = fullDays * input.dailyCapCents + cappedRemainder;
  } else {
    timeChargeCents = Math.round(billableHours * input.hourlyRateCents);
  }

  const adjustmentCents = input.adjustmentCents ?? 0;
  const totalCents = timeChargeCents + input.tollCents + adjustmentCents;

  return {
    rawHours,
    billableHours: Number(billableHours.toFixed(2)),
    fullDays,
    remainderHours: Number(remainderHours.toFixed(2)),
    timeChargeCents,
    tollCents: input.tollCents,
    adjustmentCents,
    totalCents,
    capApplied,
  };
}

export function quoteForVehicle(
  vehicle: Pick<Vehicle, "hourly_rate_cents" | "daily_cap_cents" | "minimum_hours">,
  startsAt: Date,
  endsAt: Date,
  tollCents: number,
  adjustmentCents = 0,
): Quote {
  return quote({
    startsAt,
    endsAt,
    hourlyRateCents: vehicle.hourly_rate_cents,
    dailyCapCents: vehicle.daily_cap_cents,
    minimumHours: Number(vehicle.minimum_hours) || 1,
    tollCents,
    adjustmentCents,
  });
}

export function formatMoney(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

/** Parse "$45", "45.50", " 45 " into cents. Returns null if it isn't a number. */
export function parseMoneyToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (cleaned === "" || !/^-?\d*\.?\d*$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}
