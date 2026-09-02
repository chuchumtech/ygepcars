import type { Metadata } from "next";
import { requireActiveStudent } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { AccountForm } from "./AccountForm";

export const metadata: Metadata = { title: "My details" };

export default async function AccountPage() {
  const viewer = await requireActiveStudent();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="My details"
        description="Keep this current so the office can reach you about a reservation."
      />
      <AccountForm profile={viewer.profile} />
    </div>
  );
}
