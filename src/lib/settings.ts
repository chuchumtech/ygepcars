import "server-only";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_RULES, type BookingRules } from "@/lib/booking-rules";

export type { BookingRules } from "@/lib/booking-rules";
export { DEFAULT_RULES, hoursLabel, checkBookingRules, holdEndsAt } from "@/lib/booking-rules";

export type OrgSettings = BookingRules & {
  orgName: string;
  officeEmail: string;
  officePhone: string;
  bookingNotice: string;
};

function toNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/** Reads the settings bag once. Falls back to the defaults on any problem. */
export async function loadSettings(): Promise<OrgSettings> {
  const base: OrgSettings = {
    ...DEFAULT_RULES,
    orgName: "Yeshiva Gedolah of Elkins Park",
    officeEmail: "",
    officePhone: "",
    bookingNotice: "",
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
      orgName: toText(bag.get("org_name"), base.orgName),
      officeEmail: toText(bag.get("office_email")),
      officePhone: toText(bag.get("office_phone")),
      bookingNotice: toText(bag.get("booking_notice")),
    };
  } catch {
    return base;
  }
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
