import type { Metadata } from "next";
import { requireActiveStudent } from "@/lib/auth";
import { AccountForm } from "./AccountForm";

export const metadata: Metadata = { title: "My details" };

export default async function AccountDetailsPage() {
  const viewer = await requireActiveStudent();
  return (
    <div className="max-w-2xl">
      <AccountForm profile={viewer.profile} />
    </div>
  );
}
