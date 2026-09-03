import { hoursLabel, type BookingRules } from "@/lib/booking-rules";

/** The house rules, stated once in plain language wherever a student books. */
export function BookingRulesNote({
  rules,
  className = "",
}: {
  rules: BookingRules;
  className?: string;
}) {
  return (
    <ul className={`space-y-1.5 text-sm text-muted ${className}`}>
      <li className="flex gap-2">
        <span aria-hidden className="text-gold-500">
          &bull;
        </span>
        <span>
          Rentals are for <strong className="text-slate-600">at least {hoursLabel(rules.minRentalHours)}</strong>.
        </span>
      </li>
      <li className="flex gap-2">
        <span aria-hidden className="text-gold-500">
          &bull;
        </span>
        <span>
          Book <strong className="text-slate-600">at least {hoursLabel(rules.minAdvanceHours)} ahead</strong> of
          when you want to pick up.
        </span>
      </li>
      <li className="flex gap-2">
        <span aria-hidden className="text-gold-500">
          &bull;
        </span>
        <span>
          The car is held for you for{" "}
          <strong className="text-slate-600">{hoursLabel(rules.paymentHoldHours)}</strong> after you
          request it. If the office has not received payment by then the car goes
          back into the pool for anyone to book &mdash; but{" "}
          <strong className="text-slate-600">your request stays open</strong>, so if you pay later and
          nobody else has taken the car, it is still yours.
        </span>
      </li>
    </ul>
  );
}

/** The same rule 2, phrased for the confirmation screen. */
export function PaymentHoldNotice({ rules }: { rules: BookingRules }) {
  return (
    <>
      Your car is held until you have paid, for{" "}
      <strong>{hoursLabel(rules.paymentHoldHours)}</strong> from now. After that the car
      goes back into the pool and somebody else could book it. Your request does{" "}
      <strong>not</strong> disappear &mdash; pay any time and, as long as nobody else has
      taken the car, it is still yours.
    </>
  );
}
