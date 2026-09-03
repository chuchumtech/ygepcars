import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { officeRecipients, sendOfficeEmail } from "./send";
import {
  cancellationEmail,
  newAccountEmail,
  newRequestEmail,
  studentApprovedEmail,
  studentDeclinedEmail,
  waitlistEmail,
  type ReservationEmailInput,
} from "./templates";

type NotifySetting =
  | "notify_on_new_request"
  | "notify_on_cancellation"
  | "notify_on_new_account"
  | "notify_on_waitlist";

/**
 * Recipients for a notification: the env var, plus anything the office added in
 * Settings. Returns an empty list when the office has switched this kind off.
 */
async function recipientsFor(setting: NotifySetting): Promise<string[]> {
  const fromEnv = officeRecipients();

  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("cars_settings")
      .select("key, value")
      .in("key", [setting, "notify_office_emails"]);

    const rows = (data ?? []) as { key: string; value: unknown }[];
    const enabled = rows.find((row) => row.key === setting)?.value;
    if (enabled === false) return [];

    const extra = rows.find((row) => row.key === "notify_office_emails")?.value;
    const fromSettings = Array.isArray(extra)
      ? extra.filter((value): value is string => typeof value === "string")
      : [];

    return [...new Set([...fromEnv, ...fromSettings].map((a) => a.trim()).filter(Boolean))];
  } catch {
    // If settings cannot be read, fall back to the env var rather than going silent.
    return fromEnv;
  }
}

export async function notifyNewRequest(input: ReservationEmailInput & { reservationId: string }) {
  const to = await recipientsFor("notify_on_new_request");
  if (to.length === 0) return;
  const mail = newRequestEmail(input);
  await sendOfficeEmail({
    to,
    ...mail,
    kind: "new_request",
    entityType: "reservation",
    entityId: input.reservationId,
    replyTo: input.studentEmail || undefined,
  });
}

export async function notifyCancellation(
  input: ReservationEmailInput & { reservationId: string; wasApproved: boolean },
) {
  const to = await recipientsFor("notify_on_cancellation");
  if (to.length === 0) return;
  const mail = cancellationEmail(input);
  await sendOfficeEmail({
    to,
    ...mail,
    kind: "cancellation",
    entityType: "reservation",
    entityId: input.reservationId,
  });
}

export async function notifyNewAccount(input: {
  userId: string;
  name: string;
  email: string;
  phone: string;
}) {
  const to = await recipientsFor("notify_on_new_account");
  if (to.length === 0) return;
  const mail = newAccountEmail(input);
  await sendOfficeEmail({
    to,
    ...mail,
    kind: "new_account",
    entityType: "student",
    entityId: input.userId,
  });
}

export async function notifyWaitlistJoin(input: {
  waitlistId: string;
  studentName: string;
  studentPhone: string;
  vehicleName: string;
  startsAt: string;
  endsAt: string;
  destinationLabel: string;
  flexible: boolean;
  totalWaiting: number;
}) {
  const to = await recipientsFor("notify_on_waitlist");
  if (to.length === 0) return;
  const mail = waitlistEmail(input);
  await sendOfficeEmail({
    to,
    ...mail,
    kind: "waitlist_join",
    entityType: "waitlist",
    entityId: input.waitlistId,
  });
}

/* -------------------------------------------------------------------------- */
/* To the student                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Student mail is gated twice: a master switch the office can flip in one
 * place, and a per-kind switch under it. Both default to the master being off,
 * so nothing reaches a student until the office says so.
 */
async function studentMailAllowed(
  kind: "notify_student_on_approved" | "notify_student_on_declined",
): Promise<boolean> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("cars_settings")
      .select("key, value")
      .in("key", ["notify_students", kind]);

    const bag = new Map(
      ((data ?? []) as { key: string; value: unknown }[]).map((r) => [r.key, r.value]),
    );
    if (bag.get("notify_students") !== true) return false;
    return bag.get(kind) !== false;
  } catch {
    // If the switch cannot be read, stay quiet rather than mail a student by
    // accident.
    return false;
  }
}

export async function notifyStudentApproved(input: {
  reservationId: string;
  to: string;
  studentName: string;
  vehicleName: string;
  startsAt: string;
  endsAt: string;
  destinationLabel: string;
  totalCents: number;
  reference: string;
}) {
  if (!input.to) return;
  if (!(await studentMailAllowed("notify_student_on_approved"))) return;

  const mail = studentApprovedEmail(input);
  await sendOfficeEmail({
    to: [input.to],
    ...mail,
    kind: "student_approved",
    entityType: "reservation",
    entityId: input.reservationId,
  });
}

export async function notifyStudentDeclined(input: {
  reservationId: string;
  to: string;
  studentName: string;
  vehicleName: string;
  startsAt: string;
  endsAt: string;
  declineReason: string;
}) {
  if (!input.to) return;
  if (!(await studentMailAllowed("notify_student_on_declined"))) return;

  const mail = studentDeclinedEmail(input);
  await sendOfficeEmail({
    to: [input.to],
    ...mail,
    kind: "student_declined",
    entityType: "reservation",
    entityId: input.reservationId,
  });
}
