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
    <div className="card-pad">
      <h1 className="text-xl font-bold text-navy-800">Sign in</h1>
      <p className="mt-1 text-sm text-muted">
        Use the email and password you registered with.
      </p>
      <LoginForm next={params.next ?? "/"} />
      <p className="mt-5 border-t border-[var(--color-line)] pt-4 text-center text-sm text-muted">
        First time here?{" "}
        <Link href="/signup" className="link">
          Create an account
        </Link>
      </p>
    </div>
  );
}
