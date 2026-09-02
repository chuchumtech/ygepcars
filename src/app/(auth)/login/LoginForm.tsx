"use client";

import { useActionState } from "react";
import { signInAction, type AuthFormState } from "@/app/actions/auth";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert, Field } from "@/components/ui";

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState<AuthFormState, FormData>(signInAction, {});

  return (
    <form action={action} className="mt-5 space-y-4">
      <input type="hidden" name="next" value={next} />

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <Field label="Email">
        <input
          className="input"
          type="email"
          name="email"
          autoComplete="email"
          required
          autoFocus
        />
      </Field>

      <Field label="Password">
        <input
          className="input"
          type="password"
          name="password"
          autoComplete="current-password"
          required
        />
      </Field>

      <SubmitButton className="btn-primary w-full" pendingLabel="Signing in...">
        Sign in
      </SubmitButton>
    </form>
  );
}
