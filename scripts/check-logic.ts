import { quote, parseMoneyToCents, formatMoney } from "@/lib/pricing";
import {
  localToInstant,
  instantToLocalParts,
  hoursBetween,
  describeDuration,
  formatDate,
  formatDayLong,
} from "@/lib/dates";
import { splitIntoDaySegments, shiftMonths, startOfWeek, viewBounds } from "@/lib/calendar";
import { checkBookingRules, holdEndsAt, hoursLabel, DEFAULT_RULES } from "@/lib/booking-rules";
import { assessReturn, describeLateness, fuelLabel, DEFAULT_RETURN_RULES } from "@/lib/returns";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : `\n       got      ${JSON.stringify(actual)}\n       expected ${JSON.stringify(expected)}`}`);
}

// --- pricing --------------------------------------------------------------
const rate = 1500;      // $15/hr
const cap = 9000;       // $90/day

// 8 hours, no cap reached
let q = quote({ startsAt: new Date("2026-09-04T13:00:00Z"), endsAt: new Date("2026-09-04T21:00:00Z"),
  hourlyRateCents: rate, dailyCapCents: cap, minimumHours: 1, tollCents: 0 });
// $15/hr with a $90 cap means the cap bites at 6 hours.
check("8h at $15 caps at $90", formatMoney(q.timeChargeCents), "$90.00");

// 10 hours would be $150, capped at $90
q = quote({ startsAt: new Date("2026-09-04T10:00:00Z"), endsAt: new Date("2026-09-04T20:00:00Z"),
  hourlyRateCents: rate, dailyCapCents: cap, minimumHours: 1, tollCents: 0 });
check("10h caps at $90", formatMoney(q.timeChargeCents), "$90.00");
check("10h flags the cap", q.capApplied, true);

// 3 days exactly = 3 x cap
q = quote({ startsAt: new Date("2026-09-04T10:00:00Z"), endsAt: new Date("2026-09-07T10:00:00Z"),
  hourlyRateCents: rate, dailyCapCents: cap, minimumHours: 1, tollCents: 0 });
check("72h = 3 daily caps", formatMoney(q.timeChargeCents), "$270.00");

// 2 days + 2 hours = 2 caps + $30
q = quote({ startsAt: new Date("2026-09-04T10:00:00Z"), endsAt: new Date("2026-09-06T12:00:00Z"),
  hourlyRateCents: rate, dailyCapCents: cap, minimumHours: 1, tollCents: 1800 });
check("50h + tolls", formatMoney(q.totalCents), "$228.00");

// no cap at all
q = quote({ startsAt: new Date("2026-09-04T10:00:00Z"), endsAt: new Date("2026-09-05T10:00:00Z"),
  hourlyRateCents: rate, dailyCapCents: null, minimumHours: 1, tollCents: 0 });
check("24h uncapped = $360", formatMoney(q.timeChargeCents), "$360.00");

// rounds up to the half hour, and honours the minimum
q = quote({ startsAt: new Date("2026-09-04T10:00:00Z"), endsAt: new Date("2026-09-04T10:20:00Z"),
  hourlyRateCents: rate, dailyCapCents: cap, minimumHours: 1, tollCents: 0 });
check("20 minutes bills the 1h minimum", formatMoney(q.timeChargeCents), "$15.00");

q = quote({ startsAt: new Date("2026-09-04T10:00:00Z"), endsAt: new Date("2026-09-04T12:10:00Z"),
  hourlyRateCents: rate, dailyCapCents: cap, minimumHours: 1, tollCents: 0 });
check("2h10m rounds to 2.5h", q.billableHours, 2.5);

// negative adjustment is a discount
q = quote({ startsAt: new Date("2026-09-04T10:00:00Z"), endsAt: new Date("2026-09-04T12:00:00Z"),
  hourlyRateCents: rate, dailyCapCents: cap, minimumHours: 1, tollCents: 600, adjustmentCents: -1000 });
check("discount applies", formatMoney(q.totalCents), "$26.00");

check("parse $45.50", parseMoneyToCents("$45.50"), 4550);
check("parse blank", parseMoneyToCents(""), null);
check("parse junk", parseMoneyToCents("abc"), null);
check("parse negative", parseMoneyToCents("-10"), -1000);

// --- timezone -------------------------------------------------------------
// Sept: America/New_York is UTC-4
check("EDT 14:30 -> UTC", localToInstant("2026-09-04", "14:30").toISOString(), "2026-09-04T18:30:00.000Z");
// January: UTC-5
check("EST 14:30 -> UTC", localToInstant("2026-01-14", "14:30").toISOString(), "2026-01-14T19:30:00.000Z");
check("round trip", instantToLocalParts(localToInstant("2026-11-01", "23:30")), { date: "2026-11-01", time: "23:30" });

// Spring forward: 2 Mar 8 2026, 2am -> 3am. A 1am-to-5am booking is 3 real hours.
check("DST spring forward is 3 real hours",
  hoursBetween(localToInstant("2026-03-08", "01:00"), localToInstant("2026-03-08", "05:00")), 3);
// Fall back: Nov 1 2026, 1am-to-3am is 3 real hours.
check("DST fall back is 3 real hours",
  hoursBetween(localToInstant("2026-11-01", "01:00"), localToInstant("2026-11-01", "03:00")), 3);

check("duration wording", describeDuration(50), "2 days 2h");
check("short duration wording", describeDuration(6.5), "6h 30m");

// --- calendar -------------------------------------------------------------
check("Jan 31 + 1 month clamps to Feb", shiftMonths("2026-01-31", 1), "2026-02-28");
check("week starts Sunday", startOfWeek("2026-09-02"), "2026-08-30");
// Sept 2026 starts Tue and ends Wed, so the grid is five whole weeks.
check("month grid is whole weeks", viewBounds("month", "2026-09-15"), { from: "2026-08-30", to: "2026-10-03" });
check("month grid is a multiple of 7 days", (new Date("2026-10-03") .getTime() - new Date("2026-08-30").getTime()) / 86400000 % 7, 6);

// A Thursday 6pm to Sunday 2pm trip covers four calendar days.
const segs = splitIntoDaySegments(
  localToInstant("2026-09-03", "18:00"),
  localToInstant("2026-09-06", "14:00"),
  "2026-08-30", "2026-09-12");
check("multi-day trip splits per day", segs.map((s) => s.date),
  ["2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"]);
check("first segment starts at 6pm", Math.round(segs[0].top * 24), 18);
check("middle segment is a full day", segs[1].height, 1);
check("last segment ends at 2pm", Math.round(segs[3].height * 24), 14);

// Ending exactly at midnight must not create an empty sliver the next day.
const midnight = splitIntoDaySegments(
  localToInstant("2026-09-03", "18:00"),
  localToInstant("2026-09-04", "00:00"),
  "2026-08-30", "2026-09-12");
check("midnight end stays on one day", midnight.map((s) => s.date), ["2026-09-03"]);

// --- booking rules --------------------------------------------------------
const rules = DEFAULT_RULES;
const base = new Date("2026-09-10T12:00:00Z");
const at = (hoursFromBase: number) => new Date(base.getTime() + hoursFromBase * 3_600_000);

check("4h minimum: a 2h booking is refused",
  checkBookingRules(at(24), at(26), rules, base).length, 1);
check("4h minimum: exactly 4h is fine",
  checkBookingRules(at(24), at(28), rules, base).length, 0);
check("2h notice: 30 minutes ahead is refused",
  checkBookingRules(at(0.5), at(8), rules, base).some((p) => p.includes("ahead")), true);
check("2h notice: exactly 2h ahead is fine",
  checkBookingRules(at(2), at(8), rules, base).length, 0);
check("both rules broken are both reported",
  checkBookingRules(at(0.5), at(1.5), rules, base).length, 2);
check("longest rental is enforced",
  checkBookingRules(at(24), at(24 + 24 * 20), rules, base)
    .some((p) => p.includes("longest")), true);
check("booking too far out is refused",
  checkBookingRules(at(24 * 200), at(24 * 200 + 8), rules, base)
    .some((p) => p.includes("open")), true);

check("hold ends 12h after the request",
  holdEndsAt("2026-09-10T12:00:00Z", rules).toISOString(), "2026-09-11T00:00:00.000Z");
check("a changed hold window moves the deadline",
  holdEndsAt("2026-09-10T12:00:00Z", { ...rules, paymentHoldHours: 24 }).toISOString(),
  "2026-09-11T12:00:00.000Z");

check("hours wording: singular", hoursLabel(1), "1 hour");
check("hours wording: plural", hoursLabel(4), "4 hours");
check("hours wording: a whole day", hoursLabel(24), "1 day");
check("hours wording: several days", hoursLabel(72), "3 days");

// --- returns: lateness and fuel ------------------------------------------
const rr = DEFAULT_RETURN_RULES;           // 15 min grace, $15/hr, $8 per eighth
const due = new Date("2026-09-10T17:00:00Z");
const back = (mins: number) => new Date(due.getTime() + mins * 60_000);

check("on time costs nothing",
  assessReturn({ dueAt: due, returnedAt: back(0), fuelOut: 8, fuelIn: 8, rules: rr }).lateFeeCents, 0);
check("inside the grace period costs nothing",
  assessReturn({ dueAt: due, returnedAt: back(14), fuelOut: 8, fuelIn: 8, rules: rr }).lateFeeCents, 0);
check("a minute past grace bills the first hour",
  assessReturn({ dueAt: due, returnedAt: back(16), fuelOut: 8, fuelIn: 8, rules: rr }).lateFeeCents, 1500);
check("75 min late is one billable hour after grace",
  assessReturn({ dueAt: due, returnedAt: back(75), fuelOut: 8, fuelIn: 8, rules: rr }).lateFeeCents, 1500);
check("76 min late tips into a second hour",
  assessReturn({ dueAt: due, returnedAt: back(76), fuelOut: 8, fuelIn: 8, rules: rr }).lateFeeCents, 3000);
check("early is not negative",
  assessReturn({ dueAt: due, returnedAt: back(-60), fuelOut: 8, fuelIn: 8, rules: rr }).lateMinutes, 0);

check("returning at the level it went out is free",
  assessReturn({ dueAt: due, returnedAt: due, fuelOut: 5, fuelIn: 5, rules: rr }).fuelFeeCents, 0);
check("three eighths short costs 3 x $8",
  assessReturn({ dueAt: due, returnedAt: due, fuelOut: 8, fuelIn: 5, rules: rr }).fuelFeeCents, 2400);
check("bringing it back fuller is free, not a credit",
  assessReturn({ dueAt: due, returnedAt: due, fuelOut: 4, fuelIn: 8, rules: rr }).fuelFeeCents, 0);
check("the bar is where it went out, not full",
  assessReturn({ dueAt: due, returnedAt: due, fuelOut: 5, fuelIn: 4, rules: rr }).fuelFeeCents, 800);
check("no reading means no fuel charge",
  assessReturn({ dueAt: due, returnedAt: due, fuelOut: null, fuelIn: null, rules: rr }).fuelFeeCents, 0);
check("a zero fee rule never charges",
  assessReturn({ dueAt: due, returnedAt: back(600), fuelOut: 8, fuelIn: 0,
    rules: { lateGraceMinutes: 15, lateFeePerHourCents: 0, fuelFeePerEighthCents: 0 } }).lateFeeCents
  + assessReturn({ dueAt: due, returnedAt: back(600), fuelOut: 8, fuelIn: 0,
    rules: { lateGraceMinutes: 15, lateFeePerHourCents: 0, fuelFeePerEighthCents: 0 } }).fuelFeeCents, 0);

check("gauge wording: full", fuelLabel(8), "Full");
check("gauge wording: half", fuelLabel(4), "1/2");
check("gauge wording: five eighths", fuelLabel(5), "5/8");
check("gauge wording: empty", fuelLabel(0), "Empty");
check("gauge wording: unknown", fuelLabel(null), "--");
check("lateness wording under an hour", describeLateness(40), "40 min late");
check("lateness wording over an hour", describeLateness(95), "1h 35m late");
check("lateness wording when on time", describeLateness(0), "On time");

// A plain date column is a day, not an instant. Reading "2026-08-28" as UTC
// midnight and formatting it in America/New_York moved every payment, charge
// and incident date back a day on the statement.
check("a plain date is not shifted by the timezone",
  formatDate("2026-08-28"), "Aug 28, 2026");
check("the first of a month survives it",
  formatDate("2026-01-01"), "Jan 1, 2026");
check("a plain date reads long without shifting either",
  formatDayLong("2026-08-28"), "Friday, August 28, 2026");
check("an instant is still shown in the org timezone",
  formatDate("2026-08-29T02:00:00Z"), "Aug 28, 2026");

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
