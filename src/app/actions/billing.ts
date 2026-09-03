"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { parseMoneyToCents } from "@/lib/pricing";
import {
  friendlyDbError,
  logActivity,
  optionalText,
  revalidateAdmin,
  text,
  type ActionResult,
} from "@/app/actions/shared";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function onDate(formData: FormData, key: string): string {
  const value = text(formData, key);
  return DATE_RE.test(value) ? value : today();
}

/* -------------------------------------------------------------------------- */
/* Payments                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Records money the office has actually received.
 *
 * This is the only thing that moves a balance. It replaces the old "mark as
 * paid", which stamped the timestamp rule 2 reads and recorded nothing, so a
 * reservation could sit there looking settled while the student still owed
 * every cent of it. Attaching the payment to a reservation is optional; when
 * it is attached, a trigger marks that reservation paid, which is how the car
 * stays out of the pool.
 *
 * Paying more than is owed is allowed on purpose -- it leaves the student in
 * credit, which they spend on the next rental.
 */
export async function addPaymentAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const userId = text(formData, "student_id");
  if (!userId) return { error: "Missing student." };

  const amountCents = parseMoneyToCents(text(formData, "amount"));
  if (amountCents === null || amountCents <= 0) {
    return { error: "Enter how much came in, e.g. 45 or 45.50." };
  }

  const method = text(formData, "method") as PaymentMethod;
  if (!PAYMENT_METHODS.some((m) => m.value === method)) {
    return { error: "Choose how it was paid." };
  }

  const { error } = await supabase.from("cars_payments").insert({
    user_id: userId,
    reservation_id: optionalText(formData, "reservation_id"),
    amount_cents: amountCents,
    method,
    reference: text(formData, "reference"),
    note: text(formData, "note"),
    paid_on: onDate(formData, "paid_on"),
    recorded_by: admin.userId,
  });

  if (error) return { error: friendlyDbError(error) };

  await logActivity(supabase, { userId: admin.userId, name: admin.profile.full_name }, {
    entityType: "payment",
    entityId: userId,
    action: "recorded a payment",
    detail: { amount_cents: amountCents, method },
  });

  revalidateAdmin();

  // Say what it did to the account, since that is the whole question the
  // office had when they opened the form.
  const { data: balance } = await supabase
    .from("cars_student_balances")
    .select("balance_cents")
    .eq("user_id", userId)
    .maybeSingle();

  const owed = (balance?.balance_cents as number | undefined) ?? 0;
  return {
    success:
      owed > 0
        ? `Payment recorded. Still ${formatDollars(owed)} owing.`
        : owed < 0
          ? `Payment recorded. ${formatDollars(-owed)} in credit.`
          : "Payment recorded. Account settled.",
  };
}

export async function deletePaymentAction(formData: FormData) {
  const admin = await requireAdmin();
  const supabase = await createClient();
  const id = text(formData, "payment_id");

  await supabase.from("cars_payments").delete().eq("id", id);
  await logActivity(supabase, { userId: admin.userId, name: admin.profile.full_name }, {
    entityType: "payment",
    entityId: id,
    action: "removed a payment",
  });

  revalidateAdmin();
}

/* -------------------------------------------------------------------------- */
/* Charges on the account                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A charge that is not a rental and not an incident on a car -- a share of a
 * repair, a fee, whatever the office needs to put on somebody's account. A
 * credit works the same way with the sign flipped, which is how the office
 * hands out a credit deliberately rather than by taking too much money.
 */
export async function addAccountChargeAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const userId = text(formData, "student_id");
  if (!userId) return { error: "Missing student." };

  const description = text(formData, "description");
  if (!description) return { error: "Say what the charge is for — it goes on the statement." };

  const amountCents = parseMoneyToCents(text(formData, "amount"));
  if (amountCents === null || amountCents <= 0) {
    return { error: "Enter an amount, e.g. 40 or 40.50." };
  }

  const isCredit = text(formData, "direction") === "credit";

  const { error } = await supabase.from("cars_charges").insert({
    user_id: userId,
    charged_on: onDate(formData, "charged_on"),
    description,
    amount_cents: isCredit ? -amountCents : amountCents,
    note: text(formData, "note"),
    created_by: admin.userId,
  });

  if (error) return { error: friendlyDbError(error) };

  await logActivity(supabase, { userId: admin.userId, name: admin.profile.full_name }, {
    entityType: "charge",
    entityId: userId,
    action: isCredit ? "credited an account" : "charged an account",
    detail: { amount_cents: amountCents, description },
  });

  revalidateAdmin();
  return { success: isCredit ? "Credit added." : "Charge added." };
}

export async function deleteAccountChargeAction(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("cars_charges").delete().eq("id", text(formData, "charge_id"));
  revalidateAdmin();
}

/* -------------------------------------------------------------------------- */
/* Line items on a reservation                                                */
/* -------------------------------------------------------------------------- */

/**
 * Adds a described charge or discount to one rental. The description is what
 * the student reads on their statement, so it is required.
 *
 * The reservation's own adjustment_cents and total_cents are recomputed by
 * database triggers, so nothing here has to do arithmetic.
 */
export async function addReservationItemAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const reservationId = text(formData, "reservation_id");
  if (!reservationId) return { error: "Missing reservation." };

  const kind = text(formData, "kind") === "discount" ? "discount" : "charge";

  const description = text(formData, "description");
  if (!description) {
    return {
      error:
        kind === "discount"
          ? "Say what the discount is for — the student sees it on their statement."
          : "Say what the charge is for — the student sees it on their statement.",
    };
  }

  const amountCents = parseMoneyToCents(text(formData, "amount"));
  if (amountCents === null || amountCents <= 0) {
    return { error: "Enter an amount, e.g. 25 or 25.50." };
  }

  const { error } = await supabase.from("cars_reservation_items").insert({
    reservation_id: reservationId,
    kind,
    description,
    amount_cents: amountCents,
    created_by: admin.userId,
  });

  if (error) return { error: friendlyDbError(error) };

  await logActivity(supabase, { userId: admin.userId, name: admin.profile.full_name }, {
    entityType: "reservation",
    entityId: reservationId,
    action: kind === "discount" ? "added a discount" : "added a line item",
    detail: { amount_cents: amountCents, description },
  });

  revalidateAdmin();
  return { success: kind === "discount" ? "Discount added." : "Line item added." };
}

export async function deleteReservationItemAction(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase
    .from("cars_reservation_items")
    .delete()
    .eq("id", text(formData, "item_id"));
  revalidateAdmin();
}

/** Local so this file does not pull the whole pricing module for one string. */
function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
