/**
 * The booking rules as pure data and pure functions.
 *
 * Kept free of any server import so the browser can use the same wording and
 * the same arithmetic the server validates with -- a student should never be
 * told one thing on screen and another on submit.
 */
export type BookingRules = {
  /** Shortest rental a student may request. */
  minRentalHours: number;
  /** How far ahead of pickup a student has to book. */
  minAdvanceHours: number;
  /** How long an unpaid reservation keeps the car out of inventory. */
  paymentHoldHours: number;
  /** Longest rental a student may request. */
  maxBookingDays: number;
  /** How far into the future a student may book. */
  maxAdvanceDays: number;
};

export const DEFAULT_RULES: BookingRules = {
  minRentalHours: 4,
  minAdvanceHours: 2,
  paymentHoldHours: 12,
  maxBookingDays: 14,
  maxAdvanceDays: 120,
};

export function hoursLabel(hours: number): string {
  if (hours === 1) return "1 hour";
  if (hours % 24 === 0 && hours >= 24) {
    const days = hours / 24;
    return days === 1 ? "1 day" : `${days} days`;
  }
  return `${hours} hours`;
}

/**
 * Checks a requested window against the rules. Returns every problem rather
 * than the first, so a student fixes their dates once instead of three times.
 */
export function checkBookingRules(
  startsAt: Date,
  endsAt: Date,
  rules: BookingRules,
  now: Date,
): string[] {
  const problems: string[] = [];
  const lengthHours = (endsAt.getTime() - startsAt.getTime()) / 3_600_000;

  if (lengthHours < rules.minRentalHours) {
    problems.push(
      `Rentals are for at least ${hoursLabel(rules.minRentalHours)}. That window is ${
        lengthHours < 1 ? "under an hour" : hoursLabel(Math.round(lengthHours * 10) / 10)
      }.`,
    );
  }

  const noticeHours = (startsAt.getTime() - now.getTime()) / 3_600_000;
  if (noticeHours < rules.minAdvanceHours) {
    problems.push(
      `Please book at least ${hoursLabel(rules.minAdvanceHours)} ahead. Speak to the office if you need a car sooner than that.`,
    );
  }

  if (lengthHours > rules.maxBookingDays * 24) {
    problems.push(`The longest rental is ${rules.maxBookingDays} days.`);
  }

  const advanceDays = (startsAt.getTime() - now.getTime()) / 86_400_000;
  if (advanceDays > rules.maxAdvanceDays) {
    problems.push(`Bookings open ${rules.maxAdvanceDays} days ahead.`);
  }

  return problems;
}

/** When the car stops being held for an unpaid reservation. */
export function holdEndsAt(requestedAt: string | Date, rules: BookingRules): Date {
  const requested =
    typeof requestedAt === "string" ? new Date(requestedAt) : requestedAt;
  return new Date(requested.getTime() + rules.paymentHoldHours * 3_600_000);
}
