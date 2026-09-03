import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type EmailKind =
  | "new_request"
  | "cancellation"
  | "new_account"
  | "waitlist_join";

type SendArgs = {
  to: string[];
  subject: string;
  html: string;
  text: string;
  kind: EmailKind;
  entityType?: string;
  entityId?: string | null;
  replyTo?: string;
};

/** Recipients, from the env var, comma or newline separated. */
export function officeRecipients(): string[] {
  return (process.env.OFFICE_NOTIFICATION_EMAILS ?? "")
    .split(/[,\n]/)
    .map((address) => address.trim())
    .filter(Boolean);
}

export function emailConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY && process.env.EMAIL_FROM && officeRecipients().length,
  );
}

async function record(entry: {
  to: string;
  subject: string;
  kind: EmailKind;
  entityType: string;
  entityId: string | null;
  status: "sent" | "failed" | "skipped";
  providerId?: string;
  error?: string;
}) {
  try {
    const supabase = createAdminClient();
    await supabase.from("cars_email_log").insert({
      to_email: entry.to,
      subject: entry.subject,
      kind: entry.kind,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      status: entry.status,
      provider_id: entry.providerId ?? "",
      error: entry.error ?? "",
    });
  } catch {
    // The log is a convenience. Never let it be the thing that breaks a booking.
  }
}

/**
 * Sends one notification through Resend.
 *
 * This never throws. A student filing a request must not see an error because
 * the office's mail provider is having a bad day, so every failure is swallowed
 * and written to cars_email_log instead.
 */
export async function sendOfficeEmail(args: SendArgs): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from || args.to.length === 0) {
    await record({
      to: args.to.join(", ") || "(none configured)",
      subject: args.subject,
      kind: args.kind,
      entityType: args.entityType ?? "",
      entityId: args.entityId ?? null,
      status: "skipped",
      error: !apiKey
        ? "RESEND_API_KEY is not set"
        : !from
          ? "EMAIL_FROM is not set"
          : "OFFICE_NOTIFICATION_EMAILS is empty",
    });
    return false;
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: args.to,
        subject: args.subject,
        html: args.html,
        text: args.text,
        ...(args.replyTo ? { reply_to: args.replyTo } : {}),
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      name?: string;
    };

    if (!response.ok) {
      await record({
        to: args.to.join(", "),
        subject: args.subject,
        kind: args.kind,
        entityType: args.entityType ?? "",
        entityId: args.entityId ?? null,
        status: "failed",
        error: payload.message ?? `Resend returned ${response.status}`,
      });
      return false;
    }

    await record({
      to: args.to.join(", "),
      subject: args.subject,
      kind: args.kind,
      entityType: args.entityType ?? "",
      entityId: args.entityId ?? null,
      status: "sent",
      providerId: payload.id ?? "",
    });
    return true;
  } catch (error) {
    await record({
      to: args.to.join(", "),
      subject: args.subject,
      kind: args.kind,
      entityType: args.entityType ?? "",
      entityId: args.entityId ?? null,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
