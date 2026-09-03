import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getViewer } from "@/lib/auth";
import { signOutAction } from "@/app/actions/auth";
import { Alert } from "@/components/ui";

export const metadata: Metadata = { title: "Account under review" };

export default async function PendingPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.profile?.status === "active") redirect("/");

  const locked = viewer.profile?.status === "locked";

  return (
    <div className="card-pad mx-auto max-w-md">
      <h1 className="text-xl font-bold text-ink">
        {locked ? "Your account is on hold" : "Thanks for registering"}
      </h1>

      <div className="mt-4">
        {locked ? (
          <Alert tone="error" title="Booking is turned off for this account">
            {viewer.profile?.locked_reason ||
              "Please speak with the office to get this sorted out."}
          </Alert>
        ) : (
          <Alert tone="info" title="The office needs to approve you first">
            We have your details. Once someone in the office activates your account
            you will be able to search for a car and send a reservation request.
          </Alert>
        )}
      </div>

      <dl className="mt-5 text-sm">
        <div className="flex justify-between border-b border-line/70 py-2">
          <dt className="text-ink-soft">Name</dt>
          <dd className="font-medium">{viewer.profile?.full_name || "--"}</dd>
        </div>
        <div className="flex justify-between border-b border-line/70 py-2">
          <dt className="text-ink-soft">Email</dt>
          <dd className="font-medium">{viewer.email}</dd>
        </div>
        <div className="flex justify-between py-2">
          <dt className="text-ink-soft">Phone</dt>
          <dd className="font-medium">{viewer.profile?.phone || "--"}</dd>
        </div>
      </dl>

      <form action={signOutAction} className="mt-5">
        <button type="submit" className="btn-secondary w-full">
          Sign out
        </button>
      </form>
    </div>
  );
}
