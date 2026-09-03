import "server-only";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_RULES, type BookingRules } from "@/lib/booking-rules";
import { DEFAULT_RETURN_RULES, type ReturnRules } from "@/lib/returns";

export type { BookingRules } from "@/lib/booking-rules";
export { DEFAULT_RULES, hoursLabel, checkBookingRules, holdEndsAt } from "@/lib/booking-rules";

export type OrgSettings = BookingRules &
  ReturnRules & {
    orgName: string;
    officeEmail: string;
    officePhone: string;
    bookingNotice: string;
    /** Master switch for anything emailed to a student. */
    notifyStudents: boolean;
    notifyStudentOnApproved: boolean;
    notifyStudentOnDeclined: boolean;
  };

function toNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Like toNumber, but zero is a legitimate answer -- a zero fee or grace
    period means "do not charge", not "use the default". */
function toNumberOrZero(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function toText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function toBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

/** Reads the settings bag once. Falls back to the defaults on any problem. */
export async function loadSettings(): Promise<OrgSettings> {
  const base: OrgSettings = {
    ...DEFAULT_RULES,
    ...DEFAULT_RETURN_RULES,
    orgName: "Yeshiva Gedolah of Elkins Park",
    officeEmail: "",
    officePhone: "",
    bookingNotice: "",
    notifyStudents: false,
    notifyStudentOnApproved: true,
    notifyStudentOnDeclined: true,
  };

  try {
    const supabase = await createClient();
    const { data } = await supabase.from("cars_settings").select("key, value");
    const rows = (data ?? []) as { key: string; value: unknown }[];
    const bag = new Map(rows.map((row) => [row.key, row.value]));

    return {
      minRentalHours: toNumber(bag.get("min_rental_hours"), DEFAULT_RULES.minRentalHours),
      minAdvanceHours: toNumber(bag.get("min_advance_hours"), DEFAULT_RULES.minAdvanceHours),
      paymentHoldHours: toNumber(bag.get("payment_hold_hours"), DEFAULT_RULES.paymentHoldHours),
      maxBookingDays: toNumber(bag.get("max_booking_days"), DEFAULT_RULES.maxBookingDays),
      maxAdvanceDays: toNumber(bag.get("max_advance_days"), DEFAULT_RULES.maxAdvanceDays),
      lateGraceMinutes: toNumberOrZero(
        bag.get("late_grace_minutes"),
        DEFAULT_RETURN_RULES.lateGraceMinutes,
      ),
      lateFeePerHourCents: toNumberOrZero(
        bag.get("late_fee_per_hour_cents"),
        DEFAULT_RETURN_RULES.lateFeePerHourCents,
      ),
      fuelFeePerEighthCents: toNumberOrZero(
        bag.get("fuel_fee_per_eighth_cents"),
        DEFAULT_RETURN_RULES.fuelFeePerEighthCents,
      ),
      notifyStudents: toBool(bag.get("notify_students"), false),
      notifyStudentOnApproved: toBool(bag.get("notify_student_on_approved"), true),
      notifyStudentOnDeclined: toBool(bag.get("notify_student_on_declined"), true),
      orgName: toText(bag.get("org_name"), base.orgName),
      officeEmail: toText(bag.get("office_email")),
      officePhone: toText(bag.get("office_phone")),
      bookingNotice: toText(bag.get("booking_notice")),
    };
  } catch {
    return base;
  }
}

/** Just the return rules, for the check-in path. */
export async function loadReturnRules(): Promise<ReturnRules> {
  const s = await loadSettings();
  return {
    lateGraceMinutes: s.lateGraceMinutes,
    lateFeePerHourCents: s.lateFeePerHourCents,
    fuelFeePerEighthCents: s.fuelFeePerEighthCents,
  };
}

/** Just the rules, for the request path. */
export async function loadBookingRules(): Promise<BookingRules> {
  const settings = await loadSettings();
  return {
    minRentalHours: settings.minRentalHours,
    minAdvanceHours: settings.minAdvanceHours,
    paymentHoldHours: settings.paymentHoldHours,
    maxBookingDays: settings.maxBookingDays,
    maxAdvanceDays: settings.maxAdvanceDays,
  };
}
