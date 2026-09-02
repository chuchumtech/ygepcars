"use client";

import { useActionState } from "react";
import { signUpAction, type AuthFormState } from "@/app/actions/auth";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert, Field } from "@/components/ui";

export function SignupForm() {
  const [state, action] = useActionState<AuthFormState, FormData>(signUpAction, {});

  return (
    <form action={action} className="mt-5 space-y-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <Field label="Full name">
        <input className="input" name="full_name" autoComplete="name" required autoFocus />
      </Field>

      <Field label="Email">
        <input className="input" type="email" name="email" autoComplete="email" required />
      </Field>

      <Field label="Cell phone" hint="So the office can reach you about a reservation.">
        <input className="input" type="tel" name="phone" autoComplete="tel" required />
      </Field>

      <Field label="Password" hint="At least 8 characters.">
        <input
          className="input"
          type="password"
          name="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </Field>

      <Field label="Confirm password">
        <input
          className="input"
          type="password"
          name="confirm_password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </Field>

      <SubmitButton className="btn-primary w-full" pendingLabel="Creating account...">
        Create account
      </SubmitButton>
    </form>
  );
}
