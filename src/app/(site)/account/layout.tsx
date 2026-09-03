import { requireActiveStudent } from "@/lib/auth";
import { AccountNav } from "./AccountNav";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireActiveStudent();

  return (
    <div className="py-8">
      <h1 className="text-2xl font-extrabold tracking-tight text-ink">
        {viewer.profile.first_name ? `Hello, ${viewer.profile.first_name}` : "My account"}
      </h1>
      <AccountNav />
      <div className="mt-6">{children}</div>
    </div>
  );
}
