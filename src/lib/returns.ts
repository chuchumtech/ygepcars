/**
 * Returning a car: fuel, lateness, and what each costs.
 *
 * Fuel is counted in eighths because that is what a gauge shows. The car keeps
 * its level between renters: whatever it comes back at becomes what the next
 * student has to match, so nobody ends up buying fuel for someone else's trip.
 */
export const FUEL_STEPS = 8;

const FUEL_LABELS: Record<number, string> = {
  0: "Empty",
  1: "1/8",
  2: "1/4",
  3: "3/8",
  4: "1/2",
  5: "5/8",
  6: "3/4",
  7: "7/8",
  8: "Full",
};

export function fuelLabel(eighths: number | null | undefined): string {
  if (eighths === null || eighths === undefined) return "--";
  return FUEL_LABELS[Math.max(0, Math.min(FUEL_STEPS, Math.round(eighths)))] ?? "--";
}

export const FUEL_OPTIONS = Array.from({ length: FUEL_STEPS + 1 }, (_, i) => ({
  value: i,
  label: fuelLabel(i),
}));

export type ReturnRules = {
  lateGraceMinutes: number;
  lateFeePerHourCents: number;
  fuelFeePerEighthCents: number;
};

export const DEFAULT_RETURN_RULES: ReturnRules = {
  lateGraceMinutes: 15,
  lateFeePerHourCents: 1500,
  fuelFeePerEighthCents: 800,
};

export type ReturnAssessment = {
  lateMinutes: number;
  /** Minutes past the grace period, which is what actually gets billed. */
  billableLateMinutes: number;
  lateFeeCents: number;
  fuelShortfallEighths: number;
  fuelFeeCents: number;
};

/**
 * Works out what a return costs.
 *
 * Lateness is billed by the hour, rounded up, and only once past the grace
 * period -- five minutes late should not cost anybody anything. Fuel is billed
 * per eighth short of the level the car went out at; bringing it back fuller
 * than that is free, not a credit.
 */
export function assessReturn(input: {
  dueAt: Date;
  returnedAt: Date;
  fuelOut: number | null;
  fuelIn: number | null;
  rules: ReturnRules;
}): ReturnAssessment {
  const { dueAt, returnedAt, fuelOut, fuelIn, rules } = input;

  const lateMinutes = Math.max(
    0,
    Math.round((returnedAt.getTime() - dueAt.getTime()) / 60_000),
  );
  const billableLateMinutes = Math.max(0, lateMinutes - rules.lateGraceMinutes);
  const lateFeeCents =
    billableLateMinutes > 0
      ? Math.ceil(billableLateMinutes / 60) * rules.lateFeePerHourCents
      : 0;

  const fuelShortfallEighths =
    fuelOut === null || fuelIn === null ? 0 : Math.max(0, fuelOut - fuelIn);
  const fuelFeeCents = fuelShortfallEighths * rules.fuelFeePerEighthCents;

  return {
    lateMinutes,
    billableLateMinutes,
    lateFeeCents,
    fuelShortfallEighths,
    fuelFeeCents,
  };
}

export function describeLateness(minutes: number): string {
  if (minutes <= 0) return "On time";
  if (minutes < 60) return `${minutes} min late`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m late` : `${hours}h late`;
}
