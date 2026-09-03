import Link from "next/link";
import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; registered?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="card-pad mx-auto max-w-md">
      <h1 className="text-xl font-bold text-ink">Sign in</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Use the email and password you registered with.
      </p>
      <LoginForm next={params.next ?? "/"} />
      <p className="mt-5 border-t border-line/70 pt-4 text-center text-sm text-ink-soft">
        First time here?{" "}
        <Link href="/signup" className="link">
          Create an account
        </Link>
      </p>
    </div>
  );
}
