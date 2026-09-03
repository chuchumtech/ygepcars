import "server-only";
import { formatDateTime, formatRange, describeDuration, hoursBetween } from "@/lib/dates";
import { formatMoney } from "@/lib/pricing";
import { siteUrl } from "@/lib/env";

const NAVY = "#213a6d";
const SLATE = "#425d77";
const GOLD = "#74662e";
const LINE = "#e3e6ed";
const INK = "#16202e";
const MUTED = "#5d6b7f";

type Row = { label: string; value: string; strong?: boolean };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Wraps the body in a plain table-based shell. Email clients are not browsers:
 * inline styles and tables, no flexbox, no external CSS.
 */
function shell(options: { heading: string; intro: string; rows: Row[]; ctaHref: string; ctaLabel: string; footnote?: string }): string {
  const rows = options.rows
    .map(
      (row) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid ${LINE};color:${MUTED};font-size:14px;">${escapeHtml(row.label)}</td>
          <td style="padding:8px 0;border-bottom:1px solid ${LINE};color:${INK};font-size:14px;text-align:right;${row.strong ? "font-weight:700;" : "font-weight:500;"}">${escapeHtml(row.value)}</td>
        </tr>`,
    )
    .join("");

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f7fa;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7fa;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${LINE};border-radius:12px;overflow:hidden;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <tr>
              <td style="padding:20px 24px;border-bottom:3px solid ${GOLD};">
                <p style="margin:0;color:${SLATE};font-size:15px;font-weight:700;letter-spacing:.3px;">
                  Yeshiva Gedolah of Elkins Park
                </p>
                <p style="margin:2px 0 0;color:${MUTED};font-size:12px;">Car rental &mdash; office notification</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <h1 style="margin:0 0 6px;color:${NAVY};font-size:19px;line-height:1.3;">${escapeHtml(options.heading)}</h1>
                <p style="margin:0 0 18px;color:${MUTED};font-size:14px;line-height:1.5;">${escapeHtml(options.intro)}</p>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>

                <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:22px;">
                  <tr>
                    <td style="background:${NAVY};border-radius:8px;">
                      <a href="${options.ctaHref}" style="display:inline-block;padding:11px 22px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">${escapeHtml(options.ctaLabel)}</a>
                    </td>
                  </tr>
                </table>

                ${options.footnote ? `<p style="margin:18px 0 0;color:${MUTED};font-size:12px;line-height:1.5;">${escapeHtml(options.footnote)}</p>` : ""}
              </td>
            </tr>
            <tr>
              <td style="padding:14px 24px;background:#f6f7fa;border-top:1px solid ${LINE};">
                <p style="margin:0;color:${MUTED};font-size:11px;">
                  Sent automatically by the car rental system. Students are not copied on this.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function plain(heading: string, intro: string, rows: Row[], ctaHref: string): string {
  const body = rows.map((row) => `${row.label}: ${row.value}`).join("\n");
  return `${heading}\n\n${intro}\n\n${body}\n\nOpen the office portal: ${ctaHref}\n`;
}

/* -------------------------------------------------------------------------- */

export type ReservationEmailInput = {
  reference: string;
  studentName: string;
  studentEmail: string;
  studentPhone: string;
  vehicleName: string;
  startsAt: string;
  endsAt: string;
  destinationLabel: string;
  purpose: string;
  totalCents: number;
  tollCents: number;
  studentNotes: string;
};

export function newRequestEmail(input: ReservationEmailInput) {
  const heading = `${input.studentName} requested the ${input.vehicleName}`;
  const intro = "A new reservation request is waiting for a decision.";
  const href = `${siteUrl()}/admin/requests`;

  const rows: Row[] = [
    { label: "Reference", value: input.reference },
    { label: "Student", value: input.studentName },
    { label: "Phone", value: input.studentPhone || "not given" },
    { label: "Email", value: input.studentEmail },
    { label: "Car", value: input.vehicleName },
    { label: "Picks up", value: formatDateTime(input.startsAt) },
    { label: "Returns", value: formatDateTime(input.endsAt) },
    { label: "Length", value: describeDuration(hoursBetween(input.startsAt, input.endsAt)) },
    { label: "Heading to", value: input.destinationLabel || "not given" },
    { label: "Reason", value: input.purpose || "not given" },
    { label: "Tolls", value: formatMoney(input.tollCents) },
    { label: "Estimated total", value: formatMoney(input.totalCents), strong: true },
  ];

  return {
    subject: `Car request: ${input.studentName} — ${formatRange(input.startsAt, input.endsAt)}`,
    html: shell({
      heading,
      intro,
      rows,
      ctaHref: href,
      ctaLabel: "Review the request",
      footnote: input.studentNotes ? `Note from the student: ${input.studentNotes}` : undefined,
    }),
    text: plain(heading, intro, rows, href),
  };
}

export function cancellationEmail(input: ReservationEmailInput & { wasApproved: boolean }) {
  const heading = input.wasApproved
    ? `${input.studentName} cancelled a confirmed booking`
    : `${input.studentName} withdrew a request`;
  const intro = input.wasApproved
    ? "A car that was booked is now free again."
    : "A pending request has been withdrawn; nothing to decide.";
  const href = `${siteUrl()}/admin`;

  const rows: Row[] = [
    { label: "Reference", value: input.reference },
    { label: "Student", value: input.studentName },
    { label: "Car", value: input.vehicleName },
    { label: "Was booked for", value: formatRange(input.startsAt, input.endsAt) },
    { label: "Heading to", value: input.destinationLabel || "not given" },
  ];

  return {
    subject: `Cancelled: ${input.studentName} — ${input.vehicleName}`,
    html: shell({
      heading,
      intro,
      rows,
      ctaHref: href,
      ctaLabel: "Open the calendar",
      footnote: input.wasApproved
        ? "Check the waitlist — somebody may be waiting for this window."
        : undefined,
    }),
    text: plain(heading, intro, rows, href),
  };
}

export function newAccountEmail(input: { name: string; email: string; phone: string }) {
  const heading = `${input.name} registered for a car account`;
  const intro = "A new account is waiting to be approved before they can book.";
  const href = `${siteUrl()}/admin/requests`;

  const rows: Row[] = [
    { label: "Name", value: input.name },
    { label: "Email", value: input.email },
    { label: "Phone", value: input.phone || "not given" },
    { label: "Registered", value: formatDateTime(new Date()) },
  ];

  return {
    subject: `New car account: ${input.name}`,
    html: shell({ heading, intro, rows, ctaHref: href, ctaLabel: "Approve or turn down" }),
    text: plain(heading, intro, rows, href),
  };
}

export function waitlistEmail(input: {
  studentName: string;
  studentPhone: string;
  vehicleName: string;
  startsAt: string;
  endsAt: string;
  destinationLabel: string;
  flexible: boolean;
  totalWaiting: number;
}) {
  const heading = `${input.studentName} joined the waitlist`;
  const intro = "The window they wanted is already taken, so they asked to be told if it frees up.";
  const href = `${siteUrl()}/admin/waitlist`;

  const rows: Row[] = [
    { label: "Student", value: input.studentName },
    { label: "Phone", value: input.studentPhone || "not given" },
    { label: "Car", value: input.vehicleName },
    { label: "Wanted for", value: formatRange(input.startsAt, input.endsAt) },
    { label: "Heading to", value: input.destinationLabel || "not given" },
    { label: "Nearby times work?", value: input.flexible ? "Yes" : "No" },
    { label: "Now waiting on this window", value: String(input.totalWaiting), strong: true },
  ];

  return {
    subject: `Waitlist: ${input.studentName} — ${input.vehicleName}`,
    html: shell({ heading, intro, rows, ctaHref: href, ctaLabel: "Open the waitlist" }),
    text: plain(heading, intro, rows, href),
  };
}
