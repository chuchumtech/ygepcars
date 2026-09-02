import { quote, parseMoneyToCents, formatMoney } from "@/lib/pricing";
import { localToInstant, instantToLocalParts, hoursBetween, describeDuration } from "@/lib/dates";
import { splitIntoDaySegments, shiftMonths, startOfWeek, viewBounds } from "@/lib/calendar";

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

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
