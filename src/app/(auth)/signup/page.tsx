import Link from "next/link";
import type { Metadata } from "next";
import { SignupForm } from "./SignupForm";

export const metadata: Metadata = { title: "Create an account" };

export default function SignupPage() {
  return (
    <div className="card-pad">
      <h1 className="text-xl font-bold text-slate-500">Create your account</h1>
      <p className="mt-1 text-sm text-muted">
        The office reviews new accounts before you can request a car. This usually
        takes a day or less.
      </p>
      <SignupForm />
      <p className="mt-5 border-t border-[var(--color-line)] pt-4 text-center text-sm text-muted">
        Already registered?{" "}
        <Link href="/login" className="link">
          Sign in
        </Link>
      </p>
    </div>
  );
}
